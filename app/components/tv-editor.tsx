"use client";
/* Hallmark · pre-emit critique: P4 H4 E4 S5 R4 V4 · existing KBL tokens */
import { useEffect, useRef, useState } from "react";
import { TVBoard } from "./tv-board";
import { api } from "./ui";
import {
  tvBox,
  tvStyle,
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
    [selected, setSelected] = useState<string>("title"),
    [past, setPast] = useState<TVDesign[]>([]),
    [future, setFuture] = useState<TVDesign[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const editCommitted = useRef(false);
  const [zoom, setZoom] = useState(1),
    [editing, setEditing] = useState<string | null>(null),
    [editText, setEditText] = useState("");
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
  const box = tvBox(draft, selected),
    style = tvStyle(draft, selected);
  const layer = draft.layers.find((l) => "layer:" + l.id === selected);
  function move(part: string, x: number, y: number) {
    const key = (
      ["headers", "labels", "buy", "sell"].includes(part) ? "table" : part
    ) as keyof TVDesign["boxes"];
    patch((d) => {
      const box = tvBox(d, part);
      if (!box.locked) {
        box.x = x;
        box.y = y;
      }
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
          disabled={busy || box.locked}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isFinite(v)) return;
            patch((d) => {
              const b = tvBox(d, selected);
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

  function add(type: "text" | "rect" | "image", src = "/kbl-logo.png") {
    if (draft.layers.length >= 20) {
      setError("Mỗi mẫu có tối đa 20 lớp trang trí.");
      return;
    }
    const id = crypto.randomUUID();
    patch((d) => {
      d.layers.push({
        id,
        type,
        name:
          type === "text"
            ? "Chữ mới"
            : type === "rect"
              ? "Hình nền"
              : "Ảnh / logo",
        box: {
          x: 100,
          y: 100,
          w: type === "image" ? 180 : 500,
          h: type === "text" ? 90 : type === "image" ? 180 : 160,
          visible: true,
          locked: false,
        },
        style: { ...d.styles.subtitle, size: 40 },
        text: "Nhấp đúp để sửa chữ",
        fill: d.rowBackground,
        radius: 12,
        opacity: 1,
        position: type === "rect" ? "back" : "front",
        src: type === "image" ? src : "",
      });
    });
    setSelected("layer:" + id);
  }
  function remove() {
    if (box.locked) return;
    patch((d) => {
      if (layer) d.layers = d.layers.filter((l) => l.id !== layer.id);
      else tvBox(d, selected).visible = false;
    });
    setSelected("title");
  }
  function duplicate() {
    if (!layer || draft.layers.length >= 20) return;
    const copy = structuredClone(layer);
    copy.id = crypto.randomUUID();
    copy.name += " (bản sao)";
    copy.box.x = Math.min(1600 - copy.box.w, copy.box.x + 24);
    copy.box.y = Math.min(900 - copy.box.h, copy.box.y + 24);
    patch((d) => {
      d.layers.push(copy);
    });
    setSelected("layer:" + copy.id);
  }
  function resize(part: string, w: number, h: number, x: number, y: number) {
    patch((d) => {
      const b = tvBox(d, part);
      if (!b.locked) Object.assign(b, { w, h, x, y });
    });
  }
  function beginEdit(part: string) {
    editCommitted.current = false;
    const l = draft.layers.find((l) => "layer:" + l.id === part);
    if (tvBox(draft, part).locked) return;
    let value =
      l?.type === "text"
        ? l.text
        : part === "title"
          ? draft.titleText || catalog?.company?.name || ""
          : part === "address"
            ? draft.addressText ||
              [catalog?.company?.address, catalog?.company?.phone]
                .filter(Boolean)
                .join(" · ")
            : part === "subtitle"
              ? draft.subtitleText
              : null;
    if (value === null) return;
    setSelected(part);
    setEditText(value);
    setEditing(part);
  }
  function finishEdit() {
    if (!editing || editCommitted.current) return;
    editCommitted.current = true;
    patch((d) => {
      const l = d.layers.find((l) => "layer:" + l.id === editing);
      if (l?.type === "text") l.text = editText.slice(0, 500);
      else if (["title", "address", "subtitle"].includes(editing))
        d[(editing + "Text") as "titleText" | "addressText" | "subtitleText"] =
          editText.slice(0, editing === "address" ? 300 : 120);
    });
    setEditing(null);
  }
  async function uploadImage(input: File) {
    setBusy(true);
    setError("");
    try {
      if (
        !["image/png", "image/jpeg", "image/webp"].includes(input.type) ||
        input.size > 1500000
      )
        throw Error("Chọn ảnh PNG, JPG hoặc WebP tối đa 1,5 MB.");
      const picture = await createImageBitmap(input);
      if (picture.width > 8000 || picture.height > 8000) {
        picture.close();
        throw Error("Ảnh tối đa 8000 px mỗi chiều.");
      }
      picture.close();
      const r = await api("admin/tv-image", "POST", input);
      add("image", r.url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  }
  function order(direction: number) {
    if (!layer) return;
    patch((d) => {
      const index = d.layers.findIndex((l) => l.id === layer.id);
      const indices=d.layers.map((l,i)=>l.position===layer.position?i:-1).filter(i=>i>=0);
      const to=indices[indices.indexOf(index)+direction];
      if(to!==undefined)[d.layers[index], d.layers[to]] = [d.layers[to], d.layers[index]];
    });
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        target?.closest("input,textarea,select,[contenteditable=true]") ||
        busy ||
        editing
      )
        return;
      const cmd = e.ctrlKey || e.metaKey;
      if (cmd && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty) save();
        return;
      }
      if (cmd && ["z", "y"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        if (e.key.toLowerCase() === "y" || e.shiftKey) {
          if (future.length) {
            setPast((p) => [...p, draft]);
            setDraft(future[0]);
            setFuture((f) => f.slice(1));
          }
        } else if (past.length) {
          setFuture((f) => [draft, ...f]);
          setDraft(past[past.length - 1]);
          setPast((p) => p.slice(0, -1));
        }
        return;
      }
      if (cmd && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicate();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        remove();
        return;
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        move(
          selected,
          Math.max(
            0,
            Math.min(
              1600 - box.w,
              box.x +
                (e.key === "ArrowLeft"
                  ? -step
                  : e.key === "ArrowRight"
                    ? step
                    : 0),
            ),
          ),
          Math.max(
            0,
            Math.min(
              900 - box.h,
              box.y +
                (e.key === "ArrowUp"
                  ? -step
                  : e.key === "ArrowDown"
                    ? step
                    : 0),
            ),
          ),
        );
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [draft, selected, past, future, busy, editing]);

  useEffect(() => {
    if (
      selected.startsWith("layer:") &&
      !draft.layers.some((l) => "layer:" + l.id === selected)
    )
      setSelected("title");
  }, [draft.layers, selected]);
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
            Nhấp đúp để sửa chữ; kéo để di chuyển, kéo chấm góc để đổi kích
            thước. Giá thật tiếp tục cập nhật từ cửa hàng.
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
      <div className="tv-insert-toolbar" aria-label="Thêm thành phần">
        <button disabled={busy} onClick={() => add("text")}>
          ＋ Chữ
        </button>
        <button disabled={busy} onClick={() => add("rect")}>
          ▭ Hình nền
        </button>
        <button disabled={busy} onClick={() => add("image")}>
          Logo tiệm
        </button>
        <button disabled={busy} onClick={() => file.current?.click()}>
          Tải ảnh lên
        </button>
        <input
          ref={file}
          hidden
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const input = e.target.files?.[0];
            if (input) uploadImage(input);
          }}
        />
        <label>
          Thu phóng
          <select
            aria-label="Thu phóng"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          >
            <option value="1">Vừa khung</option>
            <option value="1.25">125%</option>
            <option value="1.5">150%</option>
            <option value="2">200%</option>
          </select>
        </label>
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
      <div className="tv-editor-workspace" inert={busy}>
        <div className="tv-editor-stage">
          <div className="tv-editor-caption">
            <span>KHUNG TV · 1600 × 900 · 16:9</span>
            <span>
              {dirty ? "● Có thay đổi chưa lưu" : "Đang dùng bản đã lưu"}
            </span>
          </div>
          <div className="tv-canvas-scroll">
            <div
              className="tv-canvas-sheet"
              style={{ width: zoom * 100 + "%" }}
            >
              <TVBoard
                design={draft}
                catalog={catalog}
                selected={selected}
                onSelect={setSelected}
                onMove={move}
                onResize={resize}
                onEdit={beginEdit}
              />
              {editing && (
                <textarea
                  aria-label="Sửa chữ trên khung"
                  autoFocus
                  className="tv-direct-text"
                  style={{
                    left: tvBox(draft, editing).x / 16 + "%",
                    top: tvBox(draft, editing).y / 9 + "%",
                    width: tvBox(draft, editing).w / 16 + "%",
                    height: tvBox(draft, editing).h / 9 + "%",
                  }}
                  value={editText}
                  maxLength={
                    editing.startsWith("layer:")
                      ? 500
                      : editing === "address"
                        ? 300
                        : 120
                  }
                  onChange={(e) => setEditText(e.target.value)}
                  onBlur={finishEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      editCommitted.current = true;
                      e.preventDefault();
                      setEditing(null);
                    }
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                      e.preventDefault();
                      finishEdit();
                    }
                  }}
                />
              )}
            </div>
          </div>
          <p className="tv-editor-hint">
            Phím mũi tên để di chuyển (Shift: 10 px), Ctrl+Z để hoàn tác, Ctrl+S
            để lưu. Ảnh tải lên dùng công khai trên TV. Ô giá mua, bán và loại
            vàng cùng thuộc bảng giá: kéo một ô sẽ di chuyển cả bảng. Cỡ chữ tự
            co nếu vượt chiều rộng ô.
          </p>
        </div>
        <aside className="tv-editor-inspector">
          <section className="tv-layer-list" aria-label="Các lớp">
            <h3>Các lớp · {draft.layers.length}/20</h3>
            {[...draft.layers].reverse().map((l) => (
              <button
                key={l.id}
                aria-pressed={selected === "layer:" + l.id}
                onClick={() => setSelected("layer:" + l.id)}
              >
                {l.box.locked ? "🔒 " : ""}
                {!l.box.visible ? "◌ " : ""}
                {l.name}
              </button>
            ))}
            <p>Chữ / ảnh mới nằm phía trước; hình nền nằm phía sau bảng giá.</p>
          </section>
          <label>
            Phần đang chỉnh
            <select
              aria-label="Phần đang chỉnh"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {Object.entries(TV_PARTS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
              {draft.layers.map((l) => (
                <option value={"layer:" + l.id} key={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <div className="tv-layer-actions">
            <button
              disabled={box.locked}
              onClick={() =>
                patch((d) => {
                  const b = tvBox(d, selected);
                  b.x = Math.round((1600 - b.w) / 2);
                })
              }
            >
              Căn giữa ngang
            </button>
            <button
              disabled={box.locked}
              onClick={() =>
                patch((d) => {
                  const b = tvBox(d, selected);
                  b.y = Math.round((900 - b.h) / 2);
                })
              }
            >
              Căn giữa dọc
            </button>
            <button
              onClick={() =>
                patch((d) => {
                  const b = tvBox(d, selected);
                  b.locked = !b.locked;
                })
              }
            >
              {box.locked ? "Mở khóa vị trí" : "Khóa vị trí"}
            </button>
            <button disabled={box.locked} onClick={remove}>
              {layer ? "Xóa lớp" : "Ẩn phần này"}
            </button>
            {layer && (
              <>
                <button
                  disabled={draft.layers.length >= 20}
                  onClick={duplicate}
                >
                  Nhân đôi
                </button>
                <button onClick={() => order(-1)}>Hạ một lớp</button>
                <button onClick={() => order(1)}>Nâng một lớp</button>
                <label>
                  Vị trí
                  <select
                    value={layer.position}
                    onChange={(e) =>
                      patch((d) => {
                        d.layers.find((l) => l.id === layer.id)!.position = e
                          .target.value as "back" | "front";
                      })
                    }
                  >
                    <option value="front">Trước bảng giá</option>
                    <option value="back">Sau bảng giá</option>
                  </select>
                </label>
                <label>
                  Tên lớp
                  <input
                    maxLength={80}
                    value={layer.name}
                    onChange={(e) =>
                      patch((d) => {
                        d.layers.find((l) => l.id === layer.id)!.name =
                          e.target.value;
                      })
                    }
                  />
                </label>
                <label>
                  Độ hiện
                  <input
                    type="range"
                    min="0.05"
                    max="1"
                    step="0.05"
                    value={layer.opacity}
                    onChange={(e) =>
                      patch((d) => {
                        d.layers.find((l) => l.id === layer.id)!.opacity =
                          Number(e.target.value);
                      })
                    }
                  />
                </label>
                {layer.type === "rect" && (
                  <>
                    <label>
                      Màu hình
                      <input
                        type="color"
                        value={layer.fill}
                        onChange={(e) =>
                          patch((d) => {
                            d.layers.find((l) => l.id === layer.id)!.fill =
                              e.target.value;
                          })
                        }
                      />
                    </label>
                    <label>
                      Bo góc
                      <input
                        type="number"
                        min="0"
                        max="200"
                        value={layer.radius}
                        onChange={(e) =>
                          patch((d) => {
                            d.layers.find((l) => l.id === layer.id)!.radius =
                              Math.max(
                                0,
                                Math.min(200, Number(e.target.value)),
                              );
                          })
                        }
                      />
                    </label>
                  </>
                )}
                {layer.type === "text" && (
                  <label>
                    Nội dung lớp chữ
                    <textarea
                      aria-label="Nội dung lớp chữ"
                      maxLength={500}
                      value={layer.text}
                      onChange={(e) =>
                        patch((d) => {
                          d.layers.find((l) => l.id === layer.id)!.text =
                            e.target.value;
                        })
                      }
                    />
                  </label>
                )}
              </>
            )}
          </div>
          {style && (
            <>
              <label>
                Font chữ
                <select
                  value={style.font}
                  onChange={(e) =>
                    patch((d) => {
                      tvStyle(d, selected)!.font = e.target
                        .value as keyof typeof TV_FONTS;
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
                        tvStyle(d, selected)!.size = Math.max(
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
                        tvStyle(d, selected)!.weight = e.target
                          .value as typeof style.weight;
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
                        tvStyle(d, selected)!.color = e.target.value;
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
                        tvStyle(d, selected)!.align = e.target
                          .value as typeof style.align;
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
                    tvBox(d, selected).visible = e.target.checked;
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
