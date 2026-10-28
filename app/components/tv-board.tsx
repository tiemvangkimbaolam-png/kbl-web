"use client";
import { useRef, useLayoutEffect, useEffect } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { TV_PARTS, TV_FONTS, type TVDesign, type TVPart } from "@/lib/kbl/tv-design";
import { displayGoldPrices } from "@/lib/kbl/display-prices.mjs";
import { cash, date } from "./ui";
import { perChi } from "./reference-home/tools.mjs";
type Props = {
  design: TVDesign;
  catalog: any;
  selected?: TVPart;
  onSelect?: (part: TVPart) => void;
  onMove?: (part: TVPart, x: number, y: number) => void;
};
export function TVBoard({
  design: d,
  catalog,
  selected,
  onSelect,
  onMove,
}: Props) {
  const ref = useRef<SVGSVGElement>(null),
    drag = useRef<{
      part: TVPart;
      x: number;
      y: number;
      sx: number;
      sy: number;
    } | null>(null);
  function fitText() {
    ref.current
      ?.querySelectorAll<SVGTextElement>("text[data-fit-width]")
      .forEach((node) => {
        node.removeAttribute("textLength");
        node.removeAttribute("lengthAdjust");
        const available = Number(node.dataset.fitWidth);
        if (node.getComputedTextLength() > available) {
          node.setAttribute("textLength", String(available));
          node.setAttribute("lengthAdjust", "spacingAndGlyphs");
        }
      });
  }
  useLayoutEffect(fitText, [d, catalog]);
  useEffect(() => {
    let active = true;
    document.fonts?.ready.then(() => {
      if (active) fitText();
    });
    return () => {
      active = false;
    };
  }, [d, catalog]);
  const rows = displayGoldPrices(catalog?.prices || []);
  const group = (part: TVPart) =>
    ["headers", "labels", "buy", "sell"].includes(part) ? "table" : part;
  function point(e: PointerEvent) {
    const svg = ref.current!,
      m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }
  function down(e: PointerEvent, part: TVPart) {
    if (!onSelect) return;
    e.preventDefault();
    onSelect(part);
    const b = d.boxes[group(part) as keyof TVDesign["boxes"]],
      p = point(e);
    drag.current = { part, x: b.x, y: b.y, sx: p.x, sy: p.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function dragNode(part: TVPart) {
    return ref.current?.querySelector(
      group(part) === "table"
        ? "[data-tv-block=table]"
        : `[data-tv-part=${part}]`,
    );
  }
  function preview(e: PointerEvent) {
    const start = drag.current;
    if (!start) return;
    const b = d.boxes[group(start.part) as keyof TVDesign["boxes"]],
      p = point(e);
    const dx = Math.max(
        -start.x,
        Math.min(1600 - b.w - start.x, p.x - start.sx),
      ),
      dy = Math.max(-start.y, Math.min(900 - b.h - start.y, p.y - start.sy));
    dragNode(start.part)?.setAttribute("transform", `translate(${dx} ${dy})`);
  }
  function cancel() {
    if (drag.current) dragNode(drag.current.part)?.removeAttribute("transform");
    drag.current = null;
  }
  function up(e: PointerEvent) {
    const start = drag.current;
    if (!start) return;
    cancel();
    const b = d.boxes[group(start.part) as keyof TVDesign["boxes"]],
      p = point(e);
    if (Math.abs(p.x - start.sx) + Math.abs(p.y - start.sy) > 3)
      onMove?.(
        start.part,
        Math.round(Math.max(0, Math.min(1600 - b.w, start.x + p.x - start.sx))),
        Math.round(Math.max(0, Math.min(900 - b.h, start.y + p.y - start.sy))),
      );
  }
  function text(
    part: Exclude<TVPart, "table">,
    content: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    const s = d.styles[part],
      anchor =
        s.align === "left" ? "start" : s.align === "right" ? "end" : "middle";
    const units = [...content].reduce(
        (n, c) =>
          n + (/[MWĐ@]/.test(c) ? 0.85 : /[1il., :·]/.test(c) ? 0.32 : 0.58),
        0,
      ),
      length = units * s.size;
    return (
      <g
        key={`${part}-${x}-${y}`}
        data-tv-part={part}
        role={onSelect ? "button" : undefined}
        tabIndex={onSelect ? 0 : undefined}
        aria-label={onSelect ? `Chỉnh ${TV_PARTS[part]}` : undefined}
        onKeyDown={(e) => {
          if (onSelect && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onSelect(part);
          }
        }}
        onPointerDown={(e) => down(e, part)}
        onPointerUp={up}
        onPointerMove={preview}
        onPointerCancel={cancel}
        style={{ cursor: onSelect ? "move" : undefined }}
      >
        <rect x={x} y={y} width={w} height={h} fill="transparent" />
        <text
          data-fit-width={w - 24}
          x={
            s.align === "left"
              ? x + 8
              : s.align === "right"
                ? x + w - 8
                : x + w / 2
          }
          y={y + h / 2}
          dominantBaseline="central"
          textAnchor={anchor}
          style={
            {
              "--tv-font": TV_FONTS[s.font],
              "--tv-ink": s.color,
              fontFamily: "var(--tv-font)",
              fill: "var(--tv-ink)",
              fontSize: s.size,
              fontWeight: s.weight,
              fontStyle: "normal",
            } as CSSProperties
          }
          {...(length > w - 16
            ? { textLength: w - 16, lengthAdjust: "spacingAndGlyphs" as const }
            : {})}
        >
          {content}
        </text>
        {onSelect && selected === part && (
          <rect
            x={x + 1}
            y={y + 1}
            width={w - 2}
            height={h - 2}
            className="tv-selection"
          />
        )}
      </g>
    );
  }
  const b = d.boxes.table,
    rh = b.h / 4,
    col = b.w / 3;
  const title =
    d.titleText || catalog?.company?.name || "TIỆM VÀNG KIM BẢO LÂM";
  const address =
    d.addressText ||
    [catalog?.company?.address, catalog?.company?.phone]
      .filter(Boolean)
      .join(" · ");
  const time = rows.reduce(
    (n: number, p: any) => Math.max(n, Number(p.capturedAt) || 0),
    0,
  );
  const footer =
    (time ? "Cập nhật " + date(time) : "Chờ bảng giá đồng bộ từ cửa hàng.") +
    (rows.some((p: any) => p.stale)
      ? " · Giá lưu — cần xác nhận tại tiệm."
      : "");
  return (
    <svg
      ref={ref}
      viewBox="0 0 1600 900"
      className="tv-board"
      role={onSelect ? "group" : "img"}
      aria-label="Bảng giá vàng Kim Bảo Lâm"
      style={
        {
          "--tv-background": d.background,
          "--tv-line": d.lineColor,
          "--tv-row": d.rowBackground,
          touchAction: onSelect ? "none" : undefined,
        } as CSSProperties
      }
    >
      <rect width="1600" height="900" fill="var(--tv-background)" />
      {(["title", "address", "subtitle"] as const).map((part) => {
        const b = d.boxes[part];
        return (
          b.visible &&
          text(
            part,
            part === "title"
              ? title
              : part === "address"
                ? address
                : d.subtitleText,
            b.x,
            b.y,
            b.w,
            b.h,
          )
        );
      })}
      {b.visible && (
        <g data-tv-block="table">
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              {d.rowFill && i % 2 === 1 && (
                <rect
                  x={b.x}
                  y={b.y + rh * i}
                  width={b.w}
                  height={rh}
                  fill="var(--tv-row)"
                />
              )}
              {d.lines && (
                <line
                  x1={b.x}
                  x2={b.x + b.w}
                  y1={b.y + rh * (i + 1)}
                  y2={b.y + rh * (i + 1)}
                  stroke="var(--tv-line)"
                  strokeWidth="2"
                />
              )}
            </g>
          ))}
          {["Loại vàng", d.buyText, d.sellText].map((v, i) =>
            text("headers", v, b.x + i * col, b.y, col, rh),
          )}
          {rows.map((p: any, i: number) => (
            <g key={p.id}>
              {text("labels", p.label, b.x, b.y + (i + 1) * rh, col, rh)}
              {text(
                "buy",
                cash(perChi(p.buy, p.unit)),
                b.x + col,
                b.y + (i + 1) * rh,
                col,
                rh,
              )}
              {text(
                "sell",
                cash(perChi(p.sell, p.unit)),
                b.x + col * 2,
                b.y + (i + 1) * rh,
                col,
                rh,
              )}
            </g>
          ))}
          {!rows.length && (
            <text
              x={b.x + b.w / 2}
              y={b.y + b.h / 2}
              textAnchor="middle"
              style={{ fill: "var(--tv-line)", fontSize: 28 }}
            >
              Chờ bảng giá đồng bộ từ cửa hàng.
            </text>
          )}
          {onSelect && selected === "table" && (
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              className="tv-selection"
              onPointerDown={(e) => down(e, "table")}
              onPointerUp={up}
            />
          )}
        </g>
      )}
      {d.boxes.footer.visible &&
        text(
          "footer",
          footer,
          d.boxes.footer.x,
          d.boxes.footer.y,
          d.boxes.footer.w,
          d.boxes.footer.h,
        )}
    </svg>
  );
}
