'use strict';
const ids=['composer','send','responses','generated'];
(async()=>{const {config={},status=''}=await chrome.storage.local.get(['config','status']);document.getElementById('token').value=config.token||'';document.getElementById('enabled').checked=config.enabled===true;for(const id of ids)if(config.selectors?.[id])document.getElementById(id).value=config.selectors[id];document.getElementById('status').textContent=status;})();
document.getElementById('save').onclick=async()=>{let token=document.getElementById('token').value.trim();const prior=(await chrome.storage.local.get('config')).config;if((await chrome.storage.local.get('active')).active&&prior?.token!==token){document.getElementById('status').textContent='Đang có phiên; chưa đổi ghép nối.';return;}if(/^KBL42-[a-f0-9]{24}$/.test(token)){try{const r=await fetch('http://127.0.0.1:39878/browser/pair',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json','x-kbl-extension-id':chrome.runtime.id},body:JSON.stringify({code:token})});const v=await r.json();if(!r.ok||!v.success)throw Error(v.message||'Ghép lỗi');token=v.token;await chrome.storage.local.set({pairedAccountId:v.accountId});document.getElementById('token').value=token;}catch(e){document.getElementById('status').textContent=e.message;return;}}if(!/^[a-zA-Z0-9_-]{43}$/.test(token)){document.getElementById('status').textContent='Lấy mã ghép một lần tại Admin → Đội AI.';return;}const old=(await chrome.storage.local.get('config')).config;if(old?.token&&old.token!==token&&(await chrome.storage.local.get('active')).active){document.getElementById('status').textContent='Hồ sơ đang có phiên; chưa đổi mã ghép.';return;}const selectors=Object.fromEntries(ids.map(id=>[id,document.getElementById(id).value]));try{for(const s of Object.values(selectors)){if(s.length>500)throw Error();if(s.trim())document.querySelector(s);}}catch(_){document.getElementById('status').textContent='Selector CSS sai.';return;}await chrome.storage.local.set({config:{token,enabled:document.getElementById('enabled').checked,selectors},status:'Đã lưu. Đăng nhập chatbox bằng giao diện chính thức, giữ Chrome đang mở.'});const account=(await chrome.storage.local.get('pairedAccountId')).pairedAccountId;document.getElementById('status').textContent='Đã lưu kết nối'+(account?' cho '+account:'')+'. Mã ghép một lần hết hạn không làm mất kết nối đã lưu.';await chrome.runtime.sendMessage({type:'WAKE'});};

function bounded(p,ms=30000){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Kiểm tra quá thời gian. Cầu nối hoặc tiện ích chưa phản hồi; không cần xóa mã ghép.')),ms);Promise.resolve(p).then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});});}
let checking=false;
async function checkIdentity(){
 if(checking)return;checking=true;
 const box=document.getElementById('identity'),button=document.getElementById('check');
 button.disabled=true;button.textContent='Đang kiểm tra…';box.textContent='Đang xác nhận cầu nối và hồ sơ…';
 try{
  const {config}=await chrome.storage.local.get('config');if(!config?.token)throw Error('Chưa ghép hồ sơ. Lấy mã cho đúng vai trò từ Admin.');
  const r=await fetch('http://127.0.0.1:39878/browser/identity',{redirect:'error',signal:AbortSignal.timeout(10000),headers:{'x-kbl-browser-token':config.token,'x-kbl-extension-id':chrome.runtime.id}});
  const v=await r.json();if(!r.ok||!v.success||!v.account)throw Error(v.message||'Mã ghép chưa được cầu nối xác nhận.');
  const label='Đang ghép: '+v.account.id+' · '+v.account.label;
  box.textContent=label+' — đang kiểm tra ô nhập chatbox…';
  await chrome.storage.local.set({pairedAccountId:v.account.id});
  const result=await bounded(chrome.runtime.sendMessage({type:'CHECK_SESSION'}));
  if(!result?.ok||result.error)throw Error(result?.error||'Tiện ích nền chưa có lệnh kiểm tra mới. Tải lại tiện ích.');
  box.textContent=label+'. '+result.message;
 }catch(e){box.textContent='Kiểm tra chưa đạt: '+e.message;}
 finally{checking=false;button.disabled=false;button.textContent='Kiểm tra kết nối và phiên';}
}
document.getElementById('check').onclick=checkIdentity;
checkIdentity();
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.status)document.getElementById('status').textContent=changes.status.newValue||'';});
document.getElementById('quiet').onclick=async()=>{
 const button=document.getElementById('quiet'),box=document.getElementById('status');
 button.disabled=true;box.textContent='Đang sắp xếp cửa sổ AI…';
 try{
  const win=await chrome.windows.getCurrent();
  // The popup can close when Chrome moves a tab. The service worker owns
  // the entire operation and persists its outcome for the next popup.
  const result=await bounded(chrome.runtime.sendMessage({type:'QUIET_WINDOW',windowId:win.id}));
  if(!result?.ok)throw Error(result?.error||'Tiện ích nền chưa cập nhật. Tải lại tiện ích KBL.');
  box.textContent=result.message;
 }catch(e){box.textContent='Chưa thu nhỏ được: '+e.message;}
 finally{button.disabled=false;}
};

const pickButton=document.getElementById('pick-composer');
if(pickButton)pickButton.onclick=async()=>{
 pickButton.disabled=true;
 try{const result=await bounded(chrome.runtime.sendMessage({type:'BEGIN_COMPOSER_PICK'}));if(!result?.ok)throw Error(result?.error||'Chưa mở được chế độ chọn.');document.getElementById('identity').textContent=result.message;}
 catch(e){document.getElementById('identity').textContent=e.message;}
 finally{pickButton.disabled=false;}
};
chrome.storage.onChanged.addListener((changes,area)=>{
 if(area==='local'&&changes.config){for(const id of ids)document.getElementById(id).value=changes.config.newValue?.selectors?.[id]||'';}
});

document.getElementById('open-held').onclick=async()=>{
 const box=document.getElementById('identity');
 try{const r=await bounded(chrome.runtime.sendMessage({type:'OPEN_HELD_RUN'}));if(!r?.ok)throw Error(r?.error||'Chưa mở được phiên.');box.textContent=r.message;}
 catch(e){box.textContent=e.message;}
};

document.getElementById('pick-send').onclick=async()=>{
 const button=document.getElementById('pick-send'),box=document.getElementById('identity');button.disabled=true;
 try{const r=await bounded(chrome.runtime.sendMessage({type:'BEGIN_SEND_PICK'}));if(!r?.ok)throw Error(r?.error||'Chưa bật chọn nút gửi.');box.textContent=r.message;}
 catch(e){box.textContent=e.message;}finally{button.disabled=false;}
};

document.getElementById('pick-result').onclick=async()=>{
 const button=document.getElementById('pick-result'),box=document.getElementById('identity');button.disabled=true;document.getElementById('pick-feedback').textContent='Đang mở chế độ chọn kết quả…';
 try{const r=await bounded(chrome.runtime.sendMessage({type:'BEGIN_RESULT_PICK'}));if(!r?.ok)throw Error(r?.error||'Chưa bật chọn kết quả.');box.textContent=r.message;await chrome.storage.local.set({resultPickFeedback:r.message});}
 catch(e){box.textContent=e.message;await chrome.storage.local.set({resultPickFeedback:e.message});}finally{button.disabled=false;}
};

(async()=>{const {resultPickFeedback=''}=await chrome.storage.local.get('resultPickFeedback');document.getElementById('pick-feedback').textContent=resultPickFeedback;})();
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.resultPickFeedback)document.getElementById('pick-feedback').textContent=changes.resultPickFeedback.newValue||'';});

