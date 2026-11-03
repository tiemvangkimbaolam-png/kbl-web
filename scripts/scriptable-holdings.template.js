// KIM BAO LAM — private holdings widget, version 1.1.0.
// Reads only your summary using a revocable token; never modifies trades or POS.
// Token stays in Scriptable Keychain. No portfolio files, contacts, photos or location.
const ORIGIN='https://tiemvangkimbaolam.id.vn',API=ORIGIN+'/api/public/holdings';
const KEY='kbl-holdings-token-v1',LOGO='__KBL_LOGO__';
async function request(suffix,token,body){
 const r=new Request(API+suffix);r.method=body?'POST':'GET';r.timeoutInterval=15;r.allowInsecureRequest=false;r.onRedirect=()=>null;
 r.headers={'Content-Type':'application/json',Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{})};if(body)r.body=JSON.stringify(body);
 const raw=await r.loadString();if(!r.response||r.response.url!==API+suffix||raw.length>200000)throw Error('Nguồn dữ liệu chưa hợp lệ.');
 if(r.response.statusCode===401){if(Keychain.contains(KEY))Keychain.remove(KEY);throw Error('Chưa ghép hoặc quyền đã thu hồi. Mở Scriptable và ghép lại.');}
 if(r.response.statusCode!==200)throw Error('Chưa lấy được dữ liệu mới. Chạm để mở website.');return JSON.parse(raw);
}
async function pair(){
 const a=new Alert();a.title='Ghép Vàng của tôi';a.message='Đăng nhập website KBL → Vàng của tôi → Tạo mã ghép. Dán mã dùng một lần trong 10 phút. Mã này cho phép widget đọc tóm tắt tài sản của bạn.';a.addSecureTextField('Mã ghép một lần');a.addAction('Ghép tài khoản');a.addCancelAction('Hủy');if(await a.presentAlert()<0)return false;
 const code=a.textFieldValue(0).trim();if(!/^[a-f0-9\s-]{32,50}$/i.test(code))throw Error('Mã ghép chưa đúng.');const result=await request('/redeem',null,{code});if(!/^[a-f0-9]{64}$/.test(result.token||''))throw Error('Chưa nhận được quyền widget.');Keychain.set(KEY,result.token);return true;
}
async function run(){
 if(!config.runsInWidget){
  if(Keychain.contains(KEY)){const a=new Alert();a.title='Vàng của tôi';a.addAction('Xem widget');a.addAction('Ghép lại / đổi tài khoản');a.addCancelAction('Hủy');const choice=await a.presentSheet();if(choice<0){Script.complete();return;}if(choice===1&&!await pair()){Script.complete();return;}}
  else if(!await pair()){Script.complete();return;}
 }
 let data=null,error='';try{if(!Keychain.contains(KEY))throw Error('Mở Scriptable để ghép với tài khoản của bạn.');data=await request('/widget',Keychain.get(KEY));}catch(e){error=e.message||'Chưa kết nối được.';}
 const s=data?.summary,valid=s&&Number.isSafeInteger(s.totalUnits)&&s.totalUnits>=0&&Number.isSafeInteger(s.costVnd)&&s.costVnd>=0&&Array.isArray(s.positions)&&s.positions.length<=6&&(s.valueVnd===null||Number.isSafeInteger(s.valueVnd))&&(s.gainVnd===null||Number.isSafeInteger(s.gainVnd))&&(s.gainPct===null||Number.isFinite(s.gainPct));
 const small=config.widgetFamily==='small',large=config.widgetFamily==='large'||config.widgetFamily==='extraLarge',hide=/^(ẩn|an|hide)$/i.test(String(args.widgetParameter||'').trim());
 const w=new ListWidget();w.backgroundColor=new Color('FFFAF5');w.setPadding(small?10:13,small?10:16,10,small?10:16);w.url=ORIGIN+'/vang-cua-toi';w.refreshAfterDate=new Date(Date.now()+5*60000);
 const ink='132E42',copper='9B4D2D',muted='727C82',gainColor=s?.gainVnd>0?'246C51':s?.gainVnd<0?'B34141':muted;
 function text(parent,value,size,color=ink,bold=false){const t=parent.addText(String(value));t.font=bold?Font.boldSystemFont(size):Font.systemFont(size);t.textColor=new Color(color);t.lineLimit=1;t.minimumScaleFactor=.65;return t;}
 const money=n=>hide?'••••••':n===null||n===undefined?'—':String(n).replace(/\B(?=(\d{3})+(?!\d))/g,'.')+' đ',qty=n=>hide?'•••':String(n/1000).replace('.',',');
 const header=w.addStack();header.centerAlignContent();try{const logo=header.addImage(Image.fromData(Data.fromBase64String(LOGO)));logo.imageSize=new Size(small?19:26,small?19:26);logo.applyFittingContentMode();header.addSpacer(6);}catch{}
 text(header,small?'VÀNG CỦA TÔI':'KIM BẢO LÂM · VÀNG CỦA TÔI',small?9:11,copper,true);w.addSpacer(small?7:9);
 if(!valid){const t=text(w,error||'Chưa đọc được sổ vàng.',small?11:13,muted);t.lineLimit=4;w.addSpacer();text(w,'Chạm để mở website',9,copper);}
 else{
  const stats=w.addStack(),balance=stats.addStack();balance.layoutVertically();text(balance,qty(s.totalUnits)+' chỉ',small?22:large?28:25,ink,true);
  if(!small)text(balance,'Đang sở hữu · '+money(s.valueVnd),large?13:10,muted);
  if(!small){stats.addSpacer();const gain=stats.addStack();gain.layoutVertically();text(gain,hide?'••• %':s.gainPct===null?'Chưa đủ giá':(s.gainVnd>0?'↗ +':s.gainVnd<0?'↘ ':'→ ')+s.gainPct.toFixed(2).replace('.',',')+'%',large?24:20,gainColor,true);text(gain,(s.gainVnd>0&&!hide?'+':'')+money(s.gainVnd),large?15:12,gainColor,true);}
  else{w.addSpacer(3);text(w,hide?'••• %':s.gainPct===null?'Chưa đủ giá':(s.gainVnd>0?'↗ +':s.gainVnd<0?'↘ ':'→ ')+s.gainPct.toFixed(2).replace('.',',')+'%',16,gainColor,true);text(w,(s.gainVnd>0&&!hide?'+':'')+money(s.gainVnd),10,gainColor);}
  const points=(data.series||[]).filter(p=>Number.isFinite(p.at)&&Number.isFinite(p.value)).slice(-31);
  w.addSpacer(large?8:4);
  if(!hide&&points.length>=2){try{
   const width=small?130:300,height=small?18:large?42:32,ctx=new DrawContext();ctx.size=new Size(width,height);ctx.opaque=false;ctx.respectScreenScale=true;
   const min=Math.min(...points.map(p=>p.value)),max=Math.max(...points.map(p=>p.value)),range=max-min||1,duration=points[points.length-1].at-points[0].at||1,path=new Path();
   points.forEach((p,i)=>{const point=new Point(3+(p.at-points[0].at)*(width-6)/duration,height-3-(p.value-min)*(height-6)/range);if(i===0)path.move(point);else path.addLine(point);});ctx.addPath(path);ctx.setStrokeColor(new Color(gainColor));ctx.setLineWidth(2);ctx.strokePath();const chart=w.addImage(ctx.getImage());chart.imageSize=new Size(width,height);chart.applyFittingContentMode();
  }catch{}}
  else if(!small)text(w,hide?'Đã ẩn thông tin tài sản':'Chưa đủ hai mốc giá thật để vẽ đường',9,muted);
  if(large){w.addSpacer(8);for(const p of s.positions.slice(0,3)){const row=w.addStack();text(row,'Vàng '+(p.code==='9999'?'999.9':p.code)+' · '+qty(p.units)+' chỉ',11,ink,true);row.addSpacer();text(row,money(p.valueVnd),11,copper,true);w.addSpacer(4);}if(s.positions.length>3)text(w,'Và '+(s.positions.length-3)+' loại vàng khác',9,muted);w.addSpacer(3);text(w,'Vốn còn giữ · '+money(s.costVnd),11,muted);}
  w.addSpacer();
  text(w,small?'Vốn · '+money(s.costVnd):'Lãi/lỗ tạm tính theo giá mua vào',small?8:9,muted);
  if(!small){const a=text(w,'59/1 Nguyễn Thị Tươi, Phường Tân Đông Hiệp, Tp. Hồ Chí Minh',large?8:7,copper);a.lineLimit=2;}
  if(s.sourceAt){const d=new Date(s.sourceAt+7*3600000),pad=n=>String(n).padStart(2,'0');text(w,'Giá mua vào · '+pad(d.getUTCHours())+':'+pad(d.getUTCMinutes())+' '+pad(d.getUTCDate())+'/'+pad(d.getUTCMonth()+1),small?7:8,muted);}
 }
 Script.setWidget(w);if(!config.runsInWidget){if(small)await w.presentSmall();else if(large)await w.presentLarge();else await w.presentMedium();}Script.complete();return w;
}
try{await run();}catch(e){if(config.runsInWidget){const w=new ListWidget();w.addText('Mở Scriptable để ghép lại Vàng của tôi.');w.url=ORIGIN+'/vang-cua-toi';Script.setWidget(w);}else{const a=new Alert();a.title='Chưa mở được Vàng của tôi';a.message=e.message||String(e);a.addAction('OK');await a.presentAlert();}Script.complete();}
