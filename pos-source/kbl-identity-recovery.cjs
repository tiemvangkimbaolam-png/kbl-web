(function(factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')window.KBLIdentityRecovery=api;})(function(){
 'use strict';
 const abortError=()=>Object.assign(new Error('Đã dừng đọc. Ảnh vẫn còn để đọc lại.'),{name:'AbortError'});
 function createSession({onState=()=>{},capture=()=>()=>true,validate=()=>true}={}){
  const images=new Map(),states=new Map(),pending=[];let active=null,epoch=0;
  const emit=()=>onState({images:new Map(images),states:new Map(states),busy:!!active,pending:pending.length});
  function stop(){epoch++;active?.controller.abort();for(const task of pending.splice(0)){task.snapshot.dispose?.();task.resolve({cancelled:true});}for(const side of images.keys())if(states.get(side)==='reading'||states.get(side)==='queued')states.set(side,'stopped');emit();}
  function clear(){stop();images.clear();states.clear();emit();}
  async function drain(){
   if(active||!pending.length)return;const task=pending.shift(),controller=new AbortController();active={...task,controller};const generation=epoch,isUnchanged=task.snapshot;states.set(task.side,'reading');emit();
   const job={signal:controller.signal,isCurrent:()=>generation===epoch&&!controller.signal.aborted&&images.get(task.side)===task.image&&validate(task.side,task.image),
    assertCurrent(){if(!this.isCurrent())throw abortError();},
    filter(parsed,fields){this.assertCurrent();return Object.fromEntries(Object.entries(parsed).filter(([key])=>!fields[key]||isUnchanged(fields[key])));},
    onProgress:message=>{if(job.isCurrent())onState({message,side:task.side,images:new Map(images),states:new Map(states),busy:true,pending:pending.length});}};
   try{job.assertCurrent();const result=await task.worker(task.image,job);job.assertCurrent();states.set(task.side,'done');task.resolve({success:true,result});}
   catch(error){if(job.isCurrent()){states.set(task.side,error.name==='AbortError'?'stopped':'error');onState({message:error.message||'Chưa đọc được ảnh; bấm Đọc lại.',error:true,side:task.side,images:new Map(images),states:new Map(states),busy:true,pending:pending.length});}task.resolve({success:false,cancelled:!job.isCurrent(),error});}
   finally{isUnchanged.dispose?.();if(images.get(task.side)===task.image&&states.get(task.side)==='reading')states.set(task.side,'stopped');active=null;emit();drain();}
  }
  function run(side,image,worker){
   if(!['front','back','qr'].includes(side)||!image)return Promise.resolve({success:false});
   // One context processes its front/back serially. A replacement invalidates an older result.
   if(active?.side===side){epoch++;active.controller.abort();}
   for(let i=pending.length-1;i>=0;i--)if(pending[i].side===side){const previous=pending.splice(i,1)[0];previous.snapshot.dispose?.();previous.resolve({cancelled:true});}
   images.set(side,image);states.set(side,'queued');const snapshot=capture(),promise=new Promise(resolve=>pending.push({side,image,worker,resolve,snapshot}));emit();drain();return promise;
  }
  function retry(side,worker){const image=images.get(side);if(image&&!validate(side,image)){images.delete(side);states.delete(side);onState({message:'Ảnh hồ sơ đã thay đổi. Chọn hoặc chụp ảnh của khách hiện tại.',error:true,images:new Map(images),states:new Map(states),busy:!!active,pending:pending.length});return Promise.resolve({success:false});}return image?run(side,image,worker):Promise.resolve({success:false});}
  return{run,retry,stop,clear,has:side=>images.has(side),image:side=>images.get(side)};
 }
 function attachPanel({document:doc,statusId,fields=[],title='Đọc lại ảnh đã nhận',preview=()=>{},validate=()=>true,worker}){
  const status=doc.getElementById(statusId);let panel=null,session;
  const capture=()=>{const snapshot=new Map(fields.map(id=>{const el=doc.getElementById(id);return[el,{value:el?.value,revision:0}];}));
   const changed=new Map(),listeners=[];for(const [el]of snapshot)if(el){const listener=()=>changed.set(el,(changed.get(el)||0)+1);el.addEventListener('input',listener);listeners.push([el,listener]);}
   const test=el=>!el||(!changed.has(el)&&snapshot.get(el)?.value===el.value);test.dispose=()=>listeners.forEach(([el,fn])=>el.removeEventListener('input',fn));return test;
  };
  function render(state){
   if(!status)return;
   if(!panel){
    panel=doc.createElement('div');panel.className='kbl-identity-retry';panel.style.cssText='display:contents;';
    const action={'buy-ocr-status':"openVneidScanner('buy')",'s-ocr-status':"openVneidScanner('sale')",'scan-status':'openPawnVneidScanner()'}[statusId];
    const scan=action&&Array.from(doc.querySelectorAll('button[onclick]')).find(button=>button.getAttribute('onclick')===action);
    (scan||status.closest('.card-header')||status).insertAdjacentElement('afterend',panel);
   }
   panel.replaceChildren();panel.hidden=!state.images.size;if(panel.hidden){panel.style.display='none';return;}panel.style.display='contents';
   for(const side of ['front','back','qr'])if(state.images.has(side)){
    const button=doc.createElement('button');button.type='button';button.dataset.side=side;button.textContent=side==='qr'?'↻ Đọc QR':side==='front'?'↻ Mặt trước':'↻ Mặt sau';button.title=side==='qr'?'Đọc lại QR':side==='front'?'Đọc lại mặt trước':'Đọc lại mặt sau';button.setAttribute('aria-label','↻ '+button.title);button.disabled=state.busy||state.pending>0;
    button.className='btn btn-blue kbl-identity-retry-button';button.style.cssText='display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:auto;margin:0;padding:6px 8px;min-height:32px;font-family:inherit;font-size:11px;font-weight:600;line-height:1.2;white-space:nowrap;';button.style.opacity=button.disabled?'0.55':'1';
    button.addEventListener('click',()=>session.retry(side,(image,job)=>worker(side,image,job)));panel.append(button);
   }
   if(state.busy||state.pending){const stop=doc.createElement('button');stop.type='button';stop.textContent='Dừng đọc';stop.className='btn btn-outline kbl-identity-retry-button';stop.style.cssText='display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:auto;margin:0;padding:6px 8px;min-height:32px;font-family:inherit;font-size:11px;font-weight:600;line-height:1.2;white-space:nowrap;';stop.addEventListener('click',()=>{session.stop();status.textContent='Đã dừng đọc. Ảnh vẫn còn; bấm Đọc lại khi cần.';});panel.append(stop);}
   if(state.message){status.textContent=state.message;status.className=state.error?'ai-status-alert ai-status-error':'ai-status-alert';}
  }
  session=createSession({onState:render,capture,validate});
  return{...session,run(side,image){preview(side,image);return session.run(side,image,(url,job)=>worker(side,url,job));}};
 }
 return{createSession,attachPanel};
});
