"use client";
import { useEffect, useState } from "react";
import { TVBoard } from "../components/tv-board";
import { defaultTVDesign, type TVDesign } from "@/lib/kbl/tv-design";
export default function TV() {
  const [catalog, setCatalog] = useState<any>(null),
    [design, setDesign] = useState<TVDesign>(defaultTVDesign),
    [market,setMarket]=useState<any>(null),
    [error, setError] = useState(""),
    [full, setFull] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    let pending=false;
    async function load() {
      if(pending)return;pending=true;
      const results = await Promise.allSettled([
        fetch("/api/public/prices?view=tv", {
          cache: "no-store",
          signal: c.signal,
        }).then(async (r) => {
          if (!r.ok) throw Error();
          return r.json() as Promise<any>;
        }),
        fetch("/api/public/tv-design", {
          cache: "no-store",
          signal: c.signal,
        }).then(async (r) => {
          if (!r.ok) throw Error();
          return r.json() as Promise<any>;
        }),
      ]);
      pending=false;
      if (c.signal.aborted) return;
      let failed = false;
      if (results[0].status === "fulfilled") setCatalog(results[0].value);
      else failed = true;
      if (results[1].status === "fulfilled") setDesign(results[1].value.design);
      else failed = true;
      setError(failed ? "Mất kết nối — đang giữ bản hiển thị đã nhận." : "");
    }
    load();
    const t = setInterval(() => { if (!document.hidden) void load(); }, 30000),
      change = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", change);
    return () => {
      c.abort();
      clearInterval(t);
      document.removeEventListener("fullscreenchange", change);
    };
  }, []);
  useEffect(()=>{const c=new AbortController();let pending=false;async function load(){if(pending||document.hidden)return;pending=true;try{const r=await fetch('/api/public/market',{cache:'no-store',signal:c.signal});if(!r.ok)throw Error();const value=await r.json();if(!c.signal.aborted)setMarket(value);}catch{if(!c.signal.aborted)setMarket((old:any)=>old?{...old,stale:true}:{available:false});}finally{pending=false;}}void load();const timer=setInterval(load,60000);const visible=()=>{if(!document.hidden)void load();};document.addEventListener('visibilitychange',visible);return()=>{c.abort();clearInterval(timer);document.removeEventListener('visibilitychange',visible);};},[]);
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen)
        await document.documentElement.requestFullscreen();
      else
        setError("Dùng nút phóng to của trình duyệt TV để mở toàn màn hình.");
    } catch {
      setError(
        "Chưa bật được toàn màn hình. Hãy dùng nút phóng to của trình duyệt TV.",
      );
    }
  }
  return (
    <main className="tv-screen tv-has-world" style={{ background: design.background }}>
      <TVBoard design={design} catalog={catalog} />
      <aside className="tv-world-ticker" aria-label="Giá vàng thế giới tham khảo">
        <strong>THẾ GIỚI · XAU/USD</strong>
        <b>{market?.available&&Number.isFinite(market.xauUsd)?'$'+market.xauUsd.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' / oz':'—'}</b>
        <span>{market?.available?`${market.stale?'Chưa làm mới · ':''}${market.goldUpdatedAt||'Nguồn chưa ghi giờ'} · lấy lúc ${new Date(market.fetchedAt).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit'})}`:'Đang chờ nguồn giá thế giới'}</span>
        <small>Giá tham khảo · Giá tiệm theo POS</small>
      </aside>
      <nav className="tv-screen-controls" aria-label="Điều khiển TV">
        <button onClick={fullscreen}>
          {full ? "Thoát toàn màn hình" : "⛶ Toàn màn hình"}
        </button>
        <a href="/admin/bang-gia">Chỉnh mẫu TV</a>
        <a href="/">Website</a>
      </nav>
      {error && (
        <p className="tv-screen-error" role="status">
          {error}
        </p>
      )}
    </main>
  );
}
