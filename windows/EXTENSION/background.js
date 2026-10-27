'use strict';
const BASE='http://127.0.0.1:39878';let busy=false,recovery42Session=null;
function pending(action,value){return new Promise((resolve,reject)=>{const req=indexedDB.open('kbl-browser-results',1);req.onupgradeneeded=()=>req.result.createObjectStore('pending');req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('pending',action==='get'?'readonly':'readwrite'),store=tx.objectStore('pending');let result,conflict;
 const get=store.get('outbox');get.onsuccess=()=>{result=get.result;if(action==='set'){if(result&&JSON.stringify(result)!==JSON.stringify(value)){conflict=Error('Đã giữ kết quả khác; chưa ghi đè outbox.');tx.abort();return;}store.put(value,'outbox');}else if(action==='delete')store.delete('outbox');};
 tx.oncomplete=()=>{db.close();resolve(result);};tx.onabort=()=>{db.close();reject(conflict||tx.error||Error('Outbox chưa ghi được.'));};tx.onerror=()=>{db.close();reject(tx.error);};};});}

const bytes64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);};
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
async function local(route,body){const {config}=await chrome.storage.local.get('config');if(!config?.token)throw Error('Chưa ghép local');const r=await fetch(BASE+route,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(25000),headers:{'x-kbl-browser-token':config.token,'x-kbl-extension-id':chrome.runtime.id,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});if(!/application\/json/.test(r.headers.get('content-type')||''))throw Error('Local không trả JSON');const v=await r.json();if(!r.ok||!v.success)throw Error(v.message||'Local đang chờ');return v;}
async function status(s){await chrome.storage.local.set({status:String(s).slice(0,350)});}
const RECOVERY_REASONS={TAB_METADATA_MISMATCH:'Tab đang gắn mã của lượt khác.',NO_RUN_PROOF:'Chưa thấy dấu phiên hoặc JSON đúng mã lượt trong câu trả lời.',WAIT_RESPONSE:'Đã nhận đúng phiên; đang chờ câu trả lời hoàn chỉnh.',READY_TO_COLLECT:'Đã thấy JSON đúng mã lượt; bộ thu sẽ kiểm tra rồi bàn giao.',QUOTA:'Chatbox báo hết lượt.',CHALLENGE:'Trang yêu cầu xác minh.',RESULT_CONFLICT:'Có kết quả mâu thuẫn; cần kiểm tra.',ADAPTER_UNAVAILABLE:'Một tab chưa phản hồi hoặc chưa nạp được bộ nhận diện.',WAIT_TAB:'Cuộc trò chuyện đang tải.',NO_TAB:'Chưa mở cuộc trò chuyện đang giữ.',DUPLICATE:'Nhiều tab cùng mã lượt; chưa chọn để tránh nhận nhầm.'};
async function recordRecovery(task,code,counts={}){
 const {recoveryReport,recoveryHistory=[]}=await chrome.storage.local.get(['recoveryReport','recoveryHistory']);
 const entry={at:Date.now(),runId:task?.runId||'',kind:task?.kind||'',code,counts,message:RECOVERY_REASONS[code]||'Đang kiểm tra phiên.'};
 const changed=!recoveryReport||recoveryReport.runId!==entry.runId||recoveryReport.code!==code;
 await chrome.storage.local.set({recoveryReport:entry,...(changed?{recoveryHistory:[...recoveryHistory,entry].slice(-30)}:{})});
 return RECOVERY_REASONS[code]||'Đang kiểm tra phiên.';
}

