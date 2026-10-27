'use client';
import {useEffect,useState} from 'react';
import {displayGoldPrices} from '@/lib/kbl/display-prices.mjs';
import {cash,date} from '../components/ui';
export default function TV(){
 const [data,setData]=useState<any>(null),[error,setError]=useState('');
 useEffect(()=>{const c=new AbortController();async function load(){try{const r=await fetch('/api/public/catalog',{cache:'no-store',signal:c.signal});if(!r.ok)throw Error();setData(await r.json());setError('');}catch{if(!c.signal.aborted)setError('Chưa đọc được giá mới.');}}load();const t=setInterval(load,30000);return()=>{c.abort();clearInterval(t);};},[]);
 const rows=displayGoldPrices(data?.prices||[]);
 return <main style={{minHeight:'100vh',padding:'4vw',background:'#fffaf0',color:'#12314f'}}><h1 style={{fontSize:'4vw'}}>TIỆM VÀNG KIM BẢO LÂM</h1><h2>BẢNG GIÁ VÀNG · ĐỒNG / CHỈ</h2><table style={{width:'100%',fontSize:'clamp(24px,4vw,80px)',lineHeight:2.3}}><thead><tr><th>Loại vàng</th><th>Mua vào</th><th>Bán ra</th></tr></thead><tbody>{rows.map((p:any)=><tr key={p.id}><th>{p.label}</th><td>{cash(p.unit==='VND/luong'?p.buy/10:p.buy)}</td><td>{cash(p.unit==='VND/luong'?p.sell/10:p.sell)}</td></tr>)}</tbody></table>{!rows.length&&<p>Chờ bảng giá đồng bộ từ cửa hàng.</p>}<p>{error||''} {rows[0]?.capturedAt?'Cập nhật '+date(rows[0].capturedAt):''} {rows.some((p:any)=>p.stale)&&'Giá lưu — cần xác nhận tại cửa hàng.'}</p><a href="/">Về website</a></main>;
}
