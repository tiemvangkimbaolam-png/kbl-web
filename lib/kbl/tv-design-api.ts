import * as S from "./store";
import { tvDesignSchema, defaultTVDesign, websiteTVTheme } from "./tv-design";
import { z } from "zod";
export async function readTVDesign() {
  const row = await S.get("tv-design", "main");
  const parsed = tvDesignSchema.safeParse(row?.design);
  return {
    design: parsed.success ? websiteTVTheme(parsed.data) : defaultTVDesign(),
    version: row?.version || 0,
  };
}
export async function saveTVDesign(input: unknown) {
  const v = z
    .object({ design: tvDesignSchema, version: z.number().int().min(0) })
    .strict()
    .parse(input);
  const old = await S.get("tv-design", "main");
  if ((old?.version || 0) !== v.version)
    throw Object.assign(
      Error(
        "Mẫu TV đã được lưu ở cửa sổ khác. Tải bản đã lưu trước khi sửa tiếp.",
      ),
      { status: 409 },
    );
  if (old) await S.put("tv-design", "main", { design: v.design }, v.version);
  else {
    const at = Date.now();
    const r = await S.sql()
      .prepare(
        "INSERT INTO records(kind,id,data,created_at,updated_at) VALUES('tv-design','main',?,?,?) ON CONFLICT(kind,id) DO NOTHING",
      )
      .bind(JSON.stringify({ design: v.design }), at, at)
      .run();
    if (r.meta.changes !== 1)
      throw Object.assign(
        Error("Mẫu TV vừa thay đổi. Tải lại trước khi lưu."),
        { status: 409 },
      );
  }
  return await readTVDesign();
}
