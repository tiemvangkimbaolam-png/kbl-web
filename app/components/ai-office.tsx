'use client';
import { useEffect, useRef, useState } from 'react';
import { officeSnapshot } from './ai-office-state.mjs';
export default function AIOffice({ accounts, jobs, enabled, serverTime, onSelect, onAdd }: { accounts: any[]; jobs: any[]; enabled: boolean; serverTime: number; onSelect?: (id: string) => void; onAdd: () => void }) {
    const frame = useRef<HTMLIFrameElement>(null), current = useRef<any>(null), [ready, setReady] = useState(false);
    useEffect(() => { current.current = { accounts, jobs, enabled, serverTime, receivedAt: Date.now() }; }, [accounts, jobs, enabled, serverTime]);
    useEffect(() => {
        function send() { const v = current.current; if (v) frame.current?.contentWindow?.postMessage({ type: 'kbl-office-state', snapshot: officeSnapshot(v.accounts, v.jobs, { now: Number(v.serverTime || Date.now()) + Date.now() - v.receivedAt, enabled: v.enabled, fresh: Date.now() - v.receivedAt < 30000 }) }, window.location.origin); }
        function receive(e: MessageEvent) { if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return; if (e.data?.type === 'kbl-office-ready') { setReady(true); send(); } if (e.data?.type === 'kbl-office-select' && typeof e.data.id === 'string') onSelect?.(e.data.id); if (e.data?.type === 'kbl-office-add') onAdd(); }
        window.addEventListener('message', receive); const timer = setInterval(send, 3000); send(); return () => { clearInterval(timer); window.removeEventListener('message', receive); };
    }, [onAdd, onSelect]);
    return <div className="ai-office-shell"><iframe ref={frame} title="Phòng điều phối AI 3D · trạng thái thật" src="/ai-office/index.html" loading="lazy" style={{ width: '100%', height: 570, border: 0, borderRadius: 12, display: 'block' }} /><p className="small muted" style={{ marginTop: 10 }}>{ready ? 'Phòng R40: 20 vị trí · bàn làm việc, sofa, buồng năng lượng và thể thao. Hoạt cảnh nghỉ chỉ để minh họa; trạng thái và việc lấy từ heartbeat thật.' : 'Đang mở phòng 3D. Danh sách tài khoản và luồng tin bên dưới vẫn dùng được.'}</p></div>;
}