const SITES={gemini:'https://gemini.google.com/app',chatgpt:'https://chatgpt.com/',claude:'https://claude.ai/',deepseek:'https://chat.deepseek.com/',grok:'https://grok.com/'};
let provider='gemini';
function ownedURL(raw,p=provider){try{return new URL(raw).origin===new URL(SITES[p]).origin;}catch{return false;}}
function conversationURL(raw,p=provider){try{const u=new URL(raw);return ownedURL(raw,p)&&!u.search&&!u.hash&&({gemini:/^\/app\/[a-zA-Z0-9_-]+$/,chatgpt:/^\/c\/[a-zA-Z0-9_-]+$/,claude:/^\/chat\/[a-zA-Z0-9_-]+$/,deepseek:/^\/a\/chat\/s\/[a-zA-Z0-9_-]+$/}[p]).test(u.pathname);}catch{return false;}}
const ADAPTER_VERSION='2.0.0';
function boundedProbe(p,ms=5000){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Tab chưa phản hồi kiểm tra phiên.')),ms);Promise.resolve(p).then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});});}
let quieting=false;
const quietWindowTabs=tabs=>tabs.length>0&&tabs.every(t=>!t.pendingUrl||Object.keys(SITES).some(p=>ownedURL(t.pendingUrl,p)))&&tabs.every(t=>Object.keys(SITES).some(p=>ownedURL(t.url,p))||String(t.url||'').startsWith(chrome.runtime.getURL('')));
async function claimWindow(windowId){
 const {nativeWindowClaims={}}=await chrome.storage.local.get('nativeWindowClaims');
 let claim=nativeWindowClaims[windowId];
 if(!/^[a-f0-9]{32}$/.test(claim||'')){claim=crypto.randomUUID().replace(/-/g,'');nativeWindowClaims[windowId]=claim;await chrome.storage.local.set({nativeWindowClaims});}
 return claim;
}
async function hideNative(windowId){
 const members=await chrome.tabs.query({windowId});if(!quietWindowTabs(members))return {mode:'mixed'};
 const active=members.find(t=>t.active&&Object.keys(SITES).some(p=>ownedURL(t.url,p))&&t.status==='complete');
 if(!active)return {mode:'minimized'};
 const claim=await claimWindow(windowId),marker=crypto.randomUUID().replace(/-/g,'');
 try{
  // A fresh random title links a Chrome window to a native HWND. It is not a
  // provider prompt, and no numeric HWND/PID is accepted by the local service.
  const marked=await chrome.scripting.executeScript({target:{tabId:active.id},func:(key)=>{
   if(!/^[a-f0-9]{32}$/.test(key))return false;
   const prefix='KBL69_'+key+'_',original=document.title;
   const restore=()=>{if(document.title===prefix+original)document.title=original;};
   document.title=prefix+original;setTimeout(restore,20000);return true;
  },args:[marker]});
  if(marked?.[0]?.result!==true)return {mode:'minimized'};
  const current=await chrome.tabs.query({windowId});
  if(!quietWindowTabs(current)||!current.some(t=>t.id===active.id&&t.active))return {mode:'mixed'};
  const r=await local('/browser/window',{action:'hide',claim,marker});
  if(r.mode==='native-hidden'){
   const {nativeHiddenAt={}}=await chrome.storage.local.get('nativeHiddenAt');nativeHiddenAt[windowId]=Date.now();
   await chrome.storage.local.set({nativeHiddenAt,nativeWindowStatus:'Đã ẩn cửa sổ AI trên Windows.',nativeWindowError:''});
  }
  return r;
 }finally{
  await chrome.scripting.executeScript({target:{tabId:active.id},func:(key)=>{
   const prefix='KBL69_'+key+'_';if(document.title.startsWith(prefix))document.title=document.title.slice(prefix.length);
  },args:[marker]}).catch(()=>{});
 }
}
async function showWindow(windowId,{requireNativeClaim=false}={}){
 const {nativeWindowClaims={},nativeHiddenAt={}}=await chrome.storage.local.get(['nativeWindowClaims','nativeHiddenAt']);
 delete nativeHiddenAt[windowId];await chrome.storage.local.set({nativeHiddenAt});
 const claim=nativeWindowClaims[windowId];
 let nativeShown=false;
 if(/^[a-f0-9]{32}$/.test(claim||''))try{nativeShown=(await local('/browser/window',{action:'show',claim})).mode==='native-shown';}catch(e){await chrome.storage.local.set({nativeWindowError:e.message});}
 if(nativeShown)await chrome.storage.local.set({nativeWindowStatus:'Đã hiện cửa sổ AI trên Windows.',nativeWindowError:''});
 if(requireNativeClaim&&!nativeShown)return false;
 return chrome.windows.update(windowId,{focused:true,state:'normal'});
}
async function hideWindow(windowId){
 const {nativeHiddenAt={}}=await chrome.storage.local.get('nativeHiddenAt');
 if(Date.now()-(nativeHiddenAt[windowId]||0)<120000)return true;
 let result;
 try{result=await hideNative(windowId);}catch(e){await chrome.storage.local.set({nativeWindowError:e.message,nativeWindowStatus:'Chưa ẩn được trên Windows; đang thu nhỏ.'});}
 if(result?.mode==='native-hidden')return true;
 if(result?.mode==='visible-lease')return false;
 const members=await chrome.tabs.query({windowId}).catch(()=>[]);
 if(quietWindowTabs(members))await chrome.windows.update(windowId,{state:'minimized'});
 return false;
}
async function unhideMixed(windowId){
 if(!Number.isInteger(windowId))return;
 const {nativeWindowClaims={},managedWindows=[]}=await chrome.storage.local.get(['nativeWindowClaims','managedWindows']);
 if(!nativeWindowClaims[windowId])return;
 const members=await chrome.tabs.query({windowId}).catch(()=>[]);
 if(!members.length||quietWindowTabs(members))return;
 await showWindow(windowId,{requireNativeClaim:true});
 await chrome.storage.local.set({managedWindows:managedWindows.filter(id=>id!==windowId)});
}
async function adoptRestoredWindows(tabs){
 const prefs=await chrome.storage.local.get(['managedWindows','quietWindows','loginVisibleUntil']);
 if(prefs.quietWindows===false||Date.now()<(prefs.loginVisibleUntil||0))return;
 const adopted=new Set(prefs.managedWindows||[]);
 for(const wid of new Set(tabs.map(t=>t.windowId).filter(Number.isInteger))){
  const members=await chrome.tabs.query({windowId:wid}).catch(()=>[]);
  if(quietWindowTabs(members))adopted.add(wid);
 }
 await chrome.storage.local.set({quietWindows:true,managedWindows:[...adopted].slice(-10)});
}
async function quietWindow(windowId){
 if(!Number.isInteger(windowId))throw Error('Chưa xác định được cửa sổ cần thu nhỏ.');
 if(quieting)throw Error('Đang thu nhỏ cửa sổ AI; đợi thao tác trước hoàn tất.');
 quieting=true;
 try{
  const tabs=await chrome.tabs.query({windowId});
  const ai=t=>Object.keys(SITES).some(p=>ownedURL(t.url,p));
  const aiTabs=tabs.filter(ai);
  if(!aiTabs.length)throw Error('Cửa sổ này chưa có tab AI. Mở tiện ích từ tab AI cần thu nhỏ.');
  let target=windowId;
  if(tabs.some(t=>!ai(t)&&!String(t.url||'').startsWith(chrome.runtime.getURL('')))){
   throw Error('Cửa sổ có tab khác ngoài AI; giữ nguyên tab và cửa sổ. Chỉ thu nhỏ cửa sổ AI riêng đã có.');
  }
  // Recheck before hiding: never move tabs or create another window here.
  const members=await chrome.tabs.query({windowId:target});
  if(!members.length||members.some(t=>!ai(t)&&!String(t.url||'').startsWith(chrome.runtime.getURL(''))))throw Error('Cửa sổ đã thay đổi; chưa thu nhỏ để tránh ảnh hưởng tab khác.');
  const hidden=await hideWindow(target);
  const v=await chrome.storage.local.get('managedWindows');
  const message=hidden?'Đã ẩn cửa sổ AI trên Windows. Mở lại từ Admin khi cần.':'Đã thu nhỏ cửa sổ AI; Windows chưa xác nhận ẩn. Chrome vẫn chạy.';
  await chrome.storage.local.set({quietWindows:true,loginVisibleUntil:0,managedWindows:[...new Set([...(v.managedWindows||[]),target])].slice(-10),status:message});
  return {ok:true,windowId:target,message};
 }catch(e){await status('Chưa thu nhỏ được: '+e.message);throw e;}
 finally{quieting=false;}
}
function geminiTab(tab){return ownedURL(tab.url)&&tab.status==='complete';}
async function messageTab(tab,message){
  if(!geminiTab(tab))throw Error('Tab AI chưa tải xong.');
  let probe;try{probe=await boundedProbe(chrome.tabs.sendMessage(tab.id,{type:'PROBE'}));}catch{}
  // Reloading an unpacked extension does not replace its content script in
  // already-open chats. Attach only our packaged script, only on Gemini.
  if(probe?.version!==ADAPTER_VERSION){
    await boundedProbe(chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']}));
    probe=await boundedProbe(chrome.tabs.sendMessage(tab.id,{type:'PROBE'}));
    if(probe?.version!==ADAPTER_VERSION)throw Error('Chưa nạp được tiện ích 0.61.23 vào tab AI; giữ tab và Tải lại tiện ích.');
  }
  return message.type==='PROBE'&& !message.selectors?probe:boundedProbe(chrome.tabs.sendMessage(tab.id,message));
}
async function findOwnedTab(tabs,task,selectors){
  if(tabs.length>20)throw Error('Có hơn 20 tab AI; đóng các tab không liên quan, giữ cuộc hội thoại đang có kết quả.');
  const matches=[];let inaccessible=0;const counts={};
  for(const tab of tabs.filter(geminiTab)){
    let proof;try{proof=await messageTab(tab,{type:'PROBE_RUN',task:{runId:task.runId,nonce:task.nonce,kind:task.kind,attachmentHashes:task.attachmentHashes||[],resumePrepared:task.resumePrepared===true,...(task.resumePrepared?{prompt:task.prompt}:{})},selectors});}catch{inaccessible++;continue;}
    if(proof.code==='RESULT_CONFLICT')throw Error('Có kết quả JSON mâu thuẫn trong tab; giữ lại để kiểm tra, chưa tự chọn.');
    if(proof.matched===true)matches.push(tab);else if(RECOVERY_REASONS[proof.reason||proof.code]){const c=proof.reason||proof.code;counts[c]=(counts[c]||0)+1;}
  }
  if(matches.length>1){await recordRecovery(task,'DUPLICATE',{matches:matches.length});throw Error('Hai tab cùng mã phiên; giữ một tab có kết quả để tránh nhận nhầm.');}
  // Do not choose the one visible match when another inaccessible tab could
  // contain a conflicting result for the same nonce.
  if(inaccessible){await recordRecovery(task,'ADAPTER_UNAVAILABLE',{unreadable:inaccessible});throw Error('Chưa đọc được '+inaccessible+' tab AI; giữ phiên và chờ tiện ích phản hồi.');}
  if(!matches.length)await recordRecovery(task,counts.TAB_METADATA_MISMATCH?'TAB_METADATA_MISMATCH':counts.QUOTA?'QUOTA':counts.CHALLENGE?'CHALLENGE':tabs.some(t=>ownedURL(t.url)&&t.status!=='complete')?'WAIT_TAB':tabs.length?'NO_RUN_PROOF':'NO_TAB',counts);
  return matches[0];
}
// R39: automatic work uses existing tabs only. Never create or close a chat.
async function workTab(url){
 const {idleTab,config}=await chrome.storage.local.get(['idleTab','config']);
 const tabs=await chrome.tabs.query({url:new URL(url).origin+'/*'});
 let candidates=[];
 if(idleTab?.provider===provider){
  candidates=tabs.filter(t=>t.id===idleTab.tabId&&(!idleTab.conversationUrl||t.url===idleTab.conversationUrl||t.pendingUrl===idleTab.conversationUrl));
  if(!candidates.length&&conversationURL(idleTab.conversationUrl,provider))candidates=tabs.filter(t=>t.url===idleTab.conversationUrl||t.pendingUrl===idleTab.conversationUrl);
  if(!candidates.length)throw Error('TAB_LOCK_MISSING: Tab đã gắn không còn mở. Mở lại đúng cuộc hội thoại trong Chrome cũ; chưa tạo tab khác.');
 }else{
  // Bootstrap a single existing provider tab. Do not pick arbitrarily among chats.
  candidates=tabs.filter(t=>ownedURL(t.url,provider));
 }
 if(candidates.length!==1)throw Error(candidates.length?'TAB_LOCK_AMBIGUOUS: Có nhiều tab AI; giữ đúng một tab nhận việc trong hồ sơ này. Chưa tự chọn.':'TAB_LOCK_MISSING: Chưa có tab AI. Mở trang AI trong đúng hồ sơ Chrome đã ghép.');
 const tab=candidates[0];if(!geminiTab(tab))throw Error('TAB_LOCK_LOADING: Đúng tab đang tải; giữ nguyên và chờ.');
 let archived42=null;
 if(idleTab?.archived42){const proof=idleTab.archived42,record=await readArchive42(proof.archiveKey);if(!record||record.kind!=='owner-pairing-recovery'||record.epoch!==proof.epoch||record.active?.runId!==proof.runId||record.active?.nonce!==proof.nonce)throw Error('TAB_LOCK_ARCHIVE: Chưa xác nhận được bản lưu lượt cũ.');archived42=proof;}
 const prepared=await messageTab(tab,{type:'PREPARE_NEXT',retired:idleTab?.retired||null,archived42,selectors:config?.selectors});
 if(prepared?.ok!==true)throw Error(prepared?.error||'TAB_LOCK_BUSY: Tab chưa sẵn sàng nhận việc tiếp theo.');
 await chrome.storage.local.set({idleTab:{...idleTab,tabId:tab.id,provider,conversationUrl:conversationURL(tab.url,provider)?tab.url:''}});
 return tab;
}
// Open only the current run's tab, or its saved conversation URL. This is a
// display/restore operation: no EXECUTE, RECOVER, RESULT or prompt is sent here.
async function focusHeldTab(active,tabs,selectors,who,focus=true){
 if(!SITES[who]||!active?.task||active.task.provider!==who||active.task.runId!==active.runId||active.task.nonce!==active.nonce||!/^[a-f0-9]{36}$/.test(active.runId||'')||!/^[a-f0-9]{36}$/.test(active.nonce||''))throw Error('Hồ sơ hoặc mã lượt đang giữ không khớp; chưa mở phiên khác.');
 provider=who;
 const exact=tabs.find(t=>t.id===active.tabId&&(ownedURL(t.url,who)||ownedURL(t.pendingUrl,who)));
 let tab,exactProof;
 if(exact&&geminiTab(exact)){
  exactProof=await messageTab(exact,{type:'PROBE_RUN',task:active.task,selectors});
  if(exactProof.code==='RESULT_CONFLICT')throw Error('Có JSON mâu thuẫn trong tab đang giữ; chưa mở phiên khác.');
  if(exactProof.matched===true)tab=exact;
 }
 if(!tab)tab=await findOwnedTab(tabs,active.task,selectors);
 if(!tab){
  if(!conversationURL(active.conversationUrl,who)){
   // A newly claimed, not-yet-sent run can already own a blank/loading tab.
   if(active.sent===false&&exact&&exactProof?.reason!=='TAB_METADATA_MISMATCH')tab=exact;
   else if(active.sent===false&&!Number.isInteger(active.tabId)&&active.task.recoverOnly!==true)tab=await workTab(SITES[who]);
   else throw Error('Đang giữ lượt nhưng chưa tìm thấy tab đúng mã hoặc đường dẫn hội thoại đã lưu; không mở chat mới.');
  }else{
   // Refresh all tabs before restoring. A pending navigation also owns this
   // URL; an extension reload/lost ACK must not create a second copy.
   const current=await chrome.tabs.query({});
   const same=current.filter(t=>t.url===active.conversationUrl||t.pendingUrl===active.conversationUrl);
   if(same.length>1)throw Error('Có nhiều tab cùng hội thoại đang giữ; chưa tự chọn hoặc mở thêm tab.');
   if(same.length){
    tab=same[0];
    if(geminiTab(tab)){
     const proof=tab.id===exact?.id?exactProof:await messageTab(tab,{type:'PROBE_RUN',task:active.task,selectors});
     if(proof?.code==='RESULT_CONFLICT'||proof?.reason==='TAB_METADATA_MISMATCH')throw Error('Hội thoại đã lưu đang gắn mã lượt khác hoặc kết quả mâu thuẫn; chưa đổi phiên.');
    }
   }else throw Error('TAB_LOCK_MISSING: Cuộc hội thoại đang giữ chưa mở; không tạo tab hoặc Chrome khác.');
  }
 }
 const opened=focus?await chrome.tabs.update(tab.id,{active:true}):tab;
 if(!Number.isInteger(opened?.id))throw Error('Chrome chưa xác nhận tab của lượt đang giữ.');
 active.tabId=opened.id;
 if(conversationURL(opened.url,who))active.conversationUrl=opened.url;
 await chrome.storage.local.set({active});
 if(focus){
  if(Number.isInteger(opened.windowId))await showWindow(opened.windowId);
  await chrome.storage.local.set({loginVisibleUntil:Date.now()+300000});
 }
 return opened;
}

async function step(){
  if(busy)return;busy=true;
  try{
    const {composerPick}=await chrome.storage.local.get('composerPick');if(composerPick?.expires>Date.now())return;
    let {config,active,failure}=await chrome.storage.local.get(['config','active','failure']);const outbox=await pending('get');if(!config?.token)return;
    const identity=await local('/browser/identity');if(!SITES[identity.account?.provider])throw Error('Hồ sơ chưa xác nhận được nhà cung cấp.');provider=identity.account.provider;
    if(active?.task?.provider&&active.task.provider!==provider)throw Error('Hồ sơ đổi nhà cung cấp trong khi còn kết quả; giữ phiên.');
    // Results already generated are retried even when the owner pauses new inference.
    let deliveryBlocked='';
    if(outbox){try{const r=await local('/browser/result',outbox);if(r.stored){
      const next=r.nextTask;
      // Persist the receipt binding before dropping the durable outbox. A later
      // task may retire metadata only for this exact acknowledged run/nonce.
      if(active?.runId===outbox.runId&&active.nonce===outbox.nonce&&Number.isInteger(active.tabId))await chrome.storage.local.set({idleTab:{tabId:active.tabId,provider,conversationUrl:active.conversationUrl||'',retired:{runId:outbox.runId,nonce:outbox.nonce}}});
      if(next){if(next.runId!==outbox.runId||next.nonce===outbox.nonce||next.kind!=='images'||next.provider&&next.provider!==provider)throw Error('Biên nhận cảnh tiếp theo không khớp.');
        await chrome.storage.local.set({active:{runId:next.runId,nonce:next.nonce,task:next,createdAt:Date.now(),sent:false}});
        await chrome.storage.local.remove('failure');
      }else await chrome.storage.local.remove(['active','failure']);
      await pending('delete');await status('Local đã lưu; giữ nguyên tab cho việc kế tiếp: '+r.status);return;}
      deliveryBlocked='Local chưa xác nhận đã lưu kết quả.';
    }catch(e){deliveryBlocked=e.message;}
    }
    if(failure&&!outbox){await local('/browser/failure',failure);await chrome.storage.local.remove('failure');await status(failure.message);return;}
    // Poll login/control even while new AI work is paused.
    let probe={ready:false},probeError='';const tabs=await chrome.tabs.query({url:new URL(SITES[provider]).origin+'/*'});const target=tabs.find(t=>t.id===active?.tabId)||tabs.find(geminiTab);
    if(target)try{probe=await messageTab(target,{type:'PROBE',selectors:config.selectors});}catch(e){probeError=e.message;await status(e.message);}
    if(!probe.ready){for(const candidate of tabs.filter(geminiTab).slice(0,20)){if(candidate.id===target?.id)continue;try{const next=await messageTab(candidate,{type:'PROBE',selectors:config.selectors});if(next.ready){probe=next;break;}}catch{}}}
    if(config.enabled)await adoptRestoredWindows(tabs);
    const prefs=await chrome.storage.local.get(['quietWindows','loginVisibleUntil']);
    if(prefs.quietWindows===true&&Date.now()>(prefs.loginVisibleUntil||0)&&probe.ready){
      const managed=(await chrome.storage.local.get('managedWindows')).managedWindows||[];
      for(const wid of managed){const members=await chrome.tabs.query({windowId:wid}).catch(()=>[]);
        if(members.length&&members.every(t=>ownedURL(t.url)||String(t.url||'').startsWith(chrome.runtime.getURL(''))))await hideWindow(wid).catch(()=>{});
      }
    }
    const {loginAck}=await chrome.storage.local.get('loginAck');
    let existingTextResult,existingResultTab;
    const heldText=provider==='claude'&&active?.sent===true&&active.task?.provider==='claude'&&active.task.runId===active.runId&&active.task.nonce===active.nonce&&['research','write','review'].includes(active.task.kind)&&!active.task.attachmentHashes?.length;
    if(heldText){
      // A durable outbox must remain deliverable even if the chat tab closed.
      if(outbox&&outbox.runId===active.runId&&outbox.nonce===active.nonce&&outbox.result&&typeof outbox.result==='object'&&!Array.isArray(outbox.result)&&!outbox.attachments?.length&&!outbox.base64&&typeof outbox.transcript==='string'){
        existingTextResult={protocol:'claude-existing-result-v1',runId:active.runId,nonce:active.nonce,source:'outbox'};
      }else if(!outbox){
        try{
          const tab=await findOwnedTab(tabs,active.task,config.selectors);
          if(tab){const proof=await messageTab(tab,{type:'PROBE_RUN',task:active.task,selectors:config.selectors});
            if(proof.matched===true&&proof.collectable===true){
              existingResultTab=tab;existingTextResult={protocol:'claude-existing-result-v1',runId:active.runId,nonce:active.nonce,source:'dom'};
              active={...active,tabId:tab.id,...(conversationURL(tab.url,provider)?{conversationUrl:tab.url}:{})};await chrome.storage.local.set({active});
            }
          }
        }catch(e){await status('Chưa chứng minh được kết quả cũ: '+e.message);}
      }
    }
    // Do not advertise readiness from an unrelated tab. No task is claimed
    // until one reusable, empty editor is bound in this extension profile.
    let idleReady=false;
    if(!active&&!outbox&&config.enabled){try{await workTab(SITES[provider]);idleReady=true;}catch(e){probeError=e.message;}}
    const p=await local('/browser/poll',{ready:active?probe.ready===true:idleReady,acceptWork:config.enabled===true&&!outbox,currentRunId:active?.runId||'',continuity:'extension-52r1',unsentContinuation:'empty-root-v1',preparedContinuation:'claude-draft-v1',richTextContinuation:'claude-paragraph-v1',...(existingTextResult?{existingTextResult}:{}),loginAck:loginAck||''});
    if(p.login){
      if(!/^[a-f0-9]{32}$/.test(p.login.id)||p.login.url!==SITES[provider])throw Error('Sai lệnh mở đăng nhập.');
      if(loginAck!==p.login.id){
        // Acknowledge only after Chrome has successfully opened/focused the tab.
        let opened;
        if(active)opened=await focusHeldTab(active,tabs,config.selectors,provider,true);
        else{const {idleTab}=await chrome.storage.local.get('idleTab');let existing=tabs.find(t=>t.id===idleTab?.tabId&&(!idleTab.conversationUrl||t.url===idleTab.conversationUrl));if(!existing&&tabs.length===1)existing=tabs[0];if(!existing)throw Error('TAB_LOCK_MISSING: Mở đúng Chrome đã ghép; chưa tạo tab đăng nhập khác.');opened=await chrome.tabs.update(existing.id,{active:true});}
        if(!Number.isInteger(opened?.id))throw Error('Chrome chưa mở được tab đăng nhập.');
        if(!active&&Number.isInteger(opened?.windowId))await showWindow(opened.windowId);
        await chrome.storage.local.set({loginAck:p.login.id,loginVisibleUntil:Date.now()+300000});
      }
      await status('Đã yêu cầu mở chatbox trong đúng hồ sơ Chrome đã ghép.');return;
    }
    // Keep delivery failures isolated from heartbeat/login; never discard or rerun an unacknowledged result.
    if(outbox){await status('Đã giữ kết quả; cầu nối vẫn chạy. Lỗi gửi: '+deliveryBlocked);return;}
    if(p.releaseRun&&active&&p.releaseRun.id===active.runId&&['confirmed','expired'].includes(p.releaseRun.status)){
      // The durable outbox was checked above. Never erase an undelivered result.
      await chrome.storage.local.set({idleTab:{tabId:active.tabId,provider,conversationUrl:active.conversationUrl||'',retired:{runId:active.runId,nonce:active.nonce}}});
      await chrome.storage.local.remove(['active','failure']);
      await status(p.releaseRun.status==='confirmed'?'Phiên đã có biên nhận; tiếp tục việc kế tiếp.':'Tin đã hết hạn; giữ cuộc hội thoại, chờ tin mới.');return;
    }
    if(p.task?.resultOnly===true){
      if(!heldText||!existingResultTab||p.task.recoverOnly!==true||p.task.resumePrepared===true||p.task.resumeUnsent===true||p.task.runId!==active.runId||p.task.nonce!==active.nonce||p.task.provider!=='claude'||p.task.kind!==active.task.kind||p.task.attachmentHashes?.length)throw Error('Chưa có bằng chứng đọc lại đúng kết quả Claude; giữ nguyên lượt.');
      active={...active,task:p.task,tabId:existingResultTab.id,sent:true};await chrome.storage.local.set({active});
      await status('Worker đã cho phép thu câu trả lời Claude hiện có · 0.61.21. Đang chờ biên nhận, không gửi prompt.');
      await messageTab(existingResultTab,{type:'RECOVER',task:p.task,selectors:config.selectors});return;
    }
    if(config.enabled&&!active&&!p.task&&!idleReady&&probeError){await status(probeError);return;}
    if(!config.enabled){await status('Đã nối Admin; đang tạm dừng nhận việc AI.');return;}
    if(!p.task&&!probe.ready){if(p.enabled===true&&!tabs.length&&!active){await status('TAB_LOCK_MISSING: Mở đúng tab AI trong hồ sơ đã ghép. Bộ tự động không tạo tab hay Chrome khác.');return;}await status(probeError&&!probe.ready?'Không đọc được tab: '+probeError:probe.code==='QUOTA'?'Chatbox hết lượt; chờ, không đổi tài khoản.':'Chưa thấy ô nhập chatbox sẵn sàng. Mở đăng nhập từ Admin, giữ Chrome chạy.');return;}
    if(p.task?.provider&&p.task.provider!==provider)throw Error('Công việc khác nhà cung cấp của hồ sơ.');
    if(p.task?.resumePrepared===true&&p.task.resumeRichText!==true&&!config.selectors?.send?.trim()){
      if(provider==='claude'){
        if(active&&(active.runId!==p.task.runId||active.nonce!==p.task.nonce))throw Error('Mã lượt đang giữ khác bản phục hồi; chưa đổi phiên.');
        const tab=await findOwnedTab(tabs,p.task,config.selectors);
        if(tab){const proof=await messageTab(tab,{type:'PROBE_RUN',task:p.task,selectors:config.selectors});
          if(proof.collectable===true){
            active={...active,runId:p.task.runId,nonce:p.task.nonce,task:p.task,tabId:tab.id,sent:true,createdAt:active?.createdAt||Date.now(),...(conversationURL(tab.url,provider)?{conversationUrl:tab.url}:{})};
            await chrome.storage.local.set({active});await status('Đã thấy JSON Claude đúng mã lượt; chỉ thu kết quả, không gửi prompt.');
            await messageTab(tab,{type:'RECOVER',task:{...p.task,recoverOnly:true,resultOnly:true},selectors:config.selectors});return;
          }
        }
        await status('Claude đang giữ lượt. Nếu đã có JSON: bấm Chọn câu trả lời AI rồi chọn phần JSON. Bộ thu chưa gửi thêm prompt.');return;
      }
      await status('DeepSeek còn prompt chưa gửi. Mở tiện ích → Chọn nút gửi Claude / DeepSeek. Giữ nguyên nội dung và tab.');return;
    }
    if(!p.task){if(p.message)await status(p.message);return;}
    if(active&&active.nonce!==p.task.nonce&&active.runId===p.task.runId&&p.task.retryAuthorized===true)throw Error('TAB_LOCK_RETRY: Giữ tab và kết quả cũ; chưa tự gửi lại với mã lượt khác.');
    if(active&&active.nonce!==p.task.nonce)throw Error('Phiên local đổi trong khi trình duyệt còn việc chưa nhận ACK.');
    if(active&&!active.tabId&&!active.sent&&active.nonce===p.task.nonce&&!p.task.recoverOnly){const tab=await workTab(SITES[provider]);active.tabId=tab.id;await chrome.storage.local.set({active});await status('Đã gắn cảnh tiếp theo vào đúng tab sau biên nhận.');return;}
    if(p.task.resumeUnsent===true){
      if(!active||active.runId!==p.task.runId||active.nonce!==p.task.nonce||provider!=='chatgpt')throw Error('Lượt chưa gửi không khớp phiên đang giữ.');
      const tab=tabs.find(t=>t.id===active.tabId);
      if(!tab||!geminiTab(tab)){await status('Chờ đúng tab ChatGPT đang giữ tải xong; chưa mở thêm tab.');return;}
      const proof=await messageTab(tab,{type:'PROBE_UNSENT',task:p.task,selectors:config.selectors});
      if(proof.safeToSend!==true){await status(proof.reason||'Chờ ô nhập ChatGPT trống và đúng phiên; chưa gửi prompt.');return;}
      active.task=p.task;active.sent=true;await chrome.storage.local.set({active});
      await messageTab(tab,{type:'EXECUTE',task:p.task,selectors:config.selectors});return;
    }
    if(active||p.task.recoverOnly){
      let tab=active?tabs.find(t=>t.id===active.tabId):null;
      if(tab&&!geminiTab(tab)){
        if(tab.status!=='complete'){await status('Tab đang tải; giữ cuộc hội thoại, chưa gửi lại prompt.');return;}
        tab=null;
      }
      // Chrome may reuse a numerical tab ID after restart. Validate the actual
      // run/nonce before recovering, even when that tab ID still exists.
      if(tab&&(p.task.recoverOnly||active?.sent)){
        const proof=await messageTab(tab,{type:'PROBE_RUN',task:{runId:p.task.runId,nonce:p.task.nonce,kind:p.task.kind,attachmentHashes:p.task.attachmentHashes||[],resumePrepared:p.task.resumePrepared===true,...(p.task.resumePrepared?{prompt:p.task.prompt}:{})},selectors:config.selectors});
        if(proof.code==='RESULT_CONFLICT')throw Error('Có kết quả JSON mâu thuẫn; chưa tự chọn.');
        if(proof.matched!==true)tab=null;
      }
      let recovered=false;
      if(!tab){
        tab=await findOwnedTab(tabs,p.task,config.selectors);
        if(!tab&&active?.conversationUrl&&(!active.reopenRequested||Date.now()-(active.reopenAttemptAt||0)>=60000)){
          // A restored conversation may already be open under a new tab ID.
          // Never create a duplicate just because its proof is not ready yet.
          const restored=tabs.filter(t=>t.url===active.conversationUrl&&ownedURL(t.url));
          if(restored.some(t=>t.status!=='complete')){await recordRecovery(p.task,'WAIT_TAB');await status('Cuộc trò chuyện đang tải; giữ lượt và chờ bộ thu.');return;}
          if(!restored.length&&conversationURL(active.conversationUrl,active.task?.provider||provider)){
            active.reopenRequested=true;active.reopenAttemptAt=Date.now();await chrome.storage.local.set({active});
            await focusHeldTab(active,tabs,config.selectors,provider,false);
            await status('Đã tìm lại đúng cuộc hội thoại đang mở; không gửi prompt mới.');return;
          }
        }
        if(!tab){const {recoveryReport}=await chrome.storage.local.get('recoveryReport');await status('Chưa thu được kết quả. '+(RECOVERY_REASONS[recoveryReport?.code]||'Chưa thấy tab có đúng mã phiên.')+' Xem Kiểm tra lượt đang giữ trong tiện ích.');return;}
        recovered=true;active={...active,runId:p.task.runId,nonce:p.task.nonce,tabId:tab.id,task:p.task,createdAt:active?.createdAt||Date.now(),sent:true};await chrome.storage.local.set({active});
      }
      if(active&&conversationURL(tab.url,provider)&&active.conversationUrl!==tab.url){active.conversationUrl=tab.url;await chrome.storage.local.set({active});}
      if(p.task.kind!=='images')await recordRecovery(p.task,'WAIT_RESPONSE');
      const collectOnly=p.task.recoverOnly||recovered;
      const task=collectOnly?{...p.task,recoverOnly:true}:p.task;
      const type=collectOnly||active.sent?'RECOVER':'EXECUTE';
      if(type==='EXECUTE'){active.sent=true;await chrome.storage.local.set({active});}
      await status(task.resumeRichText===true?'Đang đối chiếu bản nháp Claude chưa gửi · giữ nguyên mã lượt.':type==='RECOVER'?'Đang thu kết quả phiên '+p.task.kind+' · đúng mã phiên · không gửi prompt mới.':'Đang giao việc '+p.task.kind+' vào tab đã gắn.');
      await messageTab(tab,{type,task,selectors:config.selectors});
      return;
    }
    const tab=await workTab(SITES[provider]);
    active={runId:p.task.runId,nonce:p.task.nonce,tabId:tab.id,task:p.task,createdAt:Date.now(),sent:false};await chrome.storage.local.set({active});await status('Đã gắn việc vào tab hiện có; giữ nguyên hồ sơ và cuộc hội thoại.');
  }catch(e){await status(e.message);}finally{busy=false;}
}
chrome.alarms.onAlarm.addListener(()=>step());
async function alarm(){await chrome.alarms.create('kbl-browser',{periodInMinutes:.5});}
chrome.runtime.onInstalled.addListener(()=>alarm());chrome.runtime.onStartup.addListener(()=>{alarm();step();});
chrome.tabs.onUpdated.addListener(async(id,change)=>{
  if(change.url&&chrome.tabs.get){const tab=await chrome.tabs.get(id).catch(()=>null);if(tab)await unhideMixed(tab.windowId).catch(()=>{});}
  if(change.url){const {active}=await chrome.storage.local.get('active');if(active?.tabId===id){
    let u;try{u=new URL(change.url);}catch{}
    if(conversationURL(u?.href,active?.task?.provider||provider)){active.conversationUrl=u.href;await chrome.storage.local.set({active});}
  }}
  if(change.status!=='complete')return;const {config}=await chrome.storage.local.get('config');if(!config?.enabled)return;
  // Poll the current local state before dispatch: a refreshed tab may belong to
  // a watchdog-stopped run and must only collect its existing response.
  await step();
});
chrome.tabs.onCreated?.addListener(tab=>unhideMixed(tab.windowId).catch(()=>{}));
chrome.tabs.onAttached?.addListener((id,info)=>unhideMixed(info.newWindowId).catch(()=>{}));
// Owner-invoked recovery only. Work/prompt routing below remains unchanged.
async function archiveRecovery42(record,moveOutbox=false){
 return new Promise((resolve,reject)=>{const req=indexedDB.open('kbl-browser-results',1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('pending'))req.result.createObjectStore('pending');};
  req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('pending','readwrite'),store=tx.objectStore('pending'),key='recovery42:'+record.epoch+':'+crypto.randomUUID();
   if(moveOutbox){const get=store.get('outbox');get.onsuccess=()=>{store.add({...record,outbox:get.result||null},key);store.delete('outbox');};}
   else store.add(record,key);
   tx.oncomplete=()=>{db.close();resolve(key);};tx.onabort=tx.onerror=()=>{db.close();reject(tx.error||Error('Chưa lưu được bản khôi phục; giữ nguyên phiên.'));};
  };
 });
}
async function readArchive42(key){
 return new Promise((resolve,reject)=>{const req=indexedDB.open('kbl-browser-results',1);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('pending','readonly'),get=tx.objectStore('pending').get(key);let value;get.onsuccess=()=>{value=get.result;};tx.oncomplete=()=>{db.close();resolve(value);};tx.onerror=()=>{db.close();reject(tx.error);};};});
}
async function fetchRecovery42(route,token){
 const r=await fetch(BASE+route,{redirect:'error',signal:AbortSignal.timeout(15000),headers:token?{'x-kbl-browser-token':token,'x-kbl-extension-id':chrome.runtime.id}:{}});
 if(!r.ok||r.redirected||!/^application\/json\b/i.test(r.headers.get('content-type')||''))throw Error('Cầu nối chưa xác nhận khôi phục; giữ nguyên lượt cũ.');
 return r.json();
}
async function recoverPairing42(m,sender){
 if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('recover42.html')||sender.tab||m.ack!==true)throw Error('Chỉ khôi phục bằng nút xác nhận trong tiện ích.');
 if(busy)throw Error('Đang đồng bộ; đợi vài giây rồi bấm lại.');
 if(!/^[A-Za-z0-9_-]{43}$/.test(m.token||'')||!/^[a-z][a-z0-9-]{2,35}$/.test(m.accountId||''))throw Error('Dán đúng ID tài khoản và mã 43 ký tự từ trang kết nối Windows.');
 busy=true;
 try{
  const prior=await chrome.storage.local.get(['config','active','failure','pairedAccountId','idleTab']);
  if(prior.pairedAccountId&&prior.pairedAccountId!==m.accountId)throw Error('ID khác hồ sơ cũ '+prior.pairedAccountId+'; chưa đổi tài khoản.');
  const health=await fetchRecovery42('/integration/health');
  if(health.protocol!=='kbl-chrome-bridge-v1'||!health.recovery42?.epoch)throw Error('Windows chưa ở chế độ khôi phục R42.');
  const identity=await fetchRecovery42('/browser/identity',m.token);
  if(identity.success!==true||identity.account?.id!==m.accountId||!SITES[identity.account.provider]||prior.active?.task?.provider&&prior.active.task.provider!==identity.account.provider)throw Error('Mã không thuộc đúng hồ sơ này; giữ nguyên phiên.');
  const epoch=health.recovery42.epoch,record={epoch,at:Date.now(),kind:'owner-pairing-recovery',...prior};
  recovery42Session={epoch,active:prior.active};
  const archiveKey=await archiveRecovery42(record,true);
  const lastRun=prior.active?{runId:prior.active.runId,nonce:prior.active.nonce,tabId:prior.active.tabId,provider:prior.active.task?.provider}:null;
  const idle=prior.active&&Number.isInteger(prior.active.tabId)?{tabId:prior.active.tabId,provider:identity.account.provider,conversationUrl:prior.active.conversationUrl||'',archived42:{epoch,archiveKey,runId:prior.active.runId,nonce:prior.active.nonce}}:prior.idleTab||null;
  await chrome.storage.local.set({config:{...prior.config,token:m.token,enabled:false},pairedAccountId:identity.account.id,active:null,failure:null,idleTab:idle,recovery42:{epoch,archiveKey,accountId:identity.account.id,lastRun,at:Date.now()}});
  await status('Đã khôi phục đúng '+identity.account.id+'. Lượt/kết quả cũ đã lưu riêng. Nhận việc đang tắt.');
  return {ok:true,accountId:identity.account.id,archived:true,acceptWork:false};
 }finally{busy=false;}
}
async function lateRecoveryResult42(m,sender){
 if(!['RESULT','FAILURE'].includes(m.type))return false;
 const persisted=(await chrome.storage.local.get('recovery42')).recovery42,held=recovery42Session?.active||persisted?.lastRun,epoch=recovery42Session?.epoch||persisted?.epoch;
 const who=held?.task?.provider||held?.provider;
 if(!held||!epoch||sender.id!==chrome.runtime.id||sender.tab?.id!==held.tabId||!ownedURL(sender.url,who)||m.runId!==held.runId||m.nonce!==held.nonce)return false;
 if(m.payload?.base64?.length>16*1024*1024||m.payload?.transcript?.length>210000)throw Error('Kết quả quá lớn; chưa lưu.');
 await archiveRecovery42({epoch,at:Date.now(),kind:'late-result-after-recovery',runId:m.runId,nonce:m.nonce,type:m.type,payload:m.payload||null,code:m.code||'',message:String(m.message||'').slice(0,250)});
 return true;
}

chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  (async()=>{
    if(m.type==='RECOVER_PAIRING42')return recoverPairing42(m,sender);
    if(await lateRecoveryResult42(m,sender))return {ok:true,storedForRecovery:true};
    if(m.type==='BEGIN_RESULT_PICK'&&sender.url===chrome.runtime.getURL('settings.html')){
      if(busy)throw Error('Đang đồng bộ; đợi vài giây rồi chọn câu trả lời.');
      busy=true;
      try{
        const {active}=await chrome.storage.local.get('active');
        if(!active||!['chatgpt','deepseek','claude'].includes(active.task?.provider)||!['research','write','review'].includes(active.task.kind)||active.task.attachmentHashes?.length)throw Error('Chưa giữ lượt văn bản phù hợp để chọn câu trả lời.');
        if(active.sent!==true||active.task.runId!==active.runId||active.task.nonce!==active.nonce)throw Error('Dữ liệu lượt chưa đồng bộ hoặc chưa gửi; giữ phiên.');
        if(await pending('get'))throw Error('Đã có kết quả trong outbox; chờ biên nhận, chưa chọn lại.');
        const identity=await local('/browser/identity');if(identity.account?.provider!==active.task.provider)throw Error('Sai hồ sơ AI của lượt đang giữ.');
        provider=identity.account.provider;
        const tabs=await chrome.tabs.query({url:new URL(SITES[provider]).origin+'/*'});
        // Tab IDs change after Chrome restores a session. A unique saved
        // conversation may be selected for inspection; PICK_RESULT still checks
        // run metadata and the clicked JSON nonce before accepting anything.
        const candidates=tabs.filter(t=>ownedURL(t.url,provider)&&t.status==='complete'&&
          (conversationURL(active.conversationUrl,provider)?t.url===active.conversationUrl:t.id===active.tabId));
        if(candidates.length!==1)throw Error(candidates.length?'Có nhiều tab của cuộc hội thoại đang giữ; chưa tự chọn.':'Chưa mở đúng cuộc hội thoại đang giữ. Bấm Mở phiên đang giữ.');
        const tab=candidates[0];
        const v=await messageTab(tab,{type:'PICK_RESULT',task:{runId:active.runId,nonce:active.nonce,kind:active.task.kind,attachmentHashes:[]}});
        if(v?.version!==ADAPTER_VERSION||!v.ok)throw Error(v?.error||'Chưa bật được chọn câu trả lời.');
        if(active.tabId!==tab.id){active.tabId=tab.id;await chrome.storage.local.set({active});}
        await chrome.storage.local.set({loginVisibleUntil:Date.now()+300000});
        await chrome.tabs.update(tab.id,{active:true});await showWindow(tab.windowId);
        return {ok:true,message:'Bấm vào dòng kblNonce trong câu trả lời AI cần dùng. Chỉ chọn kết quả để đọc; không gửi prompt.'};
      }finally{busy=false;}
    }
    if(['BEGIN_COMPOSER_PICK','BEGIN_SEND_PICK'].includes(m.type)&&sender.url===chrome.runtime.getURL('settings.html')){
      if(busy)throw Error('Đang kiểm tra worker; đợi vài giây rồi bấm Chọn ô chat.');
      busy=true;
      try{
        const {active,config}=await chrome.storage.local.get(['active','config']);
        // Repairing a selector does not cancel a run or authorize another prompt.
        if(await pending('get'))throw Error('Đang giữ kết quả chưa có biên nhận; gửi xong rồi chọn ô chat.');
        const identity=await local('/browser/identity'),who=identity.account?.provider;
        if(m.type==='BEGIN_SEND_PICK'&&!['deepseek','claude'].includes(who))throw Error('Chọn nút gửi dùng cho Claude / DeepSeek.');
        if(!SITES[who])throw Error('Chưa xác định nhà cung cấp của hồ sơ.');
        if(active?.task?.provider&&active.task.provider!==who)throw Error('Sai nhà cung cấp của lượt đang giữ; chưa đổi nhận diện.');
        provider=who;
        const tabs=await chrome.tabs.query({url:new URL(SITES[who]).origin+'/*'});
        const candidates=tabs.filter(t=>t.status==='complete');
        const tab=m.type==='BEGIN_SEND_PICK'&&active?await findOwnedTab(candidates,{...active.task,runId:active.runId,nonce:active.nonce,resumePrepared:true},config.selectors):candidates.find(t=>t.active)||candidates[0];
        if(!tab)throw Error(candidates.length?'Đã mở '+who+' nhưng chưa xác nhận đúng lượt. Nếu đã có JSON, dùng Chọn câu trả lời AI.':'Mở trang '+who+' trong hồ sơ Chrome này trước.');
        // Select a tab, never an editor: the user's trusted click chooses the editor.
        let probe;try{probe=await boundedProbe(chrome.tabs.sendMessage(tab.id,{type:'PROBE'}));}catch{}
        if(probe?.version!==ADAPTER_VERSION){
          if(active)throw Error('Tab còn adapter cũ trong khi giữ phiên. Tải lại tiện ích và trang AI, giữ cuộc hội thoại.');
          await boundedProbe(chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']}));
          probe=await boundedProbe(chrome.tabs.sendMessage(tab.id,{type:'PROBE'}));
        }
        if(probe?.version!==ADAPTER_VERSION||probe.provider!==who)throw Error('Chưa xác nhận đúng adapter/nhà cung cấp.');
        if(probe.executing===true)throw Error('Tab này đang thu câu trả lời; chọn ô chat sau khi thu xong.');
        const nonce=crypto.randomUUID();
        await chrome.storage.local.set({composerPick:{tabId:tab.id,provider:who,nonce,expires:Date.now()+90000,token:config.token,heldRun:active?{runId:active.runId,nonce:active.nonce}:null,field:m.type==='BEGIN_SEND_PICK'?'send':'composer'}});
        const result=await boundedProbe(chrome.tabs.sendMessage(tab.id,{type:'PICK_COMPOSER',nonce,field:m.type==='BEGIN_SEND_PICK'?'send':'composer'}));
        if(!result?.ok)throw Error(result?.error||'Chưa bật được chế độ chọn ô chat.');
        await chrome.tabs.update(tab.id,{active:true});
        await showWindow(tab.windowId);
        return {ok:true,message:m.type==='BEGIN_SEND_PICK'?'Bấm nút gửi Claude / DeepSeek để lưu nhận diện. Lần bấm chọn chưa gửi prompt.':'Bấm đúng vùng gõ tin nhắn trên trang AI vừa mở. Esc để hủy.'};
      }catch(e){await chrome.storage.local.remove('composerPick');throw e;}
      finally{busy=false;}
    }
    if(m.type==='COMPOSER_PICKED'){
      const {composerPick:pick,config,active}=await chrome.storage.local.get(['composerPick','config','active']);
      if(!pick||pick.expires<Date.now()||pick.token!==config?.token||sender.tab?.id!==pick.tabId||!ownedURL(sender.url,pick.provider)||m.nonce!==pick.nonce||m.provider!==pick.provider)throw Error('Lượt chọn đã hết hạn hoặc sai tab/hồ sơ.');
      if((m.field||'composer')!==(pick.field||'composer'))throw Error('Sai loại phần tử đang chọn.');
      if((active?.runId||'')!==(pick.heldRun?.runId||'')||(active?.nonce||'')!==(pick.heldRun?.nonce||'')||await pending('get'))throw Error('Phiên/kết quả đã thay đổi; chưa lưu ô chat.');
      // Permit only the structural selector generated by our packaged content script.
      if(typeof m.selector!=='string'||m.selector.length>500||!/^([a-z][a-z0-9-]*(?::nth-of-type\([1-9][0-9]*\))?)( > [a-z][a-z0-9-]*(?::nth-of-type\([1-9][0-9]*\))?)*$/.test(m.selector))throw Error('Dấu nhận diện ô chat không hợp lệ.');
      await chrome.storage.local.set({config:{...config,selectors:{...config.selectors,[pick.field||'composer']:m.selector}},status:'Đã lưu ô chat do ông chọn · 0.61.21. Giữ nguyên lượt đang chờ; bấm Kiểm tra kết nối và phiên để xác nhận.'});
      await chrome.storage.local.remove('composerPick');
      return {ok:true};
    }
    if(m.type==='QUIET_WINDOW'&&sender.url===chrome.runtime.getURL('settings.html'))return quietWindow(m.windowId);
    if(m.type==='OPEN_HELD_RUN'&&sender.url===chrome.runtime.getURL('settings.html')){
      if(busy)throw Error('Đang đồng bộ phiên; đợi vài giây rồi mở lại.');
      busy=true;
      try{
        const {active,config}=await chrome.storage.local.get(['active','config']);
        if(!active)throw Error('Tiện ích không giữ lượt nào.');
        const identity=await local('/browser/identity'),who=identity.account?.provider;
        if(!SITES[who])throw Error('Hồ sơ chưa xác định đúng nhà cung cấp.');
        const tabs=await chrome.tabs.query({url:new URL(SITES[who]).origin+'/*'});
        await focusHeldTab(active,tabs,config?.selectors,who,true);
        return {ok:true,message:'Đã mở tab của lượt đang giữ. Chỉ mở trang; không gửi lại prompt.'};
      }finally{busy=false;}
    }
    if(m.type==='CHECK_RECOVERY'&&sender.url===chrome.runtime.getURL('settings.html')){
      if(busy)return {ok:true,message:'Bộ thu đang đồng bộ; trạng thái mới nhất sẽ hiện ở đây.'};
      busy=true;
      try{
        const {active,config,recoveryHistory=[]}=await chrome.storage.local.get(['active','config','recoveryHistory']);
        if(await pending('get'))return {ok:true,message:'Đã có kết quả trong hàng chờ gửi. Tiện ích giữ kết quả đến khi local xác nhận; chưa gửi lại prompt.'};
        if(!active)return {ok:true,message:'Tiện ích không giữ lượt nào. Chờ Admin giao việc.'};
        const identity=await local('/browser/identity'),who=identity.account?.provider;
        if(!SITES[who]||active.task?.provider&&active.task.provider!==who)throw Error('Hồ sơ và nhà cung cấp của lượt không khớp.');
        provider=who;
        const tabs=await chrome.tabs.query({url:new URL(SITES[who]).origin+'/*'});
        if(tabs.length>20)throw Error('Hơn 20 tab AI; chưa quét để tránh giữ bộ thu quá lâu.');
        const candidates=tabs.filter(geminiTab),matches=[],counts={};let unreadable=0;const deadline=Date.now()+12000;
        for(let i=0;i<candidates.length;i++){
          const tab=candidates[i];if(Date.now()>=deadline){unreadable+=candidates.length-i;break;}
          try{const p=await messageTab(tab,{type:'PROBE_RUN',task:{runId:active.runId,nonce:active.nonce,kind:active.task?.kind,attachmentHashes:active.task?.attachmentHashes||[]},selectors:config?.selectors});
            if(p.code==='RESULT_CONFLICT'){counts.RESULT_CONFLICT=(counts.RESULT_CONFLICT||0)+1;continue;}
            if(p.matched===true)matches.push(p);else{const c=p.reason||p.code||'NO_RUN_PROOF';counts[c]=(counts[c]||0)+1;}
          }catch{unreadable++;}
        }
        const code=counts.RESULT_CONFLICT?'RESULT_CONFLICT':unreadable?'ADAPTER_UNAVAILABLE':matches.length>1?'DUPLICATE':matches.length?matches[0].collectable?'READY_TO_COLLECT':'WAIT_RESPONSE':counts.TAB_METADATA_MISMATCH?'TAB_METADATA_MISMATCH':counts.QUOTA?'QUOTA':counts.CHALLENGE?'CHALLENGE':tabs.some(t=>t.status!=='complete')?'WAIT_TAB':tabs.length?'NO_RUN_PROOF':'NO_TAB';
        const message=await recordRecovery(active.task,code,{...counts,matched:matches.length,unreadable});
        return {ok:true,message:'Lượt '+active.runId+' · '+(active.task?.kind||'chưa rõ bước')+'\n'+message+'\n'+(config?.enabled?'Nhận việc: bật.':'Nhận việc: tạm dừng.')+' Bộ thu không gửi prompt mới khi kiểm tra.',code};
      }finally{busy=false;}
    }
    if(m.type==='CHECK_SESSION'&&sender.url===chrome.runtime.getURL('settings.html')){
      const identity=await local('/browser/identity'),who=identity.account?.provider;
      if(!SITES[who])throw Error('Hồ sơ chưa xác định được nhà cung cấp.');
      const tabs=await chrome.tabs.query({url:new URL(SITES[who]).origin+'/*'});
      if(!tabs.length)return {ok:true,ready:false,message:'Chưa mở tab '+who+' trong hồ sơ Chrome này. Mở trang AI rồi kiểm tra lại.'};
      // A probe never claims a job or sends a prompt. Keep the current run intact.
      const {active}=await chrome.storage.local.get('active');
      const held=' Nền '+ADAPTER_VERSION+'.'+(active?' Tiện ích đang giữ lượt '+active.runId+' · '+(active.task?.kind||'chưa rõ bước')+'. Trang chat mới không có nghĩa lượt cũ đã kết thúc.':'');
      let last='Trang AI chưa tải xong.';const deadline=Date.now()+18000;
      for(const tab of tabs.slice(0,20)){
        if(Date.now()>=deadline)break;
        if(tab.status!=='complete')continue;
        try{
          let v;try{v=await boundedProbe(chrome.tabs.sendMessage(tab.id,{type:'PROBE'}));}catch{}
          if(v?.version!==ADAPTER_VERSION){await boundedProbe(chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']}));}
          const {config}=await chrome.storage.local.get('config');
          v=await boundedProbe(chrome.tabs.sendMessage(tab.id,{type:'PROBE',selectors:config?.selectors}));
          if(v?.version!==ADAPTER_VERSION)throw Error('Adapter trong tab chưa cập nhật lên '+ADAPTER_VERSION+'. Tải lại tab AI rồi kiểm tra lại.');
          if(v.provider!==who)throw Error('Tab phản hồi sai nhà cung cấp; chưa xác nhận sẵn sàng.');
          if(v?.ready===true)return {ok:true,ready:true,message:'Cầu nối OK · đã nhận ô nhập '+who+'. Đây là kiểm tra giao diện, chưa phải kết quả làm việc của AI.'+held};
          last=v?.code==='QUOTA'?'Chatbox báo hết lượt.':v?.code==='CHALLENGE'?'Trang yêu cầu xác minh.':(v?.detail||'Đã liên lạc với tab '+who+' nhưng chưa nhận diện được ô nhập. Mở cuộc trò chuyện mới và tải lại trang.');
        }catch(e){last='Không đọc được tab '+who+': '+e.message;}
      }
      return {ok:true,ready:false,message:last+held};
    }
    if(m.type==='WAKE'&&sender.url===chrome.runtime.getURL('settings.html')){await step();return {ok:true};}
    const {active}=await chrome.storage.local.get('active');if(!active||sender.tab?.id!==active.tabId||!ownedURL(sender.url,active.task?.provider||'gemini')||m.runId!==active.runId||m.nonce!==active.nonce)throw Error('Sai tab/phiên');
    if(m.type==='RESULT_REGION_PICKED'){
      if(await pending('get'))return {ok:true,resultPreserved:true};
      await chrome.storage.local.set({resultPickFeedback:'Đã chọn vùng JSON đúng mã lượt; đang chờ bộ thu và biên nhận.'});await status('Đã chọn vùng JSON đúng lượt · 0.61.21. Bộ thu sẽ đọc lại, kiểm tra và nộp qua outbox; chưa phải biên nhận.');
      if(active.task?.provider==='claude'){
        if(!['research','write','review'].includes(active.task.kind)||active.task.attachmentHashes?.length)throw Error('Lượt này cần bằng chứng ảnh riêng; chưa thu như văn bản.');
        provider='claude';const {config}=await chrome.storage.local.get('config');
        await messageTab({id:sender.tab.id,url:sender.url,status:'complete'},{type:'RECOVER',task:{...active.task,runId:active.runId,nonce:active.nonce,recoverOnly:true,resultOnly:true},selectors:config?.selectors});
      }
      return {ok:true};
    }
    if(m.type==='RESULT'){if(m.payload?.base64?.length>16*1024*1024||m.payload?.transcript?.length>210000)throw Error('Kết quả quá lớn');await pending('set',{...m.payload,runId:active.runId,nonce:active.nonce});await step();return {ok:true};}
    if(m.type==='FAILURE'){if(await pending('get'))return {ok:true,resultPreserved:true};await chrome.storage.local.set({failure:{runId:active.runId,nonce:active.nonce,code:m.code,message:String(m.message).slice(0,250),notSent:m.notSent===true}});await step();return {ok:true};}
    if(m.type==='REVIEW_FILES'){
      const out=[];for(let i=0;i<active.task.attachmentHashes.length;i++){
        const {config}=await chrome.storage.local.get('config');const r=await fetch(BASE+'/browser/asset?run='+encodeURIComponent(active.runId)+'&index='+i,{redirect:'error',signal:AbortSignal.timeout(25000),headers:{'x-kbl-browser-token':config.token,'x-kbl-extension-id':chrome.runtime.id}});if(!r.ok)throw Error('Không đọc được ảnh QA');const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length>12*1024*1024||await sha(bytes)!==active.task.attachmentHashes[i])throw Error('Ảnh QA sai hash');out.push({base64:bytes64(bytes),mime:r.headers.get('content-type'),hash:active.task.attachmentHashes[i]});}return {files:out};
    }
    if(m.type==='IMAGE_BYTES'&&active.task.kind==='images'){
      const url=new URL(m.url),imageProvider=active.task.provider||'gemini';
      const allowed=imageProvider==='gemini'?url.hostname.endsWith('.googleusercontent.com'):
        imageProvider==='chatgpt'&&((url.hostname==='chatgpt.com'&&url.pathname==='/backend-api/estuary/content')||/^sdmnt[a-z0-9-]*\.oaiusercontent\.com$/.test(url.hostname));
      if(url.protocol!=='https:'||!allowed||url.username||url.password||url.port)throw Error('URL ảnh ngoài nguồn được phép của hồ sơ');
      const r=await fetch(url.href,{credentials:url.hostname==='chatgpt.com'||imageProvider==='gemini'?'include':'omit',redirect:'error',signal:AbortSignal.timeout(25000)});if(!r.ok||!/^image\/(png|jpeg|webp)(?:;|$)/.test(r.headers.get('content-type')||''))throw Error('Chưa tải được tệp ảnh tạo');const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length>12*1024*1024)throw Error('Ảnh quá 12 MB');return {base64:bytes64(bytes),mime:r.headers.get('content-type').split(';')[0]};
    }
    throw Error('Thao tác không được cấp quyền');
  })().then(reply).catch(e=>reply({error:e.message}));return true;
});
alarm().catch(()=>{});
