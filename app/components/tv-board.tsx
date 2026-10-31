"use client";
import { useRef, useLayoutEffect, useEffect } from "react";
import type { CSSProperties, PointerEvent } from "react";
import {
  tvBox,
  TV_PARTS,
  TV_FONTS,
  type TVDesign,
  type TVPart,
} from "@/lib/kbl/tv-design";
import { displayGoldPrices } from "@/lib/kbl/display-prices.mjs";
import { cash, date } from "./ui";
import { perChi } from "./reference-home/tools.mjs";
type Props = {
  design: TVDesign;
  catalog: any;
  selected?: string;
  onSelect?: (part: string) => void;
  onResize?: (part: string, w: number, h: number, x: number, y: number) => void;
  onEdit?: (part: string) => void;
  onMove?: (part: string, x: number, y: number) => void;
};
export function TVBoard({
  design: d,
  catalog,
  selected,
  onSelect,
  onMove,
  onResize,
  onEdit,
}: Props) {
  const ref = useRef<SVGSVGElement>(null),
    drag = useRef<{
      part: string;
      w: number;
      h: number;
      mode?: string;
      x: number;
      y: number;
      sx: number;
      sy: number;
    } | null>(null);
  function fitText() {
    ref.current
      ?.querySelectorAll<SVGTextElement>("[data-fit-width]")
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
  const group = (part: string) =>
    ["headers", "labels", "buy", "sell"].includes(part) ? "table" : part;
  function point(e: PointerEvent) {
    const svg = ref.current!,
      m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }
  function down(e: PointerEvent, part: string, mode?: string) {
    if (!onSelect) return;
    e.preventDefault();
    onSelect(part);
    const b = tvBox(d, part),
      p = point(e);
    if (b.locked) return;
    drag.current = {
      part,
      x: b.x,
      y: b.y,
      sx: p.x,
      sy: p.y,
      w: b.w,
      h: b.h,
      mode,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function dragNode(part: string) {
    return ref.current?.querySelector(
      group(part) === "table"
        ? "[data-tv-block=table]"
        : `[data-tv-part="${part}"]`,
    );
  }
  function preview(e: PointerEvent) {
    const start = drag.current;
    if (!start) return;
    const b = tvBox(d, start.part),
      p = point(e);
    const dx = Math.max(
        -start.x,
        Math.min(1600 - b.w - start.x, p.x - start.sx),
      ),
      dy = Math.max(-start.y, Math.min(900 - b.h - start.y, p.y - start.sy));
    if (start.mode) {
      const r = resized(start, p);
      ref.current
        ?.querySelector("[data-resize-outline]")
        ?.setAttribute("d", `M ${r.x} ${r.y} h ${r.w} v ${r.h} h ${-r.w} Z`);
      return;
    }
    dragNode(start.part)?.setAttribute("transform", `translate(${dx} ${dy})`);
  }
  function cancel() {
    if (drag.current) dragNode(drag.current.part)?.removeAttribute("transform");
    ref.current?.querySelector("[data-resize-outline]")?.removeAttribute("d");
    drag.current = null;
  }
  function up(e: PointerEvent) {
    const start = drag.current;
    if (!start) return;
    cancel();
    const b = tvBox(d, start.part),
      p = point(e);
    if (start.mode) {
      const r = resized(start, p);
      onResize?.(start.part, r.w, r.h, r.x, r.y);
      return;
    }
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
        onDoubleClick={() => onEdit?.(part)}
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

  function resized(
    start: NonNullable<typeof drag.current>,
    p: { x: number; y: number },
  ) {
    let { x, y, w, h } = start;
    const mode = start.mode || "";
    if (mode.includes("e"))
      w = Math.max(80, Math.min(1600 - x, w + p.x - start.sx));
    if (mode.includes("s"))
      h = Math.max(24, Math.min(900 - y, h + p.y - start.sy));
    if (mode.includes("w")) {
      const nx = Math.max(0, Math.min(x + w - 80, x + p.x - start.sx));
      w += x - nx;
      x = nx;
    }
    if (mode.includes("n")) {
      const ny = Math.max(0, Math.min(y + h - 24, y + p.y - start.sy));
      h += y - ny;
      y = ny;
    }
    return {
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(w),
      h: Math.round(h),
    };
  }
  function extras(position: string) {
    return (d.layers || [])
      .filter((l) => l.position === position && l.box.visible)
      .map((l) => {
        const b = l.box,
          id = "layer:" + l.id,
          props = {
            onPointerDown: (e: PointerEvent) => down(e, id),
            onPointerMove: preview,
            onPointerUp: up,
            onPointerCancel: cancel,
            onDoubleClick: () => onEdit?.(id),
          };
        return (
          <g
            key={l.id}
            data-tv-part={id}
            opacity={l.opacity}
            {...(onSelect ? props : {})}
            style={{ cursor: onSelect ? "move" : undefined }}
          >
            <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="transparent" />
            {l.type === "rect" ? (
              <rect
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                rx={l.radius}
                fill={l.fill}
              />
            ) : l.type === "image" ? (
              <image
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                href={l.src}
                preserveAspectRatio="xMidYMid meet"
              />
            ) : (
              <text
                x={
                  l.style.align === "left"
                    ? b.x + 8
                    : l.style.align === "right"
                      ? b.x + b.w - 8
                      : b.x + b.w / 2
                }
                y={b.y + b.h / 2}
                dominantBaseline="central"
                textAnchor={
                  l.style.align === "left"
                    ? "start"
                    : l.style.align === "right"
                      ? "end"
                      : "middle"
                }
                style={{
                  fontFamily: TV_FONTS[l.style.font],
                  fontSize: l.style.size,
                  fontWeight: l.style.weight,
                  fill: l.style.color,
                }}
              >
                {l.text.split(/\r?\n/).map((line, i, lines) => (
                  <tspan
                    key={i}
                    data-fit-width={b.w - 24}
                    x={
                      l.style.align === "left"
                        ? b.x + 8
                        : l.style.align === "right"
                          ? b.x + b.w - 8
                          : b.x + b.w / 2
                    }
                    y={
                      b.y +
                      b.h / 2 +
                      (i - (lines.length - 1) / 2) *
                        Math.min(l.style.size * 1.2, b.h / lines.length)
                    }
                  >
                    {line || " "}
                  </tspan>
                ))}
              </text>
            )}
          </g>
        );
      });
  }
  function selection() {
    const b = tvBox(d, selected!);
    if (!b || !b.visible) return null;
    const pts = [
      ["nw", b.x, b.y],
      ["n", b.x + b.w / 2, b.y],
      ["ne", b.x + b.w, b.y],
      ["e", b.x + b.w, b.y + b.h / 2],
      ["se", b.x + b.w, b.y + b.h],
      ["s", b.x + b.w / 2, b.y + b.h],
      ["sw", b.x, b.y + b.h],
      ["w", b.x, b.y + b.h / 2],
    ] as const;
    return (
      <g>
        <rect
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          className="tv-selection"
        />
        <path data-resize-outline className="tv-selection" />
        {!b.locked &&
          pts.map(([mode, x, y]) => (
            <rect
              key={mode}
              data-resize-handle={mode}
              x={Math.max(0, x - 7)}
              y={Math.max(0, y - 7)}
              width="14"
              height="14"
              className="tv-resize-handle"
              style={{ cursor: mode + "-resize" }}
              onPointerDown={(e) => {
                e.stopPropagation();
                down(e, selected!, mode);
              }}
              onPointerMove={preview}
              onPointerUp={up}
              onPointerCancel={cancel}
            />
          ))}
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
      {extras("back")}
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
      {extras("front")}
      {onSelect && selected && selection()}
    </svg>
  );
}
