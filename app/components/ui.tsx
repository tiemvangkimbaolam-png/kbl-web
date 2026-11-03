'use client';
import { useEffect, useRef } from 'react';
import { X, PackageOpen, LoaderCircle } from 'lucide-react';
import { readApiResponse } from './api-response.mjs';
export const date = (v: any) => v ? new Date(v).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : 'Chưa có';
export const cash = (v: any) => v === null || v === undefined ? 'Liên hệ báo giá' : new Intl.NumberFormat('vi-VN').format(v) + ' ₫';
export async function api(path: string, method = 'GET', body?: any, timeoutMs = 20000) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), Math.min(180000,Math.max(1000,timeoutMs)));
    try {
        const r = await fetch('/api/' + path, { method, signal: controller.signal, cache: 'no-store', headers: body instanceof Blob ? { 'Content-Type': body.type } : { 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: body instanceof Blob ? body : JSON.stringify(body) } : {}) });
        return await readApiResponse(r);
    } catch (e: any) {
        if (e.name === 'AbortError') throw Error('Máy chủ chưa trả lời kịp. Giữ lượt đang làm và kiểm tra kết nối; không tự gửi prompt lần hai.');
        throw e;
    } finally { clearTimeout(timer); }
}
export function Brand() { return <a href="/" className="brand"><img src="/kbl-logo.png" alt="Kim Bảo Lâm" width="45" height="45"/><div><strong>KIM BẢO LÂM</strong><span>Vàng & Trang sức</span></div></a>; }
export function Badge({ status, children }: {
    status?: string;
    children?: any;
}) { const good = ['ready', 'online', 'complete', 'published', 'confirmed', 'answered', 'completed'].includes(status || ''), bad = ['attention', 'failed', 'rejected', 'canceled'].includes(status || ''), warn = ['working', 'running', 'leased', 'quota', 'challenge', 'blocked'].includes(status || ''); const names: any = { ready: 'Sẵn sàng', online: 'Đang kết nối', complete: 'Hoàn thành', published: 'Đã xuất bản', confirmed: 'Đã xác nhận', answered: 'Đã trả lời', completed: 'Đã hoàn tất', attention: 'Cần kiểm tra', failed: 'Lỗi', rejected: 'Không được duyệt', canceled: 'Đã hủy', working: 'Đang xử lý', running: 'Đang thực hiện', leased: 'Đã nhận việc', quota: 'Chờ hạn mức', challenge: 'Cần xác minh', blocked: 'Đang chặn', 'waiting-revision': 'Chờ sửa kết quả', 'waiting-reconnect': 'Chờ nối lại', expired: 'Lệnh hết hạn', offline: 'Chưa kết nối', queued: 'Chờ nhận việc', new: 'Mới', pending: 'Chờ Windows', done: 'Đã thực hiện' }; return <span className={'pill ' + (good ? 'good' : bad ? 'bad' : warn ? 'warn' : '')}><i className="dot"/>{children || names[status || ''] || status || 'Chưa có'}</span>; }
export function Empty({ title, detail, action }: {
    title: string;
    detail?: string;
    action?: any;
}) { return <div className="empty"><PackageOpen size={30} strokeWidth={1}/><h3>{title}</h3>{detail && <p>{detail}</p>}{action}</div>; }
export function Busy() { return <span className="row small muted"><LoaderCircle size={16}/>Đang xử lý…</span>; }
export function Modal({ title, onClose, children }: {
    title: string;
    onClose: () => void;
    children: any;
}) { const box = useRef<HTMLDivElement>(null); useEffect(() => { const previous = document.activeElement as HTMLElement; const timer = setTimeout(() => box.current?.querySelector<HTMLElement>('input,textarea,button')?.focus(), 30); function key(e: KeyboardEvent) { if (e.key === 'Escape')
    onClose(); if (e.key === 'Tab') {
    const elements = box.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a,input,select,textarea');
    if (!elements?.length)
        return;
    const first = elements[0], last = elements[elements.length - 1];
    if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
    }
    else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
    }
} } document.addEventListener('keydown', key); return () => { clearTimeout(timer); document.removeEventListener('keydown', key); previous?.focus?.(); }; }, []); return <div className="modal-backdrop kbl-modal-v2" onClick={e => { if (e.target === e.currentTarget)
    onClose(); }}><div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={box}><header><h2>{title}</h2><button className="icon-button" aria-label="Đóng" onClick={onClose}><X size={18}/></button></header>{children}</div></div>; }
