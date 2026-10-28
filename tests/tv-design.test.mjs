import { before, test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const { build } = createRequire(
  fs.realpathSync("node_modules/wrangler/package.json"),
)("esbuild");
const db = new DatabaseSync(":memory:");
let handle, defaults, schema;
const owner = {
  "Content-Type": "application/json",
  "oai-authenticated-user-id": "fixture",
  "oai-authenticated-user-email": "vlam1881997@gmail.com",
};
async function call(route, method = "GET", data, headers = owner) {
  const r = await handle(
    new Request("https://kbl.test/api/" + route, {
      method,
      headers,
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    }),
  );
  return { status: r.status, data: await r.json() };
}
before(async () => {
  for (const f of fs
    .readdirSync("drizzle")
    .filter((x) => x.endsWith(".sql"))
    .sort())
    db.exec(
      fs
        .readFileSync("drizzle/" + f, "utf8")
        .replaceAll("--> statement-breakpoint", ""),
    );
  const DB = {
    prepare(q) {
      let a = [];
      const s = {
        bind(...p) {
          a = p;
          return s;
        },
        async first() {
          return db.prepare(q).get(...a) || null;
        },
        async all() {
          return { results: db.prepare(q).all(...a) };
        },
        async run() {
          return { meta: { changes: Number(db.prepare(q).run(...a).changes) } };
        },
      };
      return s;
    },
  };
  globalThis.__TV_ENV = { DB };
  await build({
    entryPoints: ["lib/kbl/api.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: ".sites-runtime/test-tv-api.mjs",
    plugins: [
      {
        name: "env",
        setup(b) {
          b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({
            path: "env",
            namespace: "tv",
          }));
          b.onLoad({ filter: /.*/, namespace: "tv" }, () => ({
            contents: "export const env=globalThis.__TV_ENV;",
          }));
        },
      },
    ],
  });
  handle = (await import(path.resolve(".sites-runtime/test-tv-api.mjs")))
    .handle;
  await build({
    entryPoints: ["lib/kbl/tv-design.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: ".sites-runtime/test-tv-schema.mjs",
  });
  const m = await import(path.resolve(".sites-runtime/test-tv-schema.mjs"));
  defaults = m.defaultTVDesign;
  schema = m.tvDesignSchema;
});
test("TV design defaults have no fixture prices; only owner may save, public reads allowlisted design", async () => {
  const first = await call("public/tv-design", "GET", undefined, {});
  assert.equal(first.status, 200);
  assert.equal(first.data.version, 0);
  assert(schema.safeParse(first.data.design).success);
  assert.equal(
    (
      await call(
        "admin/tv-design",
        "POST",
        { design: first.data.design, version: 0 },
        { "Content-Type": "application/json" },
      )
    ).status,
    401,
  );
  const d = defaults();
  d.styles.buy.size = 80;
  d.titleText = "Bảng của tiệm";
  const saved = await call("admin/tv-design", "POST", {
    design: d,
    version: 0,
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.version, 1);
  const read = await call("public/tv-design", "GET", undefined, {});
  assert.deepEqual(read.data, saved.data);
  assert(!JSON.stringify(read.data).includes("token"));
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM records WHERE kind='price'").get().n,
    0,
  );
});
test("TV layout rejects stale saves, arbitrary CSS, missing fields, oversized elements and client price edits", async () => {
  const current = (await call("admin/tv-design")).data;
  for (const mutate of [
    (d) => (d.background = "url(https://evil.test)"),
    (d) => (d.styles.buy.font = "external"),
    (d) => (d.boxes.title.x = 1599),
    (d) => (d.styles.buy.size = NaN),
    (d) => (d.prices = [123]),
    (d) => delete d.boxes.table,
  ]) {
    const d = structuredClone(current.design);
    mutate(d);
    assert.equal(
      (
        await call("admin/tv-design", "POST", {
          design: d,
          version: current.version,
        })
      ).status,
      422,
    );
  }
  assert.equal(
    (
      await call("admin/tv-design", "POST", {
        design: current.design,
        version: 0,
      })
    ).status,
    409,
  );
  const d = structuredClone(current.design);
  d.background = "#ffffff";
  assert.equal(
    (
      await call("admin/tv-design", "POST", {
        design: d,
        version: current.version,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("admin/tv-design", "POST", {
        design: current.design,
        version: current.version,
      })
    ).status,
    409,
  );
});
test("first TV save has an atomic create guard when two editors start before any saved design", async () => {
  db.prepare("DELETE FROM records WHERE kind='tv-design'").run();
  const body = { design: defaults(), version: 0 };
  const responses = await Promise.all([
    call("admin/tv-design", "POST", body),
    call("admin/tv-design", "POST", body),
  ]);
  assert.deepEqual(responses.map((x) => x.status).sort(), [200, 409]);
});
test("shared TV board renders saved typography, actual price units and text safely without fake values", async () => {
  await build({
    entryPoints: ["app/components/tv-board.tsx"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: ".sites-runtime/test-tv-board.mjs",
    external: ["react", "react/jsx-runtime", "lucide-react"],
  });
  const { TVBoard } = await import(
    path.resolve(".sites-runtime/test-tv-board.mjs")
  );
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const d = defaults();
  d.titleText = "<script>alert(1)</script>";
  d.styles.buy.color = "#123456";
  const html = renderToStaticMarkup(
    createElement(TVBoard, {
      design: d,
      catalog: {
        prices: [
          {
            id: "p",
            code: "9999",
            buy: 130000000,
            sell: 135000000,
            unit: "đồng/lượng",
            capturedAt: Date.now(),
          },
        ],
        company: {},
      },
    }),
  );
  assert(html.includes("13.000.000"));
  assert(html.includes("13.500.000"));
  assert(html.includes("#123456"));
  assert(!html.includes("<script>"));
  assert(html.includes("&lt;script&gt;"));
  assert(!html.includes("Vàng 610"));
  const empty = renderToStaticMarkup(
    createElement(TVBoard, { design: d, catalog: { prices: [] } }),
  );
  assert(empty.includes("Chờ bảng giá"));
  assert(!empty.includes("13.000.000"));
});

test("saved canvas layers remain compatible with old designs and reject duplicate IDs, external images and overflow", async () => {
  const layer = {
    id: "canvas-fixture",
    type: "text",
    name: "Chữ trang trí",
    box: { x: 100, y: 100, w: 500, h: 100, visible: true, locked: true },
    style: { ...defaults().styles.title, size: 40 },
    text: "Tiệm vàng\nKim Bảo Lâm",
    fill: "#ffffff",
    radius: 12,
    opacity: 0.8,
    position: "front",
    src: "",
  };
  const old = defaults();
  delete old.layers;
  assert.deepEqual(schema.parse(old).layers, []);
  const d = defaults();
  d.layers = [layer];
  assert(schema.safeParse(d).success);
  for (const mutate of [
    (x) => x.layers.push({ ...layer }),
    (x) => (x.layers[0].src = "javascript:alert(1)"),
    (x) => (x.layers[0].src = "https://outside.test/image.png"),
    (x) => (x.layers[0].box.x = 1500),
    (x) => {
      x.boxes.title.x = 1599;
      x.layers[0].id = "title";
    },
    (x) =>
      (x.layers = Array.from({ length: 21 }, (_, i) => ({
        ...layer,
        id: "layer-" + i,
      }))),
  ]) {
    const value = structuredClone(d);
    mutate(value);
    assert(!schema.safeParse(value).success);
  }
  const current = (await call("admin/tv-design")).data;
  const result = await call("admin/tv-design", "POST", {
    design: d,
    version: current.version,
  });
  assert.equal(result.status, 200);
  assert.deepEqual(
    (await call("public/tv-design", "GET", undefined, {})).data.design.layers,
    [layer],
  );
});
test("TV image upload requires owner, checks image type/size/magic, honors storage and serves the intended image publicly", async () => {
  const files = new Map();
  globalThis.__TV_ENV.BUCKET = {
    async head(k) {
      return files.has(k) ? { size: files.get(k).byteLength } : null;
    },
    async put(k, v) {
      files.set(k, new Uint8Array(v));
    },
    async get(k) {
      const b = files.get(k);
      return b ? { body: b, size: b.byteLength } : null;
    },
  };
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1sAAAAASUVORK5CYII=",
    "base64",
  );
  async function upload(data, mime = "image/png", auth = true) {
    return handle(
      new Request("https://kbl.test/api/admin/tv-image", {
        method: "POST",
        headers: { ...(auth ? owner : {}), "Content-Type": mime },
        body: data,
      }),
    );
  }
  assert.equal((await upload(png, "image/png", false)).status, 401);
  assert.equal((await upload("<svg/>", "image/svg+xml")).status, 415);
  assert.equal((await upload("not-an-image")).status, 415);
  assert.equal((await upload(new Uint8Array(1500001))).status, 413);
  const uploaded = await upload(png);
  assert.equal(uploaded.status, 200);
  const image = await uploaded.json();
  assert.match(image.url, /^\/api\/media\/[a-f0-9]{64}$/);
  const publicRead = await handle(new Request("https://kbl.test" + image.url));
  assert.equal(publicRead.status, 200);
  assert.deepEqual(Buffer.from(await publicRead.arrayBuffer()), png);
  const count = files.size;
  assert.equal((await upload(png)).status, 200);
  assert.equal(files.size, count);
  db.prepare(
    "INSERT OR REPLACE INTO records(kind,id,data,created_at,updated_at) VALUES('settings','main',?,1,1)",
  ).run(JSON.stringify({ storageLimitMB: 0 }));
  const other = Buffer.concat([png, Buffer.from([1])]);
  assert.equal((await upload(other)).status, 507);
  assert.equal(files.size, count);
});
