'use strict';
const fs=require('node:fs');
const normalize=s=>String(s||'').replace(/\s+/g,' ').trim();
const words=s=>normalize(s).split(' ').filter(Boolean);
function pace(text){const numbers=(text.match(/\d+(?:[.,]\d+)?/g)||[]).length,careful=/lãi suất|chính sách|nghị định|tỷ giá|phần trăm|chưa xác nhận/i.test(text);return numbers>=2||careful?0.95:/tin nóng|khẩn|vừa|đột ngột/i.test(text)?1.08:1.02;}
function estimate(text,start,end){const tokens=words(text),weights=tokens.map(w=>Math.max(2,w.length)+(/[.!?;:,]$/.test(w)?3:0)),sum=weights.reduce((a,b)=>a+b,0);let at=start;return tokens.map((word,i)=>{const next=i===tokens.length-1?end:at+(end-start)*weights[i]/sum;const row={text:word,start:at,end:next};at=next;return row;});}
function read(file,text,duration){try{const p=file+'.json';if(fs.statSync(p).size>300000)return [];const rows=JSON.parse(fs.readFileSync(p,'utf8'));if(!Array.isArray(rows)||rows.length>1000)return [];let last=0;const out=[];for(const row of rows){const start=Number(row.start)/1000,end=Number(row.end)/1000;if(!Number.isFinite(start)||!Number.isFinite(end)||start<last-.03||start<0||end<=start||end>duration+.1)return [];const tokens=estimate(row.part,start,end);out.push(...tokens);last=end;}return normalize(out.map(x=>x.text).join(' '))===normalize(text)?out:[];}catch{return [];}}
function phrases(text){const chunks=normalize(text).match(/.+?(?:[.!?]+(?=\s|$)|$)/g)||[text],out=[];for(const chunk of chunks){const tokens=words(chunk);for(let i=0;i<tokens.length;i+=20)out.push(tokens.slice(i,i+20).join(' '));}if(out.length>20)throw Error('Tin quá dài; cần tóm tắt trước khi dựng.');return out.filter(Boolean);}
const time=s=>{const centis=Math.round(Math.max(0,s)*100);return Math.floor(centis/360000)+':'+String(Math.floor(centis/6000)%60).padStart(2,'0')+':'+String(Math.floor(centis/100)%60).padStart(2,'0')+'.'+String(centis%100).padStart(2,'0');};
const escape=s=>String(s).replace(/[\\{}]/g,'').replace(/[\r\n]/g,' ');
function ass(timings,total,portrait=false,plan){if(!Array.isArray(timings)||!timings.length||!Number.isFinite(total)||total<=0)throw Error('Thiếu mốc chữ bản tin.');const pages=[];let page=[],chars=0,last=0;for(const w of timings){if(!w.text||!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.end<=w.start||w.start<last-.03||w.end>total+.1)throw Error('Mốc chữ bản tin không hợp lệ.');if(page.length&&(chars+w.text.length>66||page.length>=11||/[.!?…]$/.test(page.at(-1).text))){pages.push(page);page=[];chars=0;}page.push(w);chars+=w.text.length+1;last=w.end;}if(page.length)pages.push(page);
 const header='[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: News,DejaVu Sans,46,&H00FFFFFF,&HFFFAFAFA,&H00244308,&H00244308,1,0,0,0,100,100,0,0,1,2,0,2,80,80,142,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
 const style=portrait?header.replace('Sans,46,','Sans,50,').replace(',80,80,142,1',plan?.storyboard?.kind==='product'?',112,112,374,1':',112,176,574,1'):header;
 if(portrait&&plan?.storyboard?.kind==='gold'){
  const scene=require('./kbl-bulletin-timing').timeline(plan,timings,total),events=[];let cursor=0;
  for(const [i,c]of plan.storyboard.chapters.entries()){
   const count=words(c.text).length,tokens=timings.slice(cursor,cursor+count),range=scene[i];cursor+=count;
   if(c.type==='rate'){
    const sell=tokens.find(w=>w.text.toLowerCase()==='bán'),split=sell?.start;if(!(split>range.start&&split<range.end))throw Error('Thiếu mốc giá bán để chạy chữ.');
    events.push({start:range.start,end:split,text:'Vàng '+c.code+' · MUA VÀO\\N'+c.buy.toLocaleString('vi-VN')+' đồng / chỉ'},{start:split,end:range.end,text:'Vàng '+c.code+' · BÁN RA\\N'+c.sell.toLocaleString('vi-VN')+' đồng / chỉ'});
   }else events.push({start:range.start,end:range.end,text:c.type==='open'?'Giá tại thời điểm cập nhật':'Cảm ơn quý khách đã xem!\\NTheo dõi & chia sẻ mỗi ngày'});
  }
  return style+events.map(e=>'Dialogue: 0,'+time(e.start)+','+time(e.end)+',News,,0,0,0,,{\\fad(100,100)}'+e.text).join('\n')+'\n';
 }
 return style+pages.map((p,i)=>{const end=Math.min(total,pages[i+1]?.[0].start??p.at(-1).end+.5),text=p.map((w,j)=>'{\\ko'+Math.max(1,Math.round(((p[j+1]?.start??w.end)-w.start)*100))+'}'+escape(w.text)).join(' ');return 'Dialogue: 0,'+time(p[0].start)+','+time(end)+',News,,0,0,0,,{\\fad(80,100)}'+text;}).join('\n')+'\n';
}
function filter(file,fontsDir){const arg=file=>{const value=file.replace(/\\/g,'/').replace(/[\\':]/g,c=>'\\'+c);return value.replace(/[\\'\[\],;]/g,c=>'\\'+c)};return 'subtitles=filename='+arg(file)+(fontsDir?':fontsdir='+arg(fontsDir):'');}
module.exports={pace,estimate,read,phrases,ass,filter};