const recoveryButton=document.getElementById('check-recovery');
async function checkRecovery(){
 const box=document.getElementById('recovery-feedback');recoveryButton.disabled=true;box.textContent='Đang đối chiếu đúng lượt trong các tab AI…';
 try{const r=await bounded(chrome.runtime.sendMessage({type:'CHECK_RECOVERY'}));if(!r?.ok)throw Error(r?.error||'Chưa kiểm tra được lượt.');box.textContent=r.message;}
 catch(e){box.textContent=e.message;}finally{recoveryButton.disabled=false;}
}
recoveryButton.onclick=checkRecovery;
function showRecoveryAt(report){document.getElementById('recovery-updated').textContent=report?.at?'Đối chiếu gần nhất: '+new Date(report.at).toLocaleString('vi-VN'):'';if(report?.message)document.getElementById('recovery-feedback').textContent=report.message;}
(async()=>{const {recoveryReport}=await chrome.storage.local.get('recoveryReport');showRecoveryAt(recoveryReport);})();
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.recoveryReport)showRecoveryAt(changes.recoveryReport.newValue);});

function windowStatus(v){const el=document.getElementById('window-status');if(el)el.textContent=[v.nativeWindowStatus,v.nativeWindowError].filter(Boolean).join(' · ');}
chrome.storage.local.get(['nativeWindowStatus','nativeWindowError']).then(windowStatus);
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&(changes.nativeWindowStatus||changes.nativeWindowError))chrome.storage.local.get(['nativeWindowStatus','nativeWindowError']).then(windowStatus);});
