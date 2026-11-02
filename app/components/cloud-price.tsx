'use client';
import {useEffect,useState} from 'react';
import {api,date,Badge} from './ui';
export default function CloudPrice(){
 const [s,setS]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(){try{setS(await api('admin/cloud-price'));setError('');}catch(e:any){setError(e.message);}}
 useEffect(()=>{load();const t=setInterval(()=>{if(!document.hidden)void load();},30000);return()=>clearInterval(t);},[]);
 async function poll(){setBusy(true);try{await api('admin/cloud-price/poll','POST',{});await load();}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 return <section className="card"><div className="panel-head"><h2>Giá tự động trên Cloudflare</h2><Badge>{s?.fresh?'Đang cập nhật tự động':s?.enabled?'Chờ nguồn / cấu hình':'Chưa bật'}</Badge></div><p>Cloudflare tự đọc BK/ASK khi POS và máy tính tắt, sau khi nhận đủ cấu hình nguồn và chênh lệch của tiệm.</p><p className="small muted">{s?.message||s?.lastError||'Đang kiểm tra cấu hình…'}</p>{(s?.lastSuccessAt||s?.fetchedAt)&&<p>Đọc nguồn thành công: {date(s.lastSuccessAt||s.fetchedAt)}</p>}{s?.encryptionReady===false&&<div className="notice">Cần thêm Secret <strong>KBL_PRICE_ENCRYPTION_KEY</strong> vào Worker Cloudflare (64 ký tự hex ngẫu nhiên), hoặc dùng KBL_SOCIAL_ENCRYPTION_KEY đã cấu hình. Không nhập khóa vào POS hay gửi trong chat.</div>}<p className="small muted">Mở Windows worker đã cập nhật, lưu thư mục dữ liệu POS. Cấu hình Google Relay được bàn giao qua kết nối riêng; không thay công thức POS. Cron đọc mỗi phút, không phải luồng tick theo giây.</p>{error&&<p role="alert">{error}</p>}<button className="button secondary" disabled={busy} onClick={poll}>{busy?'Đang kiểm tra…':'Kiểm tra nguồn ngay'}</button></section>;
}
