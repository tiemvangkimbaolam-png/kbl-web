import { z } from "zod";
export const TV_FONTS = {
  vietnam: "'Be Vietnam Pro',Arial,sans-serif",
  arial: "Arial,Helvetica,sans-serif",
  serif: "'Playfair Display',Georgia,serif",
  times: "'Times New Roman',Times,serif",
  mono: "Consolas,monospace",
} as const;
export const TV_PARTS = {
  title: "Tên tiệm",
  address: "Địa chỉ / điện thoại",
  subtitle: "Đơn vị",
  table: "Bảng giá",
  headers: "Tiêu đề cột",
  labels: "Loại vàng",
  buy: "Giá mua vào",
  sell: "Giá bán ra",
  footer: "Thời điểm cập nhật",
} as const;
export type TVPart = keyof typeof TV_PARTS;
export const TV_CELL_PARTS = Object.fromEntries([
  ["head-labels", "Tiêu đề loại vàng"], ["head-buy", "Tiêu đề mua vào"], ["head-sell", "Tiêu đề bán ra"],
  ...["9999", "980", "610"].flatMap(code => [
    ["labels-"+code, "Loại vàng "+(code === "9999" ? "999.9" : code)],
    ["buy-"+code, "Mua vào · "+(code === "9999" ? "999.9" : code)],
    ["sell-"+code, "Bán ra · "+(code === "9999" ? "999.9" : code)],
  ]),
]) as Record<string, string>;
const cellKey = z.string().refine(key => Object.hasOwn(TV_CELL_PARTS, key), "Ô giá không hợp lệ.");
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const typography = z
  .object({
    font: z.enum(["vietnam", "arial", "serif", "times", "mono"]),
    size: z.number().min(16).max(160),
    weight: z.enum(["400", "600", "700", "900"]),
    color,
    align: z.enum(["left", "center", "right"]),
  })
  .strict();
const box = z
  .object({
    x: z.number().min(0).max(1520),
    y: z.number().min(0).max(876),
    w: z.number().min(80).max(1600),
    h: z.number().min(24).max(900),
    visible: z.boolean(),
    locked: z.boolean().optional(),
  })
  .strict();
const layerSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,60}$/),
    type: z.enum(["text", "rect", "image"]),
    name: z.string().max(80),
    box,
    style: typography,
    text: z.string().max(500),
    fill: color,
    radius: z.number().min(0).max(200),
    opacity: z.number().min(0.05).max(1),
    position: z.enum(["back", "front"]),
    src: z.string().regex(/^(?:|\/kbl-logo\.png|\/api\/media\/[a-f0-9]{64})$/),
  })
  .strict();
export const tvDesignSchema = z
  .object({
    schema: z.literal(1),
    themeVersion: z.literal(1).optional(),
    layers: z.array(layerSchema).max(20).default([]),
    cells: z.record(cellKey, box).default({}),
    cellStyles: z.record(cellKey, typography).default({}),
    compactPrices: z.boolean().optional(),
    background: color,
    lineColor: color,
    rowBackground: color,
    lines: z.boolean(),
    rowFill: z.boolean(),
    titleText: z.string().trim().max(160),
    addressText: z.string().trim().max(300),
    subtitleText: z.string().trim().max(120),
    buyText: z.string().trim().min(1).max(40),
    sellText: z.string().trim().min(1).max(40),
    boxes: z
      .object({
        title: box,
        address: box,
        subtitle: box,
        table: box,
        footer: box,
      })
      .strict(),
    styles: z
      .object({
        title: typography,
        address: typography,
        subtitle: typography,
        headers: typography,
        labels: typography,
        buy: typography,
        sell: typography,
        footer: typography,
      })
      .strict(),
  })
  .strict()
  .superRefine((v, ctx) => {
    for (const [key, b] of [
      ...Object.entries(v.boxes),
      ...Object.entries(v.cells),
      ...v.layers.map((l) => ["layer:" + l.id, l.box] as const),
    ])
      if (b.x + b.w > 1600 || b.y + b.h > 900)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["boxes", key],
          message: "Phần tử phải nằm trong khung TV 1600 × 900.",
        });
    if (new Set(v.layers.map((l) => l.id)).size !== v.layers.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ID lớp bị trùng.",
      });
  });
