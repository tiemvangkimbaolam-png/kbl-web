/*
 * KBL Shared Scale V2.4
 * - Mot ket noi can dung chung cho POS.
 * - Tu khoi phuc cong da duoc cap quyen.
 * - Tu thu cac cau hinh serial pho bien, uu tien cau hinh Sartorius cu.
 * - Pawn iframe va Pawn doc lap deu nhan cung mot luong du lieu.
 */
(() => {
  'use strict';

  const PROFILES = [
    { id:'sartorius-1200-7O1', label:'1200 · 7O1', baudRate:1200, dataBits:7, parity:'odd', stopBits:1, flowControl:'none' },
    { id:'generic-9600-8N1', label:'9600 · 8N1', baudRate:9600, dataBits:8, parity:'none', stopBits:1, flowControl:'none' },
    { id:'generic-2400-7E1', label:'2400 · 7E1', baudRate:2400, dataBits:7, parity:'even', stopBits:1, flowControl:'none' },
    { id:'generic-4800-8N1', label:'4800 · 8N1', baudRate:4800, dataBits:8, parity:'none', stopBits:1, flowControl:'none' },
    { id:'generic-9600-7E1', label:'9600 · 7E1', baudRate:9600, dataBits:7, parity:'even', stopBits:1, flowControl:'none' },
    { id:'generic-19200-8N1', label:'19200 · 8N1', baudRate:19200, dataBits:8, parity:'none', stopBits:1, flowControl:'none' },
    { id:'generic-1200-8N1', label:'1200 · 8N1', baudRate:1200, dataBits:8, parity:'none', stopBits:1, flowControl:'none' },
    { id:'generic-2400-8N1', label:'2400 · 8N1', baudRate:2400, dataBits:8, parity:'none', stopBits:1, flowControl:'none' },
    { id:'generic-4800-7E1', label:'4800 · 7E1', baudRate:4800, dataBits:7, parity:'even', stopBits:1, flowControl:'none' }
  ];

  let sharedPort = null;
  let sharedReader = null;
  let connectTask = null;
  let activeConsumer = 'gold-buy';
  let lastWeight = null;
  let activeProfile = null;
  let targetComPort = localStorage.getItem('kbl_scale_com_port') || 'COM3';

  const getElement = id => document.getElementById(id);
  function getIpcRenderer(){ try { return typeof require === 'function' ? require('electron').ipcRenderer : null; } catch (_) { return null; } }
  function setTargetPort(portName){
    targetComPort = String(portName || targetComPort || 'COM3').trim().toUpperCase() || 'COM3';
    try { localStorage.setItem('kbl_scale_com_port', targetComPort); } catch (_) {}
    const ipc = getIpcRenderer(); if (ipc) ipc.send('set-target-com', targetComPort);
  }
  function consumerForTab(tabId){ if(tabId==='tab-camdo')return'pawn'; if(tabId==='tab-kho')return'gold-kho'; if(tabId==='tab-banhang')return'gold-sale-old'; return'gold-buy'; }
  function pawnFrame(){ return getElement('pawn-app-frame'); }
  function isConnected(){ return Boolean(sharedPort && sharedPort.readable); }
  function setStatus(message,isError=false){
    document.querySelectorAll('#shared-scale-status,[data-shared-scale-status]').forEach(el=>{el.textContent=message;el.style.color=isError?'#b42318':'#198754';});
    const frame=pawnFrame();
    if(frame?.contentWindow) frame.contentWindow.postMessage({type:'kbl-scale-status',connected:isConnected(),message,error:isError,profile:activeProfile?.label||''},'*');
    if(window.parent===window) window.postMessage({type:'kbl-scale-status',connected:isConnected(),message,error:isError,profile:activeProfile?.label||''},'*');
  }

  function splitWeightToGoldFields(weight,ids,recalculate){
    let tenthLy=Math.max(0,Math.round(Number(weight)*10000));
    const luong=Math.floor(tenthLy/10000);tenthLy-=luong*10000;
    const chi=Math.floor(tenthLy/1000);tenthLy-=chi*1000;
    const phan=Math.floor(tenthLy/100);tenthLy-=phan*100;
    const ly=tenthLy/10;
    [luong,chi,phan,ly].forEach((v,i)=>{const el=getElement(ids[i]);if(el)el.value=v;});
    if(typeof window[recalculate]==='function')window[recalculate]();
  }
  function updatePurchaseWeight(w){splitWeightToGoldFields(w,['b-w-l','b-w-c','b-w-p','b-w-y'],'calcBuyMath');}
  function updateInventoryWeight(w){splitWeightToGoldFields(w,['i-t-l','i-t-c','i-t-p','i-t-y'],'calcInvMath');}
  function updateSaleOldWeight(w){splitWeightToGoldFields(w,['ex-old-gross-l','ex-old-gross-c','ex-old-gross-p','ex-old-gross-y'],'calcSellMath');}
  function routeWeight(weight){
    if(!Number.isFinite(weight))return; lastWeight=weight;
    if(activeConsumer==='pawn'){
      const msg={type:'kbl-scale-weight',weight}; const frame=pawnFrame();
      if(frame?.contentWindow) frame.contentWindow.postMessage(msg,'*'); else window.postMessage(msg,'*');
      return;
    }
    if(activeConsumer==='gold-sale-old')return updateSaleOldWeight(weight);
    if(activeConsumer==='gold-kho')return updateInventoryWeight(weight);
    updatePurchaseWeight(weight);
  }
  function parseWeight(frame){
    const text=String(frame||'').replace(/\u0000/g,'').replace(/,/g,'.').trim(); if(!text)return null;
    const match=text.match(/([-+]?\s*(?:\d+(?:\.\d+)?|\.\d+))\s*(kg|g|gram|grams|ct|carat|chi|chỉ|luong|lượng|tael|tl)?/i);
    if(!match)return null;
    let n=Number(String(match[1]).replace(/\s+/g,'')); if(!Number.isFinite(n)||Math.abs(n)>=100000)return null;
    const unit=String(match[2]||'').toLowerCase();
    // Nội bộ POS dùng đơn vị lượng. Nếu cân phát kèm đơn vị, tự đổi an toàn.
    if(unit==='kg') n=(n*1000)/37.5;
    else if(unit==='g'||unit==='gram'||unit==='grams') n=n/37.5;
    else if(unit==='ct'||unit==='carat') n=(n/5)/37.5;
    else if(unit==='chi'||unit==='chỉ') n=n/10;
    // luong/lượng/tael/tl hoặc không có hậu tố: giữ chuẩn lượng cũ để tương thích cân hiện tại.
    return n;
  }
  function consumeChunk(chunk,state,onValue=routeWeight){
    state.buffer+=chunk; const frames=state.buffer.split(/[\r\n]+/); state.buffer=frames.pop()||'';
    frames.forEach(f=>{const v=parseWeight(f);if(v!==null)onValue(v);});
    if(state.buffer.length>64){const v=parseWeight(state.buffer);if(v!==null)onValue(v);state.buffer='';}
  }
  async function readSerial(port){
    const decoder=new TextDecoder(); const state={buffer:''};
    while(sharedPort===port&&port.readable){
      sharedReader=port.readable.getReader();
      try{while(true){const result=await sharedReader.read();if(result.done)break;if(result.value)consumeChunk(decoder.decode(result.value,{stream:true}),state);}}
      catch(error){if(sharedPort===port)setStatus(`Mất dữ liệu cân: ${error?.message||error}`,true);}
      finally{try{sharedReader.releaseLock();}catch(_){} sharedReader=null;}
    }
  }
  function portKey(port){
    try{const i=port.getInfo?.()||{};return `usb-${i.usbVendorId||0}-${i.usbProductId||0}`;}catch(_){return 'serial-default';}
  }
  function profileOrder(port){
    let saved=''; try{saved=localStorage.getItem(`kbl_scale_profile_${portKey(port)}`)||localStorage.getItem('kbl_scale_profile_default')||'';}catch(_){}
    return [...PROFILES].sort((a,b)=>(a.id===saved?-1:b.id===saved?1:0));
  }
  async function closePort(port){
    try{if(sharedReader){await sharedReader.cancel();try{sharedReader.releaseLock();}catch(_){} sharedReader=null;}}catch(_){}
    try{if(port?.readable||port?.writable)await port.close();}catch(_){}
    await new Promise(r=>setTimeout(r,90));
  }
  async function probeProfile(port,profile,timeoutMs=1350){
    let reader=null,timer=null; const decoder=new TextDecoder(),state={buffer:''};
    try{
      await port.open(profile);
      if(!port.readable)return {ok:false};
      reader=port.readable.getReader();
      return await new Promise(resolve=>{
        let done=false; const finish=(ok,value)=>{if(done)return;done=true;clearTimeout(timer);resolve({ok,value});};
        timer=setTimeout(()=>finish(false,null),timeoutMs);
        (async()=>{try{while(!done){const {value,done:rdDone}=await reader.read();if(rdDone)break;if(value){consumeChunk(decoder.decode(value,{stream:true}),state,v=>finish(true,v));}}}catch(_){}finally{finish(false,null);}})();
      });
    } finally {
      try{await reader?.cancel();}catch(_){} try{reader?.releaseLock();}catch(_){}
      await closePort(port);
    }
  }
  async function selectProfile(port,allowProbe=true){
    const ordered=profileOrder(port);
    if(allowProbe){
      setStatus('Đang tự nhận chuẩn dữ liệu cân…');
      for(const profile of ordered){
        try{
          const probed=await probeProfile(port,profile);
          if(probed.ok){if(probed.value!==null)lastWeight=probed.value;return profile;}
        }catch(_) { await closePort(port); }
      }
    }
    return ordered[0]||PROFILES[0];
  }
  async function openForUse(port,profile){
    await port.open(profile); sharedPort=port; activeProfile=profile;
    try{localStorage.setItem(`kbl_scale_profile_${portKey(port)}`,profile.id);localStorage.setItem('kbl_scale_profile_default',profile.id);}catch(_){}
    setStatus(`Đã nối cân · ${profile.label}.`);
    if(lastWeight!==null)routeWeight(lastWeight);
    readSerial(port).catch(error=>{if(sharedPort===port)setStatus(`Lỗi đọc cân: ${error?.message||error}`,true);});
    return port;
  }
  async function obtainPort(allowRequest){
    const permitted=await navigator.serial.getPorts();
    if(permitted.length===1)return permitted[0];
    if(permitted.length>1){
      // Neu co nhieu cong da cap quyen, requestPort de Electron main tu chon theo COM da luu.
      if(allowRequest)return navigator.serial.requestPort();
      return permitted[0];
    }
    if(!allowRequest)return null;
    return navigator.serial.requestPort();
  }
  async function connectSharedScale(consumer,portName,options={}){
    activeConsumer=consumer||activeConsumer; setTargetPort(portName);
    if(!('serial' in navigator)){const error='Máy này chưa hỗ trợ Web Serial.';setStatus(error,true);throw new Error(error);}
    if(isConnected()){setStatus(`Đang dùng cân · ${activeProfile?.label||targetComPort}.`);if(lastWeight!==null)routeWeight(lastWeight);return sharedPort;}
    if(connectTask)return connectTask;
    connectTask=(async()=>{
      let port=null;
      try{
        port=await obtainPort(options.allowRequest!==false);
        if(!port)throw new Error('Chưa có quyền sử dụng cổng cân.');
        const profile=options.profile||await selectProfile(port,options.probe!==false);
        return await openForUse(port,profile);
      }catch(error){if(port)await closePort(port);sharedPort=null;activeProfile=null;setStatus(`Không nối được cân: ${error?.message||error}`,true);throw error;}
      finally{connectTask=null;}
    })();
    return connectTask;
  }
  function requestConnect(consumer,inputId,overridePortName){const input=inputId?getElement(inputId):null;return connectSharedScale(consumer,overridePortName||input?.value||targetComPort||'COM3',{allowRequest:true,probe:true}).catch(()=>null);}
  async function autoConnect(){
    const consumer=(window.parent===window&&document.getElementById('inp-money'))?'pawn':activeConsumer;
    return connectSharedScale(consumer,targetComPort,{allowRequest:true,probe:true});
  }
  async function autoReconnect(){
    if(!('serial' in navigator)||isConnected())return null;
    const ports=await navigator.serial.getPorts(); if(!ports.length)return null;
    activeConsumer=(window.parent===window&&document.getElementById('inp-money'))?'pawn':activeConsumer;
    return connectSharedScale(activeConsumer,targetComPort,{allowRequest:false,probe:false}).catch(()=>null);
  }
  async function disconnect(){const p=sharedPort;sharedPort=null;activeProfile=null;await closePort(p);setStatus('Đã ngắt cân.');}
  function fallbackSwitchTab(tabId){document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));getElement(tabId)?.classList.add('active');document.querySelector(`.tab-btn[onclick*="${tabId}"]`)?.classList.add('active');}
  function installTabRouting(){
    const original=window.switchTab;
    window.switchTab=function(tabId){activeConsumer=consumerForTab(tabId);try{typeof original==='function'?original(tabId):fallbackSwitchTab(tabId);}catch(_){fallbackSwitchTab(tabId);}setStatus(isConnected()?`Đã nối cân · ${activeProfile?.label||targetComPort}.`:'Chưa nối cân.');if(isConnected()&&lastWeight!==null)routeWeight(lastWeight);};
  }
  window.addEventListener('message',event=>{const m=event.data||{};if(m.type==='kbl-scale-connect'){activeConsumer='pawn';requestConnect('pawn',null,m.comPort);}else if(m.type==='kbl-scale-active'){activeConsumer='pawn';}});
  const isPawnDocument=()=>Boolean(document.getElementById('inp-money')&&!document.getElementById('b-w-l'));
  // Ở pawn.html giữ nguyên initSerialPort của chính trang: iframe sẽ yêu cầu
  // reader chung ở cửa sổ POS; bản Cầm Đồ riêng sẽ gọi shared-scale trực tiếp.
  if(!isPawnDocument()) window.initSerialPort=()=>requestConnect('gold-buy','inp-com-port');
  window.initSerialPortKho=()=>requestConnect('gold-kho','inp-inv-com-port');
  window.initSerialPortSaleOld=()=>requestConnect('gold-sale-old','inp-sell-com-port');
  window.__kblSharedScale={connect:connectSharedScale,autoConnect,autoReconnect,disconnect,routeWeight,parseWeight,profiles:[...PROFILES],getStatus:()=>({connected:isConnected(),targetComPort,activeConsumer,lastWeight,profileId:activeProfile?.id||'',profileLabel:activeProfile?.label||''})};
  const boot=()=>{installTabRouting();const embeddedPawn=isPawnDocument()&&window.parent!==window;if(!embeddedPawn)setTimeout(autoReconnect,700);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
