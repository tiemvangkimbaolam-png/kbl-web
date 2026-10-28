"use client";
/* Hallmark · pre-emit critique: P4 H4 E4 S5 R4 V4 · existing KBL tokens */
import { useEffect, useState } from "react";
import { TVBoard } from "./tv-board";
import { api } from "./ui";
import {
  defaultTVDesign,
  tvPreset,
  TV_PARTS,
  TV_FONTS,
  type TVDesign,
  type TVPart,
} from "@/lib/kbl/tv-design";
export function TVEditor() {
  const [draft, setDraft] = useState<TVDesign>(defaultTVDesign),
    [saved, setSaved] = useState<TVDesign | null>(null),
    [version, setVersion] = useState(0),
    [catalog, setCatalog] = useState<any>(null),
    [selected, setSelected] = useState<TVPart>("title"),
    [past, setPast] = useState<TVDesign[]>([]),
    [future, setFuture] = useState<TVDesign[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const dirty =
    saved !== null && JSON.stringify(draft) !== JSON.stringify(saved);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const [r, c] = await Promise.all([
        api("admin/tv-design"),
        api("public/catalog"),
      ]);
      setDraft(r.design);
      setSaved(r.design);
      setVersion(r.version);
      setCatalog(c);
      setPast([]);
      setFuture([]);
      setMessage("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    const t = setInterval(() => {
      api("public/catalog")
        .then(setCatalog)
        .catch(() => {});
    }, 30000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const f = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [dirty]);
  function change(next: TVDesign) {
    setPast((p) => [...p.slice(-39), draft]);
    setFuture([]);
    setDraft(next);
    setMessage("");
  }
  function patch(fn: (d: TVDesign) => void) {
    const d = structuredClone(draft);
    fn(d);
    change(d);
  }
  const boxKey = (
    ["headers", "labels", "buy", "sell"].includes(selected) ? "table" : selected
  ) as keyof TVDesign["boxes"];
  const box = draft.boxes[boxKey],
    style = selected === "table" ? null : draft.styles[selected];
  function move(part: TVPart, x: number, y: number) {
    const key = (
      ["headers", "labels", "buy", "sell"].includes(part) ? "table" : part
    ) as keyof TVDesign["boxes"];
    patch((d) => {
      d.boxes[key].x = x;
      d.boxes[key].y = y;
    });
  }
  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await api("admin/tv-design", "POST", {
        design: draft,
        version,
      });
      setDraft((current) =>
        JSON.stringify(current) === JSON.stringify(draft) ? r.design : current,
      );
      setSaved(r.design);
      setVersion(r.version);
      setMessage(
        "Đã lưu mẫu TV. Màn hình TV đang mở sẽ nhận mẫu trong tối đa 30 giây.",
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function number(label: string, key: "x" | "y" | "w" | "h", max: number) {
    return (
      <label>
        {label}
        <input
          type="number"
          value={box[key]}
          min={key === "w" ? 80 : key === "h" ? 24 : 0}
          max={max}
          disabled={busy}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isFinite(v)) return;
            patch((d) => {
              const b = d.boxes[boxKey];
              if (key === "x") b.x = Math.max(0, Math.min(v, 1600 - b.w));
              if (key === "y") b.y = Math.max(0, Math.min(v, 900 - b.h));
              if (key === "w") b.w = Math.max(80, Math.min(v, 1600 - b.x));
              if (key === "h") b.h = Math.max(24, Math.min(v, 900 - b.y));
            });
          }}
        />
      </label>
    );
  }
  if (loading)
    return (
      <section className="card" aria-busy="true">
        Đang tải trình thiết kế TV…
      </section>
    );
  if (!saved)
    return (
      <section className="card">
        <p role="alert">{error || "Chưa tải được mẫu TV."}</p>
        <button onClick={load}>Thử tải lại</button>
      </section>
    );
  return (
    <section className="card tv-editor" aria-label="Thiết kế bảng giá TV">
      <header className="tv-editor-head">
        <div>
          <h2>Thiết kế bảng giá TV</h2>
          <p>
            Chọn chữ trên khung để chỉnh. Kéo rồi thả để đổi vị trí. Giá thật
            tiếp tục cập nhật từ cửa hàng.
          </p>
        </div>
        <a
          className="button secondary"
          href="/tv"
          target="_blank"
          rel="noreferrer"
        >
          Mở TV ↗
        </a>
      </header>
      <div className="tv-editor-toolbar">
        <label>
          Mẫu nền
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) change(tvPreset(e.target.value));
            }}
            disabled={busy}
          >
            <option value="">Chọn mẫu bắt đầu</option>
            <option value="cream">Kem truyền thống</option>
            <option value="white">Trắng rõ nét</option>
            <option value="dark">Xanh đậm · giá vàng</option>
          </select>
        </label>
        <div className="tv-editor-actions">
          <button
            disabled={!past.length || busy}
            onClick={() => {
              setFuture((f) => [draft, ...f]);
              setDraft(past[past.length - 1]);
              setPast((p) => p.slice(0, -1));
              setMessage("");
            }}
          >
            ↶ Hoàn tác
          </button>
          <button
            disabled={!future.length || busy}
            onClick={() => {
              setPast((p) => [...p, draft]);
              setDraft(future[0]);
              setFuture((f) => f.slice(1));
              setMessage("");
            }}
          >
            ↷ Làm lại
          </button>
          <button disabled={busy} onClick={load}>
            Tải bản đã lưu
          </button>
          <button className="primary" disabled={busy || !dirty} onClick={save}>
            {busy ? "Đang lưu…" : "Lưu mẫu TV"}
          </button>
        </div>
      </div>
      {error && (
        <p className="tv-editor-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="tv-editor-success" role="status">
          {message}
        </p>
      )}
      <div className="tv-editor-workspace">
        <div className="tv-editor-stage">
          <div className="tv-editor-caption">
            <span>KHUNG TV · 1600 × 900 · 16:9</span>
            <span>
              {dirty ? "● Có thay đổi chưa lưu" : "Đang dùng bản đã lưu"}
            </span>
          </div>
          <TVBoard
            design={draft}
            catalog={catalog}
            selected={selected}
            onSelect={setSelected}
            onMove={move}
          />
          <p className="tv-editor-hint">
            Ô giá mua, bán và loại vàng cùng thuộc bảng giá: kéo một ô sẽ di
            chuyển cả bảng. Cỡ chữ tự co nếu vượt chiều rộng ô.
          </p>
        </div>
        <aside className="tv-editor-inspector">
          <label>
            Phần đang chỉnh
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value as TVPart)}
            >
              {Object.entries(TV_PARTS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {style && (
            <>
              <label>
                Font chữ
                <select
                  value={style.font}
                  onChange={(e) =>
                    patch((d) => {
                      d.styles[selected as keyof TVDesign["styles"]].font = e
                        .target.value as keyof typeof TV_FONTS;
                    })
                  }
                >
                  <option value="arial">Arial · rõ trên TV</option>
                  <option value="vietnam">Be Vietnam Pro</option>
                  <option value="times">Times New Roman</option>
                  <option value="serif">Playfair Display</option>
                  <option value="mono">Consolas · số đều</option>
                </select>
              </label>
              <div className="tv-editor-pair">
                <label>
                  Cỡ chữ
                  <input
                    type="number"
                    min="16"
                    max="160"
                    value={style.size}
                    onChange={(e) =>
                      patch((d) => {
                        d.styles[selected as keyof TVDesign["styles"]].size =
                          Math.max(
                            16,
                            Math.min(160, Number(e.target.value) || 16),
                          );
                      })
                    }
                  />
                </label>
                <label>
                  Độ đậm
                  <select
                    value={style.weight}
                    onChange={(e) =>
                      patch((d) => {
                        d.styles[selected as keyof TVDesign["styles"]].weight =
                          e.target.value as typeof style.weight;
                      })
                    }
                  >
                    <option value="400">Thường</option>
                    <option value="600">Vừa</option>
                    <option value="700">Đậm</option>
                    <option value="900">Rất đậm</option>
                  </select>
                </label>
              </div>
              <div className="tv-editor-pair">
                <label>
                  Màu chữ
                  <input
                    type="color"
                    value={style.color}
                    onChange={(e) =>
                      patch((d) => {
                        d.styles[selected as keyof TVDesign["styles"]].color =
                          e.target.value;
                      })
                    }
                  />
                </label>
                <label>
                  Căn chữ
                  <select
                    value={style.align}
                    onChange={(e) =>
                      patch((d) => {
                        d.styles[selected as keyof TVDesign["styles"]].align = e
                          .target.value as typeof style.align;
                      })
                    }
                  >
                    <option value="left">Trái</option>
                    <option value="center">Giữa</option>
                    <option value="right">Phải</option>
                  </select>
                </label>
              </div>
            </>
          )}
          {(["title", "address", "subtitle"] as string[]).includes(
            selected,
          ) && (
            <label>
              Nội dung{" "}
              {selected !== "subtitle" && "(để trống lấy thông tin tiệm)"}
              <textarea
                rows={2}
                maxLength={selected === "address" ? 300 : 120}
                value={
                  draft[
                    (selected + "Text") as
                      "titleText" | "addressText" | "subtitleText"
                  ]
                }
                onChange={(e) =>
                  patch((d) => {
                    d[
                      (selected + "Text") as
                        "titleText" | "addressText" | "subtitleText"
                    ] = e.target.value;
                  })
                }
              />
            </label>
          )}
          {selected === "headers" && (
            <div className="tv-editor-pair">
              <label>
                Cột mua
                <input
                  maxLength={40}
                  value={draft.buyText}
                  onChange={(e) =>
                    patch((d) => {
                      d.buyText = e.target.value;
                    })
                  }
                />
              </label>
              <label>
                Cột bán
                <input
                  maxLength={40}
                  value={draft.sellText}
                  onChange={(e) =>
                    patch((d) => {
                      d.sellText = e.target.value;
                    })
                  }
                />
              </label>
            </div>
          )}
          <fieldset>
            <legend>
              Vị trí & kích thước {boxKey === "table" ? "toàn bảng" : ""}
            </legend>
            <div className="tv-editor-pair">
              {number("X", "x", 1600 - box.w)}
              {number("Y", "y", 900 - box.h)}
              {number("Rộng", "w", 1600 - box.x)}
              {number("Cao", "h", 900 - box.y)}
            </div>
            <label className="tv-editor-check">
              <input
                type="checkbox"
                checked={box.visible}
                onChange={(e) =>
                  patch((d) => {
                    d.boxes[boxKey].visible = e.target.checked;
                  })
                }
              />
              Hiển thị phần này
            </label>
          </fieldset>
          <fieldset>
            <legend>Phong cách toàn màn hình</legend>
            <div className="tv-editor-pair">
              <label>
                Nền TV
                <input
                  type="color"
                  value={draft.background}
                  onChange={(e) =>
                    patch((d) => {
                      d.background = e.target.value;
                    })
                  }
                />
              </label>
              <label>
                Đường kẻ
                <input
                  type="color"
                  value={draft.lineColor}
                  onChange={(e) =>
                    patch((d) => {
                      d.lineColor = e.target.value;
                    })
                  }
                />
              </label>
              <label>
                Nền hàng
                <input
                  type="color"
                  value={draft.rowBackground}
                  onChange={(e) =>
                    patch((d) => {
                      d.rowBackground = e.target.value;
                    })
                  }
                />
              </label>
            </div>
            <label className="tv-editor-check">
              <input
                type="checkbox"
                checked={draft.lines}
                onChange={(e) =>
                  patch((d) => {
                    d.lines = e.target.checked;
                  })
                }
              />
              Hiện đường kẻ
            </label>
            <label className="tv-editor-check">
              <input
                type="checkbox"
                checked={draft.rowFill}
                onChange={(e) =>
                  patch((d) => {
                    d.rowFill = e.target.checked;
                  })
                }
              />
              Tô nền hàng xen kẽ
            </label>
          </fieldset>
        </aside>
      </div>
    </section>
  );
}