export type TVDesign = z.infer<typeof tvDesignSchema>;
export function defaultTVDesign(): TVDesign {
  const type = (
    size: number,
    weight: "400" | "600" | "700" | "900" = "700",
    align: "left" | "center" | "right" = "center",
  ) => ({ font: "arial" as const, size, weight, color: "#102c43", align });
  const design: TVDesign = {
    schema: 1,
    themeVersion: 1,
    layers: [],
    cells: {},
    cellStyles: {},
    background: "#fffdfb",
    lineColor: "#ead1bf",
    rowBackground: "#fff2e9",
    lines: true,
    rowFill: true,
    titleText: "",
    addressText: "",
    subtitleText: "BẢNG GIÁ VÀNG · ĐỒNG / CHỈ",
    buyText: "Mua vào",
    sellText: "Bán ra",
    boxes: {
      title: { x: 50, y: 28, w: 1500, h: 100, visible: true },
      address: { x: 60, y: 136, w: 1480, h: 55, visible: true },
      subtitle: { x: 60, y: 206, w: 1480, h: 40, visible: true },
      table: { x: 36, y: 276, w: 1500, h: 520, visible: true },
      footer: { x: 60, y: 835, w: 1480, h: 42, visible: true },
    },
    styles: {
      title: { ...type(68, "900"), font: "times", color: "#9b4d2d" },
      address: { ...type(26, "600"), color: "#65717d" },
      subtitle: { ...type(25, "600"), color: "#9b4d2d" },
      headers: { ...type(52, "700"), color: "#9b4d2d" },
      labels: type(64, "900"),
      buy: type(70, "900"),
      sell: { ...type(70, "900"), color: "#9b4d2d" },
      footer: { ...type(24, "400", "left"), color: "#65717d" },
    },
  };
  return separateTVCells(design);
}
export function websiteTVTheme(design: TVDesign): TVDesign {
  if (design.themeVersion === 1) return separateTVCells(design);
  const next = structuredClone(design), theme = defaultTVDesign();
  next.themeVersion = 1;
  next.background = theme.background; next.lineColor = theme.lineColor;
  next.rowBackground = theme.rowBackground; next.rowFill = true;
  for (const part of Object.keys(next.styles) as (keyof TVDesign["styles"])[])
    next.styles[part].color = theme.styles[part].color;
  next.boxes.table.x = Math.max(0, next.boxes.table.x - 14);
  return separateTVCells(next);
}
export function tvPreset(name: string): TVDesign {
  const d = defaultTVDesign();
  if (name === "white") {
    d.background = "#ffffff";
    d.lineColor = "#b8c5d0";
    d.rowBackground = "#edf4f8";
    d.rowFill = true;
  }
  if (name === "dark") {
    d.background = "#092d4b";
    d.lineColor = "#b99a52";
    d.rowBackground = "#153e5b";
    d.rowFill = true;
    for (const s of Object.values(d.styles)) s.color = "#fff2cd";
    d.styles.buy.color = "#ffffff";
    d.styles.sell.color = "#ffd66b";
  }
  return d;
}

export type TVLayer = TVDesign["layers"][number];
export function tvBox(d: TVDesign, part: string) {
  if (part.startsWith("cell:")) return d.cells?.[part.slice(5)] || baseCellBox(d, part.slice(5));
  return part.startsWith("layer:")
    ? d.layers.find((l) => "layer:" + l.id === part)?.box || d.boxes.title
    : d.boxes[
        (["headers", "labels", "buy", "sell"].includes(part)
          ? "table"
          : part) as keyof TVDesign["boxes"]
      ];
}
export function tvStyle(d: TVDesign, part: string) {
  if (part.startsWith("cell:")) return d.cellStyles?.[part.slice(5)] || d.styles[cellStylePart(part.slice(5))];
  if (part.startsWith("layer:")) {
    const l = d.layers.find((l) => "layer:" + l.id === part);
    return l?.type === "text" ? l.style : null;
  }
  return part === "table" ? null : d.styles[part as keyof TVDesign["styles"]];
}

function cellStylePart(key: string): "headers" | "labels" | "buy" | "sell" {
  return key.startsWith("head-") ? "headers" : key.split("-")[0] as "labels" | "buy" | "sell";
}
function baseCellBox(d: TVDesign, key: string) {
  const b=d.boxes.table, isHead=key.startsWith("head-"), [part,code]=key.split("-");
  const col=["labels","buy","sell"].indexOf(isHead?code:part), row=isHead?0:["9999","980","610"].indexOf(code)+1;
  return {x:b.x+col*b.w/3,y:b.y+row*b.h/4,w:b.w/3,h:b.h/4,visible:true};
}
// Legacy designs acquire independent cells without moving any saved element.
export function separateTVCells(design: TVDesign): TVDesign {
  const d=structuredClone(design); d.cells ||= {}; d.cellStyles ||= {};
  for(const key of Object.keys(TV_CELL_PARTS)) d.cells[key] ||= baseCellBox(d,key);
  return d;
}
export function editableTVStyle(d: TVDesign, part: string) {
  if(part.startsWith("cell:")) {
    const key=part.slice(5);d.cellStyles ||= {};
    return d.cellStyles[key] ||= {...d.styles[cellStylePart(key)]};
  }
  return tvStyle(d,part)!;
}
export function setTVBox(d: TVDesign, part: string, update: Partial<TVDesign["boxes"]["table"]>) {
  const b=tvBox(d,part), old={...b};
  if(b.locked && update.locked !== false) return;
  Object.assign(b,update);
  if(part === "table" && ["x","y","w","h"].some(k => k in update)) {
    for(const cell of Object.values(d.cells)) {
      cell.w=Math.max(80,Math.min(1600,cell.w*b.w/old.w));
      cell.h=Math.max(24,Math.min(900,cell.h*b.h/old.h));
      cell.x=Math.max(0,Math.min(1600-cell.w,b.x+(cell.x-old.x)*b.w/old.w));
      cell.y=Math.max(0,Math.min(900-cell.h,b.y+(cell.y-old.y)*b.h/old.h));
    }
  }
}
// Explicit owner action: retain branding/layers, enlarge just the price area.
export function readableTVPrices(design: TVDesign): TVDesign {
  const d=separateTVCells(design);
  d.boxes.table={x:32,y:264,w:1536,h:548,visible:true};
  d.compactPrices=true;
  const columns=[{x:40,w:426},{x:506,w:500},{x:1058,w:500}];
  for(const key of Object.keys(TV_CELL_PARTS)) {
    const isHead=key.startsWith("head-"),[part,code]=key.split("-"), col=columns[["labels","buy","sell"].indexOf(isHead?code:part)];
    const row=isHead?0:["9999","980","610"].indexOf(code)+1;
    d.cells[key]={...col,y:264+row*137,h:137,visible:true};
    const s=editableTVStyle(d,"cell:"+key);s.size=Math.max(s.size,isHead?58:part === "labels"?84:94);s.weight="900";
  }
  return d;
}
