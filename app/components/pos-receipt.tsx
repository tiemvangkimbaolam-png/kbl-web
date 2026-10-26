'use client';
import { useEffect, useState } from 'react';
import { Brand, cash, date } from './ui';
export default function PosReceipt({ initialToken = '' }: { initialToken?: string }) {
    const [value, setValue] = useState<any>(null), [error, setError] = useState(''), [token, setToken] = useState(initialToken), [busy, setBusy] = useState(false);
    async function lookup(secret: string) {
        setError(''); setValue(null); setBusy(true);
        try {
            const r = await fetch('/api/public/pos-receipt', { cache: 'no-store', referrerPolicy: 'no-referrer', headers: { 'x-kbl-receipt-token': secret } }), v: any = await r.json();
            if (!r.ok) throw Error(v.error || 'Chưa tìm thấy phiếu.'); setValue(v);
        } catch (e: any) { setError(e.message); } finally { setBusy(false); }
    }
    useEffect(() => {
        const u = new URL(location.href), secret = initialToken || u.searchParams.get('token') || new URLSearchParams(location.hash.slice(1)).get('token') || '';
        if (secret) { setToken(secret); lookup(secret); }
        // Old printed POS QR query strings still work; remove the capability from
        // history immediately. Requests use a header, not a referer/query string.
        if (secret && (u.search || initialToken)) history.replaceState(null, '', '/tra-cuu#token=' + encodeURIComponent(secret));
    }, [initialToken]);
    const r = value?.record;
    return <><meta name="referrer" content="no-referrer"/><meta name="robots" content="noindex,nofollow"/><header className="masthead"><div className="wrap"><Brand/><a href="/" className="button quiet">Trang chủ</a></div></header><main className="wrap" style={{ maxWidth: 760, paddingBlock: 48 }}><h1>Tra cứu phiếu từ POS</h1><p className="muted" style={{ marginBlock: 18 }}>Quét QR trên phiếu hoặc nhập mã bảo mật đi kèm. Mã số phiếu riêng lẻ không mở được thông tin khách hàng.</p><form className="row" style={{ flexWrap: 'wrap' }} onSubmit={e => { e.preventDefault(); lookup(token); }}><label style={{ flex: 1 }}>Mã bảo mật QR<input value={token} onChange={e => setToken(e.target.value)} autoComplete="off" type="password" required maxLength={128}/></label><button className="button" disabled={busy}>{busy ? 'Đang tra cứu…' : 'Tra cứu'}</button></form>{error && <p className="error-box" role="alert">{error}</p>}{r && <section className="card" style={{ marginTop: 24 }}><h2>{value.kind === 'pawn' ? 'Phiếu cầm đồ · ' + r.receiptCode : 'Phiếu bảo hành · ' + r.productSku}</h2><p className="small muted" style={{ marginBlock: 16 }}>POS đồng bộ lúc {date(value.syncedAt)}. {value.stale ? 'Dữ liệu đã quá 30 phút; xác nhận lại tại cửa hàng trước khi thanh toán.' : ''}</p>{value.kind === 'pawn' ? <dl className="stack"><div>Khách hàng: <strong>{r.name}</strong></div><div>Tài sản: <strong>{r.asset}</strong></div><div>Trạng thái: <strong>{r.status}</strong></div><div>Ngày cầm / Hạn: {r.dateStart} / {r.dateEnd}</div><div>Tiền cầm: <strong>{cash(r.money)}</strong></div><div>Tiền lãi POS tính: <strong>{cash(r.interestDue)}</strong></div><div>Tiền phí POS tính: <strong>{cash(r.feeDue)}</strong></div><div>Tổng theo POS: <strong>{cash(r.totalDue)}</strong></div></dl> : <dl className="stack"><div>Hóa đơn: <strong>{r.invoiceId}</strong></div>{r.posStatus && <div>Trạng thái POS: <strong>{r.posStatus === 'returned' ? 'Đã trả hàng' : 'Đã hủy'}</strong></div>}<div>Khách hàng: <strong>{r.customerName || 'Khách lẻ'}</strong></div><div>Ngày bán: {r.soldAt}</div><div>Tuổi vàng: <strong>{r.soldGoldCode}</strong></div><div>Trọng lượng bán: <strong>{r.soldWeightChi} chỉ</strong></div><div>Tiền công ghi trên phiếu: <strong>{cash(r.soldWorkmanship)}</strong></div></dl>}<p className="small muted" style={{ marginTop: 24 }}>Thông tin hiển thị từ POS. Website không tính lại lãi/phí và không sửa phiếu gốc.</p></section>}</main></>;
}
