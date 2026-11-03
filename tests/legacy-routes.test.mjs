import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { legacyRoute } from "../lib/kbl/legacy-routes.mjs";
test("old Vietnamese links resolve to their actual pages, preserving search parameters", () => {
  assert.equal(legacyRoute(["vi"]), "/");
  for (const p of [
    "tv",
    "bang-gia",
    "tin-tuc",
    "dang-nhap",
    "khach-hang",
    "tra-cuu",
    "gio-hang",
    "chinh-sach",
  ])
    assert.equal(legacyRoute(["vi", p]), "/" + p);
  assert.equal(
    legacyRoute(["vi", "dang-nhap"], {
      return: "/khach-hang",
      tag: ["a", "b"],
    }),
    "/dang-nhap?return=%2Fkhach-hang&tag=a&tag=b",
  );
  assert.equal(
    legacyRoute(["vi", "tin-tuc", "id-fixture"]),
    "/tin-tuc/id-fixture",
  );
  assert.equal(
    legacyRoute(["vi", "bao-hanh", "token-fixture"]),
    "/bao-hanh/token-fixture",
  );
  assert.equal(legacyRoute(["vi", "admin", "bang-gia"]), "/admin/bang-gia");
});
test("products retain the existing canonical detail route and category alias opens product section", () => {
  assert.equal(
    legacyRoute(["san-pham", "MẪU 01"]),
    "/vi/san-pham/M%E1%BA%AAU%2001",
  );
  assert.equal(legacyRoute(["san-pham"]), "/#products");
  assert.equal(legacyRoute(["vi", "san-pham"]), "/#products");
  assert.equal(legacyRoute(["vi", "san-pham", "SKU"]), null);
  assert.ok(fs.existsSync("app/vi/san-pham/[sku]/page.tsx"));
});
test("localized policy aliases point to real static documents, unknown/private API and unsafe routes are not swallowed", () => {
  for (const file of fs
    .readdirSync("public")
    .filter(
      (x) =>
        x.endsWith(".html") || x === "chinh-sach-tri-an-khach-hang-than-thiet",
    ))
    assert.equal(legacyRoute(["vi", file]), "/" + file);
  assert.equal(legacyRoute(["vi", "chinh-sach-gia"]), "/chinh-sach-gia");
  for (const p of [
    ["vi", "api", "admin"],
    ["vi", "api", "worker"],
    ["api", "public", "catalog"],
    ["vi", "not-a-page"],
    ["not-a-page"],
    ["vi", "..", "admin"],
    ["vi", "/evil"],
    ["vi", "\\evil"],
    ["en"],
  ])
    assert.equal(legacyRoute(p), null);
});
