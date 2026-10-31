'use strict';
(()=>{
  const KEY='kbl-browser-owned-run-v1';let running=false,stopped=false;
  const prior=globalThis.__KBL_CONTENT_52R1;if(prior)try{prior.stop();}catch{}
  const VERSION='2.0.0';
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility==='visible'&&!e.closest('[inert],[aria-hidden="true"]');
  const b64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);};
  async function msg(task,type,extra={}){if(stopped)throw Error('Adapter cũ đã được thay.');const r=await chrome.runtime.sendMessage({type,runId:task.runId,nonce:task.nonce,...extra});if(r.error)throw Error(r.error);return r;}
  function blocked(){
    if(document.querySelector('iframe[src*="recaptcha"],iframe[src*="challenge"]'))return ['CHALLENGE','Trang yêu cầu xác minh; adapter dừng.'];
    // Provider notices only: source text, typed prompts and model quotations are
    // untrusted content, not account state. Avoid false QUOTA from "hết lượt"
    // inside a news headline or a prompt about usage limits.
    const exclude='textarea,input,[contenteditable],user-query,model-response,[data-message-author-role],[data-message-role],[data-testid="user-message"],.font-claude-response,.ds-markdown,pre,code,script,style,template,noscript,nav,aside';
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;const parts=[];
    while((node=walker.nextNode())){const parent=node.parentElement;if(parent&&!parent.closest(exclude)&&visible(parent))parts.push(node.nodeValue);}
    const s=parts.join(' ').slice(-16000);
    if(/(?:you(?:'ve| have) reached.{0,45}limit|reached your.{0,35}limit|(?:bạn|tài khoản).{0,40}(?:hết lượt|đã đạt giới hạn)|try again tomorrow)/i.test(s))return ['QUOTA','Chatbox báo hết lượt miễn phí.'];
    return null;
  }
  const DEFAULTS={composer:"rich-textarea [contenteditable='true'], .ql-editor[contenteditable='true'], textarea[aria-label='Enter a prompt'], textarea[aria-label='Nhập câu lệnh']",send:"button.send-button, button[aria-label='Send message'], button[aria-label='Gửi tin nhắn'], button[aria-label='Send prompt'], button[aria-label='Gửi câu lệnh'], button[aria-label='Send'], button[aria-label='Gửi']",responses:'model-response',generated:".generated-image img, img.generated-image, img[alt*='Generated'], img[alt*='generated'], img[alt*='được tạo']"};
  const PROVIDER=({'gemini.google.com':'gemini','chatgpt.com':'chatgpt','claude.ai':'claude','chat.deepseek.com':'deepseek','grok.com':'grok'})[location.hostname];
  const TEXT_ADAPTERS={
    grok:{composer:'textarea[placeholder], [contenteditable="true"][role="textbox"]',send:'button[aria-label="Send"],button[aria-label="Send message"]',responses:'[data-message-author-role="assistant"],.response-content-markdown',generated:''},
    chatgpt:{composer:'#prompt-textarea, textarea[data-id="root"]',send:'button[data-testid="send-button"], button[aria-label="Send prompt"]',responses:'[data-message-author-role="assistant"]',generated:'[data-testid="image-generation"] img, img[alt^="Image created"], img[alt^="Generated image"], img[alt^="Ảnh đã tạo"], img[alt^="Đã tạo hình ảnh"]'},
    claude:{composer:'[contenteditable="true"][role="textbox"], .ProseMirror[contenteditable="true"], .ProseMirror[contenteditable="plaintext-only"]',send:'button[aria-label="Send message"], button[aria-label="Send Message"]',responses:'.font-claude-response, [data-message-role="assistant"]',generated:''},
    deepseek:{composer:'textarea#chat-input, textarea[placeholder*="DeepSeek"]',send:'button[aria-label="Send"], [role="button"][aria-label="Send"], button[data-testid="send-button"]',responses:'.ds-markdown, [data-message-role="assistant"]',generated:''}
  };
  function selectors(input={}){return {...Object.fromEntries(Object.entries(TEXT_ADAPTERS[PROVIDER]||DEFAULTS).map(([k,v])=>[k,input[k]?(['composer','send'].includes(k)?input[k]:input[k]+', '+v):v])),manualComposer:!!input.composer?.trim(),manualSend:!!input.send?.trim()};}
  function findComposer(sel){
    const usable=e=>visible(e)&&!e.disabled&&!e.readOnly&&e.getAttribute('aria-disabled')!=='true'&&(e.tagName==='TEXTAREA'||['true','plaintext-only'].includes(e.getAttribute('contenteditable')))&&!e.closest('[role="dialog"],[role="search"],nav,aside');
    const known=[...new Set([...document.querySelectorAll(sel.composer)].flatMap(e=>usable(e)?[e]:sel.manualComposer?[]:[...e.querySelectorAll('textarea,[contenteditable="true"],[contenteditable="plaintext-only"]')].filter(usable)))];
    // Nested editor wrappers are one editable region; keep its deepest target.
    const leaves=known.filter(e=>!known.some(other=>other!==e&&e.contains(other)));
    if(leaves.length===1)return leaves[0];if(leaves.length>1)return null;
    // An old manually picked Claude selector can disappear after navigation.
    // Recover only a single recognized Claude editor, never a generic input.
    if(sel.manualComposer&&PROVIDER==='claude'){
      const editors=[...new Set(document.querySelectorAll('[contenteditable="true"][role="textbox"], .ProseMirror[contenteditable="true"], .ProseMirror[contenteditable="plaintext-only"]'))].filter(usable);
      const targets=editors.filter(e=>!editors.some(other=>other!==e&&e.contains(other)));
      return targets.length===1?targets[0]:null;
    }
    if(sel.manualComposer&&PROVIDER!=='chatgpt')return null;
    if(!['chatgpt','gemini'].includes(PROVIDER))return null;
    const query=PROVIDER==='gemini'
      ? 'rich-textarea textarea,rich-textarea [contenteditable="true"],rich-textarea [contenteditable="plaintext-only"],main [role="textbox"][contenteditable="true"],main [role="textbox"][contenteditable="plaintext-only"],.input-area textarea,.input-area [contenteditable="true"],.input-area [contenteditable="plaintext-only"],.input-area-container [contenteditable="true"],.input-area-container [contenteditable="plaintext-only"]'
      : '#prompt-textarea,textarea[data-id="root"],main form textarea,main form [contenteditable="true"],main form [contenteditable="plaintext-only"],main [role="textbox"][contenteditable="true"],main [role="textbox"][contenteditable="plaintext-only"],main [data-testid="composer"] [contenteditable="true"],form[data-type="unified-composer"] [contenteditable="true"]';
    const fallback=[...new Set(document.querySelectorAll(query))].filter(usable);
    return fallback.length===1?fallback[0]:null;
  }
  function sendButton(sel,composer){
    if(sel.manualSend){const chosen=[...document.querySelectorAll(sel.send)].filter(b=>visible(b)&&!b.disabled&&b.getAttribute('aria-disabled')!=='true'&&b.matches('button,[role="button"]')&&!b.closest('[role="dialog"],nav,aside'));return chosen.length===1?chosen[0]:null;}
    if(PROVIDER==='claude'){
      // Claude's editor and submit control can be siblings outside the editor's
      // inner form. Search only a small shared composer region, never the page.
      const names=/^(?:send|send message|send prompt|submit prompt|gửi|gửi tin nhắn|gửi câu lệnh|gửi lời nhắc)$/i;
      for(let root=composer.parentElement,depth=0;root&&depth<6&&!['HTML','BODY','MAIN'].includes(root.tagName);root=root.parentElement,depth++){
        const editors=[...root.querySelectorAll('textarea,[contenteditable="true"],[contenteditable="plaintext-only"]')].filter(visible);
        if(editors.some(e=>e!==composer&&!e.contains(composer)&&!composer.contains(e)))return null;
        const candidates=[...new Set([...root.querySelectorAll(sel.send),...root.querySelectorAll('button,[role="button"]')].filter(b=>visible(b)&&b.matches('button,[role="button"]')&&!b.closest('[role="dialog"],nav,aside')&&(b.matches(sel.send)||['aria-label','data-tooltip','title'].some(k=>names.test((b.getAttribute(k)||'').trim()))||names.test((b.innerText||'').trim()))))];
        if(candidates.length){const ready=candidates.filter(b=>!b.disabled&&b.getAttribute('aria-disabled')!=='true');return ready.length===1?ready[0]:null;}
      }
      return null;
    }
    const scope=composer.closest('form, .input-area, .input-container, .input-area-container')||composer.closest('rich-textarea')?.parentElement?.parentElement;
    // A composer-local button takes priority over another conversation's button.
    // More than one enabled match is ambiguous: leave the prompt unsent.
    const usable=b=>visible(b)&&!b.disabled&&b.getAttribute('aria-disabled')!=='true';
    const unique=items=>[...new Set(items)].filter(usable);
    if(scope){
      const candidates=[...scope.querySelectorAll(sel.send)];
      for(const b of scope.querySelectorAll('button'))if(/^(?:send|send message|send prompt|submit prompt|gửi|gửi tin nhắn|gửi câu lệnh|gửi lời nhắc)$/i.test(b.getAttribute('aria-label')||b.getAttribute('data-tooltip')||b.innerText?.trim()||''))candidates.push(b);
      const found=unique(candidates);
      return found.length===1?found[0]:null;
    }
    const found=unique(document.querySelectorAll(sel.send));
    return found.length===1?found[0]:null;
  }

  function responses(sel){return [...document.querySelectorAll(sel.responses)].filter(e=>!e.closest("user-query, [data-message-author-role='user'], [data-message-role='user'], [data-testid='user-message']"));}
  // JSON can appear as plain text or inside Gemini's code card. Bind to the
  // current nonce, not a response count that changes during SPA navigation.
  function resultKey(value){
    const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
    return JSON.stringify(ordered(value));
  }
  function displayedJSON(text,budget){
    // Claude can render a plain paragraph with typographic string delimiters.
    // Parse the COMPLETE JSON grammar first. Change only delimiter characters;
    // preserve string content and the original transcript. Never add syntax.
    let pos=0,changed=false;const edits=[];
    const bad=()=>{throw Error('JSON_DISPLAY_SYNTAX');};
    const step=()=>{if(--budget.left<0)bad();};
    const quote=c=>c==='"'||c==='“'||c==='”';
    const space=()=>{while(pos<text.length&&/[\x20\t\r\n]/.test(text[pos])){step();pos++;}};
    const valueEnd=at=>{while(at<text.length&&/[\x20\t\r\n]/.test(text[at])){step();at++;}return at===text.length||/[,}\]]/.test(text[at]);};
    function string(key=false){
      const start=pos,open=text[pos++];if(!quote(open))bad();let nested=0;
      for(;pos<text.length;pos++){
        step();const c=text[pos];if(c==='\\'){pos++;continue;}
        if(!quote(c))continue;
        // Keys end at their first delimiter. Values may contain balanced curly
        // quotations; those are content, even when followed by a comma.
        if(!key&&c==='“'&&!(nested===0&&valueEnd(pos+1))){nested++;continue;}
        if(!key&&c==='”'&&nested){nested--;continue;}
        // An unmatched delimiter followed by more text is malformed. Do not
        // swallow a missing comma/quote and merge the next field into content.
        if(!key&&(!valueEnd(pos+1)||nested))bad();
        const value=JSON.parse('"'+text.slice(start+1,pos)+'"');
        changed=changed||open!=='"'||c!=='"';edits.push(start,pos);pos++;
        return value;
      }
      bad();
    }
    function value(depth){
      step();if(depth>48)bad();space();const c=text[pos];
      if(quote(c)){string();return;}
      if(c==='{'){
        pos++;space();if(text[pos]==='}'){pos++;return;}const keys=new Set();
        for(;;){space();const key=string(true);if(keys.has(key))bad();keys.add(key);space();if(text[pos++]!==':')bad();value(depth+1);space();const end=text[pos++];if(end==='}')return;if(end!==',')bad();}
      }
      if(c==='['){
        pos++;space();if(text[pos]===']'){pos++;return;}
        for(;;){value(depth+1);space();const end=text[pos++];if(end===']')return;if(end!==',')bad();}
      }
      const atom=text.slice(pos).match(/^(?:null|true|false|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/);if(!atom)bad();pos+=atom[0].length;
    }
    value(0);if(!changed)bad();
    // Positions above are UTF-16 offsets, so keep surrogate pairs untouched.
    const units=text.split('');for(const at of edits)units[at]='"';
    return {value:JSON.parse(units.slice(0,pos).join('')),end:pos};
  }
  function wrapperFrom(text,nonce){
    if(typeof text!=='string'||text.length>210000)return null;
    const budget={left:1000000};let found=null;
    for(let start=text.indexOf('{');start>=0;start=text.indexOf('{',start+1)){
      let depth=0,quoted=false,escaped=false,end=-1,v;
      for(let i=start;i<text.length;i++){
        if(--budget.left<0)return null;const c=text[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
        if(c==='"'){quoted=true;continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0){end=i+1;break;}
      }
      if(end>=0)try{v=JSON.parse(text.slice(start,end));}catch{}
      // Mixed delimiters can defeat brace scanning (the nonce itself may end
      // with an ASCII quote). Parse their grammar from the original start.
      if(!v&&PROVIDER==='claude')try{const parsed=displayedJSON(text.slice(start),budget);v=parsed.value;end=start+parsed.end;}catch{}
      if(budget.left<0)return null;
      if(v?.kblNonce===nonce&&v.result&&typeof v.result==='object'&&!Array.isArray(v.result)){
        if(found&&resultKey(found.result)!==resultKey(v.result))throw Error('Có hai kết quả khác nhau cho cùng mã phiên; chưa tự chọn.');
        found=v;start=end-1;
      }
    }
    return found;
  }
  const USER_REGION="user-query, .user-query, .font-user-message, [data-message-role='user'], [data-role='user'], [data-message-author-role='user'], [data-testid='user-message'], [data-turn='user']";
  const INPUT_REGION="textarea,input,[contenteditable='true'],[contenteditable='plaintext-only'],form,nav,aside,[role='dialog']";
  let selectedResponse=null;
  function allowedResponse(node){return !!node&&!node.closest(USER_REGION+', '+INPUT_REGION)&&!node.querySelector(USER_REGION+', '+INPUT_REGION)&&!['HTML','BODY','MAIN'].includes(node.tagName);}
  function jsonInRegion(node,task){
    if(!allowedResponse(node))return null;
    // A code card is authoritative for that region. innerText/textContent are
    // alternate serializations of the SAME region, not independent AI answers.
    const texts=[...node.querySelectorAll('pre code, .code-block code')].map(e=>e.textContent);
    let found=null;
    for(const text of [...new Set(texts)]){const wrapper=wrapperFrom(text,task.nonce);if(!wrapper)continue;
      if(found&&resultKey(found.wrapper.result)!==resultKey(wrapper.result))throw Error('Có hai kết quả khác nhau cho cùng mã phiên; chưa tự chọn.');
      found={wrapper,text};
    }
    if(found)return found;
    for(const text of [...new Set([node.innerText||'',node.textContent||''])]){const wrapper=wrapperFrom(text,task.nonce);if(wrapper)return {wrapper,text};}
    return null;
  }
  function completedJSON(task,sel){
    if(selectedResponse?.runId===task.runId&&selectedResponse.nonce===task.nonce&&selectedResponse.node.isConnected)return jsonInRegion(selectedResponse.node,task);
    const roots=[...new Set([...responses(sel),...document.querySelectorAll("message-content, .model-response-text, [data-message-role='model'], [data-role='model'], article[data-turn='assistant'], [data-message-role='assistant'], [data-role='assistant']")])];
    let found=null;
    const keep=next=>{
      if(!next)return;
      if(found&&resultKey(found.wrapper.result)!==resultKey(next.wrapper.result))throw Error('Có hai kết quả khác nhau cho cùng mã phiên; chưa tự chọn.');
      found=next;
    };
    for(const root of roots){
      // A feedback form/control inside an assistant message must not hide a
      // separate JSON paragraph/code card. Never scan outside assistant roots
      // or descend into a mixed user/assistant container.
      if(!root||['HTML','BODY','MAIN'].includes(root.tagName)||root.closest(USER_REGION+', '+INPUT_REGION)||root.querySelector(USER_REGION))continue;
      const direct=jsonInRegion(root,task);
      if(direct){keep(direct);continue;}
      for(const node of new Set(root.querySelectorAll('pre, code, p, message-content, .model-response-text, .markdown, .ds-markdown')))keep(jsonInRegion(node,task));
    }
    return found;
  }
  function responseWake(ms){return new Promise(resolve=>{let timer;const finish=()=>{observer.disconnect();clearTimeout(timer);resolve();};const observer=new MutationObserver(finish);observer.observe(document.body,{childList:true,subtree:true,characterData:true});timer=setTimeout(finish,ms);});}
  async function collect(task,sel,meta){
    let signature='',stable=0,stableSince=0;const deadline=Date.now()+(task.recoverOnly?90000:30*60000);
    while(Date.now()<deadline){
      if(stopped)throw Error('Adapter cũ đã được thay.');
      const b=blocked();if(b)throw Object.assign(Error(b[1]),{code:b[0]});
      const list=responses(sel);const response=list.length>meta.before?list.at(-1):null;
      const generating=[...document.querySelectorAll('button, [role="button"]')].some(e=>visible(e)&&/^(stop|stop response|stop generating|stop streaming|dừng|dừng phản hồi|dừng tạo)$/i.test(e.getAttribute('aria-label')||e.innerText.trim()));
      if(task.kind!=='images'){
        const found=completedJSON(task,sel);
        if(found&&!generating){const next=JSON.stringify(found.wrapper);if(next===signature)stable++;else{signature=next;stable=0;stableSince=Date.now();}
          // Hidden tabs can wake once per minute. Require elapsed stability,
          // not four timer callbacks inside the 90-second recovery budget.
          if(stable>=1&&Date.now()-stableSince>=9000)return {result:found.wrapper.result,transcript:found.text.slice(0,200000),attachments:meta.attachments||[]};
        }else{signature='';stable=0;}
      }else if(response&&!generating){
        const code=[...response.querySelectorAll('pre code, .code-block code')].find(e=>e.textContent.includes('kblNonce'));const text=code?.textContent||(response.querySelector('message-content, .model-response-text')||response).innerText;const images=[...response.querySelectorAll(sel.generated)].filter(e=>e.complete&&e.naturalWidth>=480&&e.naturalHeight>=240);
        const next=task.kind==='images'?images.map(e=>e.currentSrc||e.src).join('|'):text;
        if(next&&next===signature)stable++;else{signature=next;stable=0;stableSince=Date.now();}
        if(stable>=1&&Date.now()-stableSince>=9000){
          if(task.kind==='images'){
            if(images.length!==1)throw Error('Cần đúng một ảnh được tạo trong câu trả lời, không lấy ảnh tìm kiếm hoặc ảnh cũ.');
            const img=images[0],url=img.currentSrc||img.src;let v;
            if(url.startsWith('blob:')){const r=await fetch(url);const blob=await r.blob();if(blob.size>12*1024*1024||!/^image\//.test(blob.type))throw Error('Blob ảnh sai');v={base64:b64(new Uint8Array(await blob.arrayBuffer())),mime:blob.type};}
            else v=await msg(task,'IMAGE_BYTES',{url});
            if(v.mime==='image/webp'){
              const raw=Uint8Array.from(atob(v.base64),c=>c.charCodeAt(0)),bitmap=await createImageBitmap(new Blob([raw],{type:v.mime}));if(bitmap.width*bitmap.height>10000000)throw Error('Ảnh vượt 10 MP');const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d').drawImage(bitmap,0,0);v={base64:canvas.toDataURL('image/png').split(',')[1],mime:'image/png'};bitmap.close();
            }
            if(!['image/png','image/jpeg'].includes(v.mime))throw Error('Cần PNG/JPEG');return {...v,transcript:PROVIDER+' generated-image DOM; '+String(text||'').slice(0,20000),attachments:[]};
          }
          let raw=text.trim();const fence=raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);if(fence)raw=fence[1];let wrapper;try{wrapper=JSON.parse(raw);}catch(_){throw Error('Gemini không trả JSON wrapper hoàn chỉnh; chưa tự gọi lại.');}
          if(wrapper.kblNonce!==task.nonce||!wrapper.result||typeof wrapper.result!=='object'||Array.isArray(wrapper.result))throw Error('JSON không khớp nonce phiên này.');
          return {result:wrapper.result,transcript:text.slice(0,200000),attachments:meta.attachments||[]};
        }
      }
      await responseWake(3000);
    }
    throw Error(task.recoverOnly?'Không thu được JSON đúng mã phiên ở tab cũ; giữ cuộc hội thoại, chưa gửi prompt mới.':'Chờ câu trả lời quá 30 phút; kiểm tra lại đúng cuộc hội thoại, chưa gửi lại prompt.');
  }
  function samePrompt(composer,task){
    if(!composer)return false;
    const actual=String(composer.tagName==='TEXTAREA'?composer.value:composer.innerText||'').replace(/\r\n/g,'\n').trim(),expected=String(task.prompt||'').replace(/\r\n/g,'\n').trim();
    if(actual===expected)return true;
    // ProseMirror renders adjacent paragraphs with extra LF separators in
    // innerText. Ignore only those empty-line gaps, never words, spaces,
    // punctuation, escaped JSON newlines, or invisible Unicode characters.
    return PROVIDER==='claude'&&composer.tagName!=='TEXTAREA'&&composer.classList?.contains('ProseMirror')===true&&actual.replace(/\n+/g,'\n')===expected.replace(/\n+/g,'\n');
  }
  function unsentProof(task,sel){
    const raw=sessionStorage.getItem(KEY),u=new URL(location.href),composer=findComposer(sel);
    const allowed=PROVIDER==='chatgpt'&&task?.provider==='chatgpt'&&['research','write','review'].includes(task.kind)&&task.resumeUnsent===true&&!task.attachmentHashes?.length&&/^[a-f0-9]{36}$/.test(task.runId||'')&&/^[a-f0-9]{36}$/.test(task.nonce||'');
    const safe=allowed&&!raw&&!blocked()&&u.pathname==='/'&&!u.search&&!u.hash&&responses(sel).length===0&&!!composer&&!String(composer.innerText||composer.value||'').trim();
    return {safeToSend:!!safe,reason:safe?'Ô nhập trống; lượt cũ dừng trước khi điền prompt.':'Đang giữ phiên; cần tab ChatGPT mới, ô nhập trống và không có dấu đã gửi.'};
  }
  async function sendPrepared(task,sel,meta,composer){
    if((task.resumePrepared===true||PROVIDER==='claude')&&!samePrompt(composer,task))throw Error('Nội dung ô nhập khác prompt của lượt đang giữ; chưa gửi.');
        let send;for(let n=0;n<30;n++){const b=blocked();if(b)throw Object.assign(Error(b[1]),{code:b[0]});send=sendButton(sel,composer);if(send)break;await wait(1000);}
        if(!send)throw Error('Prompt đã điền nhưng chưa tìm thấy nút gửi bật sau 30 giây; kiểm tra giao diện. Chưa tự gửi lại.');
        if(stopped)throw Error('Adapter cũ đã được thay.');if((task.resumePrepared===true||PROVIDER==='claude')&&!samePrompt(composer,task))throw Error('Prompt đã đổi trong khi chờ nút gửi; chưa gửi.');meta.status='sent';sessionStorage.setItem(KEY,JSON.stringify(meta));send.click();
        let accepted=false;for(let n=0;n<20;n++){if(!composer.isConnected||!(composer.innerText||composer.value||'').trim()||responses(sel).length>meta.before){accepted=true;break;}await wait(1000);}
        if(!accepted)throw Error('Đã bấm gửi nhưng chưa có dấu hiệu chatbox nhận. Giữ tab để kiểm tra; chưa gửi prompt lần hai.');
  }
  async function execute(task,sel,recover=false){
    if(running)return;running=true;sel=selectors(sel);
    if(!PROVIDER||task.provider&&task.provider!==PROVIDER){running=false;await msg(task,'FAILURE',{code:'UI_NEEDS_REVIEW',message:'Sai nhà cung cấp của tab; chưa gửi yêu cầu.'});return;}
    if((task.kind==='images'&&!['gemini','chatgpt'].includes(PROVIDER))||(task.kind==='image-review'&&(!['gemini','claude'].includes(PROVIDER)||!task.attachmentHashes?.length))){running=false;await msg(task,'FAILURE',{code:'UI_NEEDS_REVIEW',message:'Tạo ảnh dùng ChatGPT/Gemini; duyệt ảnh dùng Claude/Gemini và phải đính kèm ảnh thật.'});return;}
    try{
      if(task.resumeUnsent===true&&!unsentProof(task,sel).safeToSend)throw Error('Chưa chứng minh được lượt ChatGPT chưa gửi; giữ phiên để kiểm tra.');
      let meta;try{meta=JSON.parse(sessionStorage.getItem(KEY));}catch(_){}
      if(meta&&(meta.nonce!==task.nonce||meta.runId!==task.runId))throw Error('Tab đang gắn phiên khác.');
      if(meta?.status==='complete'){await msg(task,'RESULT',{payload:meta.payload});return;}
      const claudeReply=PROVIDER==='claude'&&recover&&task.resumePrepared===true&&['research','write','review'].includes(task.kind)&&!task.attachmentHashes?.length&&completedJSON(task,sel);
      if(task.resultOnly===true||claudeReply){
        // A reply already on screen is evidence to collect, never permission to
        // click Send. The old preparing marker can outlive a manual/native send.
        if(PROVIDER!=='claude'||!recover||(task.resultOnly===true&&task.recoverOnly!==true)||!['research','write','review'].includes(task.kind)||task.attachmentHashes?.length||!/^[a-f0-9]{36}$/.test(task.runId||'')||!/^[a-f0-9]{36}$/.test(task.nonce||''))throw Error('Chỉ đọc kết quả văn bản Claude của đúng lượt đang giữ.');
        const b=blocked();if(b)throw Object.assign(Error(b[1]),{code:b[0]});
        if(!claudeReply&&!completedJSON(task,sel))throw Error('Chưa có JSON hợp lệ đúng mã lượt trong vùng trả lời; chưa gửi prompt.');
        if(meta&&(!['preparing','sent'].includes(meta.status)||meta.attachments?.length))throw Error('Dấu phiên chưa phù hợp để thu văn bản.');
        meta=meta||{nonce:task.nonce,runId:task.runId,before:0,attachments:[]};
      }else if(task.resumePrepared===true&&meta?.status==='preparing'){
        const richPrepared=PROVIDER==='claude'&&task.resumeRichText===true;
        if(!['deepseek','claude'].includes(PROVIDER)||!['research','write','review'].includes(task.kind)||task.attachmentHashes?.length||!sel.manualSend&&!richPrepared)throw Error('Chỉ tiếp tục bản nháp văn bản Claude/DeepSeek còn nguyên; Cần chọn nút gửi một lần.');
        const composer=findComposer(sel);if(!samePrompt(composer,task))throw Error('Không còn đúng prompt đã chuẩn bị; giữ phiên để kiểm tra.');
        await sendPrepared(task,sel,meta,composer);
      }else if(task.recoverOnly){
        if(task.kind==='images'&&(!meta||meta.status!=='sent'||!Number.isInteger(meta.before)||meta.before<0))throw Error('Chưa có dấu phiên ảnh đã gửi trong đúng tab; giữ việc, không gửi lại.');
        if(task.attachmentHashes.length&&(!meta||meta.status!=='sent'||JSON.stringify(meta.attachments||[])!==JSON.stringify(task.attachmentHashes)))throw Error('Thiếu bằng chứng đã đính kèm đủ ảnh của phiên duyệt; chưa nộp kết quả.');
        meta=meta||{nonce:task.nonce,runId:task.runId,before:0,status:'sent',attachments:[]};
      }else if(!meta){
        if(recover)throw Error('Phiên bị ngắt trước khi ghi dấu; chưa tự gửi prompt lần hai.');
        let composer;
        for(let n=0;n<20;n++){const b=blocked();if(b)throw Object.assign(Error(b[1]),{code:b[0]});composer=findComposer(sel);if(composer)break;await wait(1000);}
        if(!composer)throw Error('Chưa đăng nhập '+PROVIDER+' hoặc ô nhập đã đổi.');
        if((composer.innerText||composer.value||'').trim())throw Error('Ô nhập đã có nội dung; chưa ghi đè.');
        meta={nonce:task.nonce,runId:task.runId,before:responses(sel).length,status:'preparing',attachments:[]};sessionStorage.setItem(KEY,JSON.stringify(meta));
        if(task.attachmentHashes.length){
          const {files}=await msg(task,'REVIEW_FILES');if(files.length!==task.attachmentHashes.length)throw Error('Thiếu ảnh QA');const dt=new DataTransfer();
          for(let i=0;i<files.length;i++){const v=files[i];if(v.hash!==task.attachmentHashes[i])throw Error('Hash đính kèm sai');const bytes=Uint8Array.from(atob(v.base64),c=>c.charCodeAt(0));dt.items.add(new File([bytes],'KBL-QA-'+i+'-'+v.hash.slice(0,8)+(v.mime==='image/png'?'.png':'.jpg'),{type:v.mime}));}
          const attachmentScope=()=>composer.closest('form, .input-area, .input-container, .input-area-container')||composer.closest('rich-textarea')?.parentElement?.parentElement||composer.parentElement?.parentElement;const oldImages=new Set([...(attachmentScope()?.querySelectorAll('img')||[])].map(i=>i.currentSrc||i.src));const input=[...document.querySelectorAll('input[type=file]')].find(e=>!e.accept||/image|png|jpg|jpeg|\*/i.test(e.accept));if(!input)throw Error('Giao diện không có ô đính kèm file; chưa duyệt bằng mô tả.');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
          let ok=false;for(let n=0;n<30;n++){const scope=attachmentScope();const count=scope?[...scope.querySelectorAll('img')].filter(i=>visible(i)&&!oldImages.has(i.currentSrc||i.src)).length:0;const names=scope&&[...dt.files].every(f=>scope.innerText.includes(f.name));if(count>=files.length||names){ok=true;break;}await wait(1000);}if(!ok)throw Error('Chưa thấy đủ ảnh trong composer; dừng bước duyệt.');meta.attachments=files.map(v=>v.hash);
        }
        if(!composer.isConnected)composer=findComposer(sel);if(!composer)throw Error('Ô nhập đã đổi sau khi đính kèm; chưa gửi prompt.');
        composer.focus();if(composer.tagName==='TEXTAREA'){const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;setter.call(composer,task.prompt);composer.dispatchEvent(new Event('input',{bubbles:true}));}
        else{document.execCommand('insertText',false,task.prompt);composer.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:task.prompt}));}
        if(!(composer.innerText||composer.value||'').includes(task.prompt.slice(-50)))throw Error('Ô nhập không nhận đủ prompt.');
        await sendPrepared(task,sel,meta,composer);
      } else if(meta.status!=='sent')throw Error('Phiên bị ngắt khi chuẩn bị; chưa gửi lại prompt.');
      const payload=await collect(task,sel,meta);if(task.kind!=='images'){meta.status='complete';meta.payload=payload;sessionStorage.setItem(KEY,JSON.stringify(meta));}await msg(task,'RESULT',{payload});
    }catch(e){if(stopped)return;try{let held;try{held=JSON.parse(sessionStorage.getItem(KEY));}catch{}const notSent=!recover&&(!held||held.runId===task.runId&&held.nonce===task.nonce&&held.status==='preparing');await msg(task,'FAILURE',{code:e.code||'UI_NEEDS_REVIEW',message:e.message,notSent});}catch(_){} }
    finally{running=false;}
  }
  let cancelPicker=()=>{};
  function beginComposerPick(request){
    cancelPicker();
    if(running)throw Error('Đang thực hiện công việc; chưa đổi ô chat.');
    const banner=document.createElement('div');
    const selectingSend=request.field==='send';
    banner.textContent=selectingSend?'KBL: bấm đúng NÚT GỬI để chọn. Lần bấm này chỉ lưu nhận diện, chưa gửi. Esc để hủy.':'KBL: bấm đúng Ô NHẬP TIN NHẮN để chọn. Không gửi nội dung. Esc để hủy.';
    banner.style.cssText='position:fixed;top:8px;left:8px;right:8px;z-index:2147483647;padding:18px;background:#173f50;color:white;border:2px solid #e6bd6b;border-radius:10px;font:16px sans-serif;pointer-events:none';
    document.body.appendChild(banner);
    let timer;
    const clean=()=>{clearTimeout(timer);document.removeEventListener('click',pick,true);document.removeEventListener('keydown',escape,true);banner.remove();cancelPicker=()=>{};};
    const escape=e=>{if(e.key==='Escape')clean();};
    const pick=async event=>{
      if(!event.isTrusted)return;
      const target=event.target.closest(selectingSend?'button,[role="button"]':'textarea,[contenteditable="true"],[contenteditable="plaintext-only"]');
      if(!target||!visible(target)||target.disabled||target.readOnly||target.closest('[role="dialog"],[role="search"],nav,aside'))return;
      event.preventDefault();event.stopImmediatePropagation();
      const parts=[];let selector='';
      // Structural CSS only: never store chat text, values, IDs, labels or URLs.
      for(let node=target;node&&node!==document.documentElement;node=node.parentElement){
        const tag=node.tagName.toLowerCase();
        const peers=node.parentElement?[...node.parentElement.children].filter(e=>e.tagName===node.tagName):[];
        parts.unshift(tag+(peers.length>1?':nth-of-type('+(peers.indexOf(node)+1)+')':''));
        const candidate=parts.join(' > ');
        if(document.querySelectorAll(candidate).length===1){selector=candidate;break;}
      }
      if(!selector||selector.length>500){banner.textContent='Chưa tạo được dấu nhận diện duy nhất. Esc để hủy.';return;}
      try{
        const result=await chrome.runtime.sendMessage({type:'COMPOSER_PICKED',nonce:request.nonce,selector,provider:PROVIDER,field:selectingSend?'send':'composer'});
        if(!result?.ok)throw Error(result?.error||'Chưa lưu được ô chat.');
        clean();
        const note=document.createElement('div');note.textContent=selectingSend?'KBL đã lưu nút gửi. Lượt chưa gửi chỉ tiếp tục nếu còn nguyên prompt và mã lượt.':'KBL đã lưu ô chat. Mở tiện ích → Kiểm tra kết nối và phiên.';
        note.style.cssText=banner.style.cssText;document.body.appendChild(note);setTimeout(()=>note.remove(),8000);
      }catch(error){banner.textContent='KBL: '+error.message;}
    };
    document.addEventListener('click',pick,true);document.addEventListener('keydown',escape,true);
    timer=setTimeout(clean,90000);cancelPicker=clean;
  }
  function beginResultPick(request){
    const task=request.task;
    if(!['chatgpt','deepseek','claude'].includes(PROVIDER)||!task||!['research','write','review'].includes(task.kind)||task.attachmentHashes?.length||!/^[a-f0-9]{36}$/.test(task.runId||'')||!/^[a-f0-9]{36}$/.test(task.nonce||''))throw Error('Chỉ chọn kết quả văn bản ChatGPT/DeepSeek/Claude của lượt đang giữ.');
    let meta;try{meta=JSON.parse(sessionStorage.getItem(KEY));}catch{}
    if(meta&&(meta.nonce!==task.nonce||meta.runId!==task.runId||!['sent','complete',...(PROVIDER==='claude'?['preparing']:[])].includes(meta.status)))throw Error('Tab chưa có bằng chứng đúng lượt đã gửi.');
    if(blocked())throw Error('Trang yêu cầu xác minh hoặc hết lượt; giữ phiên.');
    cancelPicker();
    const banner=document.createElement('div');banner.textContent='KBL: bấm vào PHẦN CHỮ của JSON do AI trả lời. Chỉ đọc kết quả đúng mã lượt; không gửi prompt. Esc để hủy.';
    banner.style.cssText='position:fixed;top:8px;left:8px;right:8px;z-index:2147483647;padding:18px;background:#173f50;color:white;border:2px solid #e6bd6b;border-radius:10px;font:16px sans-serif;pointer-events:none';document.body.appendChild(banner);
    let timer;
    const clean=()=>{clearTimeout(timer);document.removeEventListener('click',pick,true);document.removeEventListener('keydown',escape,true);banner.remove();cancelPicker=()=>{};};
    const escape=e=>{if(e.key==='Escape')clean();};
    const pick=event=>{
      if(!event.isTrusted||!event.target?.closest||event.target.closest(USER_REGION+', '+INPUT_REGION+', button,a'))return;
      event.preventDefault();event.stopImmediatePropagation();
      try{
        let chosen=null,sawNonce=false,sawCurrentNonce=false;
        for(let node=event.target;node&&!['HTML','BODY','MAIN'].includes(node.tagName);node=node.parentElement){
          if(!allowedResponse(node))break;
          for(const text of [node.innerText||'',node.textContent||'']){if(text.length>210000)continue;sawNonce=sawNonce||text.includes('kblNonce');sawCurrentNonce=sawCurrentNonce||text.includes('kblNonce')&&text.includes(task.nonce);}
          if(jsonInRegion(node,task)){chosen=node;break;}
        }
        if(!chosen){banner.textContent=sawCurrentNonce
          ?'KBL: đã thấy đúng mã lượt nhưng cấu trúc JSON chưa hợp lệ hoặc chưa đầy đủ. Giữ nguyên chat; cần kiểm tra bộ thu, không gửi lại prompt. Esc để đóng.'
          :sawNonce?'KBL: câu trả lời có mã lượt khác với lượt đang giữ. Chưa nhận kết quả; giữ nguyên chat để đối chiếu, không gửi lại prompt. Esc để đóng.'
          :'KBL: vùng vừa chọn chưa có wrapper kblNonce của AI. Bấm phần chữ trong câu trả lời; Esc để hủy.';return;}
        selectedResponse={runId:task.runId,nonce:task.nonce,node:chosen};
        clean();
        // No payload is created here: the normal stable collector re-reads DOM,
        // validates conflicts, nonce and schema, and persists the usual outbox.
        const note=document.createElement('div');note.style.cssText=banner.style.cssText;
        note.textContent='KBL: đã chọn vùng JSON đúng mã lượt. Đang thu và chờ biên nhận từ Admin.';document.body.appendChild(note);setTimeout(()=>note.remove(),12000);
        chrome.runtime.sendMessage({type:'RESULT_REGION_PICKED',runId:task.runId,nonce:task.nonce}).then(r=>{if(r?.error)note.textContent='KBL: '+r.error;}).catch(()=>{note.textContent='KBL: chưa liên lạc được với tiện ích; giữ nguyên chat và kiểm tra kết nối.';});
      }catch(e){banner.textContent='KBL: '+e.message;}
    };
    document.addEventListener('click',pick,true);document.addEventListener('keydown',escape,true);timer=setTimeout(clean,90000);cancelPicker=clean;
  }
  // Called only by this extension after a durable local result receipt.
  // Retire the ownership marker, never the chat history or the stored result.
  function prepareNext(request){
    if(running)throw Error('TAB_LOCK_BUSY: Tab vẫn đang thu câu trả lời.');
    const b=blocked();if(b)throw Error(b[1]);
    const sel=selectors(request.selectors),composer=findComposer(sel);
    if(!composer)throw Error('TAB_LOCK_EDITOR: Chưa xác nhận ô nhập của tab đã gắn.');
    if((composer.innerText||composer.value||'').trim())throw Error('TAB_LOCK_DRAFT: Ô nhập đang có bản nháp; chưa ghi đè.');
    const generating=[...document.querySelectorAll('button, [role="button"]')].some(e=>visible(e)&&/^(stop|stop response|stop generating|stop streaming|dừng|dừng phản hồi|dừng tạo)$/i.test(e.getAttribute('aria-label')||e.innerText.trim()));
    if(generating)throw Error('TAB_LOCK_BUSY: AI vẫn đang trả lời; giữ nguyên tab.');
    const raw=sessionStorage.getItem(KEY);let meta;
    if(raw){try{meta=JSON.parse(raw);}catch{throw Error('TAB_LOCK_METADATA: Dấu phiên không đọc được; chưa xóa.');}
      // Owner recovery is separate from a server receipt. Background verified
      // the complete IndexedDB archive before asking to release this marker.
      const archived=request.archived42;
      if(archived&&(!/^[a-f0-9-]{36}$/.test(archived.epoch||'')||typeof archived.archiveKey!=='string'||!archived.archiveKey.startsWith('recovery42:'+archived.epoch+':')))throw Error('TAB_LOCK_ARCHIVE: Bản lưu khôi phục chưa hợp lệ.');
      const r=request.retired||archived;
      if(!r||!/^[a-f0-9]{36}$/.test(r.runId||'')||!/^[a-f0-9]{36}$/.test(r.nonce||'')||meta.runId!==r.runId||meta.nonce!==r.nonce)throw Error('TAB_LOCK_HELD: Tab giữ lượt chưa có biên nhận phù hợp.');
      sessionStorage.removeItem(KEY);selectedResponse=null;
    }
    return {ok:true,version:VERSION};
  }
  function listener(m,sender,reply){
    if(stopped||sender.id!==chrome.runtime.id)return;
    if(m.type==='PREPARE_NEXT'){try{reply(prepareNext(m));}catch(e){reply({error:e.message,version:VERSION});}return;}
    if(m.type==='PICK_COMPOSER'){try{beginComposerPick(m);reply({ok:true,version:VERSION});}catch(e){reply({error:e.message});}return;}
    if(m.type==='PICK_RESULT'){try{beginResultPick(m);reply({ok:true,version:VERSION});}catch(e){reply({error:e.message});}return;}
    if(m.type==='PROBE_UNSENT'){try{reply({version:VERSION,...unsentProof(m.task,selectors(m.selectors))});}catch(e){reply({version:VERSION,safeToSend:false,reason:e.message});}return;}
    if(m.type==='PROBE'){
      const b=blocked();let ready=false,detail='';
      try{ready=!b&&!!findComposer(selectors(m.selectors));
        if(!ready&&!b){const editors=[...document.querySelectorAll('textarea,[contenteditable="true"],[contenteditable="plaintext-only"]')].filter(visible);
          detail='Bộ nhận diện '+VERSION+': thấy '+editors.length+' ô nhập hiển thị nhưng chưa xác định duy nhất ô chat. '+(editors.length?'Bấm Chọn ô chat trong tiện ích rồi bấm đúng vùng nhập '+PROVIDER+'; không gửi prompt thử.':'Hãy đóng popup, mở cuộc trò chuyện mới và chờ trang tải xong.');}
      }catch{detail='Selector tùy chỉnh không hợp lệ; kiểm tra phần Selector trong tiện ích.';}
      reply({version:VERSION,provider:PROVIDER,ready,executing:running,code:b?b[0]:ready?'':'UI_NEEDS_REVIEW',detail});return;
    }
    if(m.type==='PROBE_RUN'){
      const t=m.task,b=blocked();if(!t||!/^[a-f0-9]{36}$/.test(t.nonce||'')||!/^[a-f0-9]{36}$/.test(t.runId||'')){reply({version:VERSION,matched:false});return;}
      if(b){reply({version:VERSION,matched:false,code:b[0]});return;}
      try{
        let meta;try{meta=JSON.parse(sessionStorage.getItem(KEY));}catch{}
        if(meta&&(meta.nonce!==t.nonce||meta.runId!==t.runId)){reply({version:VERSION,matched:false,reason:'TAB_METADATA_MISMATCH'});return;}
        const owned=meta?.nonce===t.nonce&&meta?.runId===t.runId&&(['sent','complete'].includes(meta.status)||(t.resumePrepared===true&&['deepseek','claude'].includes(PROVIDER)&&meta.status==='preparing'&&samePrompt(findComposer(selectors(m.selectors)),t)));
        const proof=!t.attachmentHashes?.length||(owned&&JSON.stringify(meta.attachments||[])===JSON.stringify(t.attachmentHashes));
        const json=t.kind!=='images'&&proof&&!!completedJSON(t,selectors(m.selectors));
        reply({version:VERSION,matched:!!(proof&&(owned||json)),proof:json?'json':owned?'metadata':'',collectable:!!json,reason:json?'READY_TO_COLLECT':owned?'WAIT_RESPONSE':'NO_RUN_PROOF'});
      }catch(e){reply({version:VERSION,matched:false,code:'RESULT_CONFLICT',message:e.message});}
      return;
    }
    if(!['EXECUTE','RECOVER'].includes(m.type))return;reply({accepted:true,version:VERSION});execute(m.task,m.selectors,m.type==='RECOVER');
  }
  globalThis.__KBL_CONTENT_52R1={stop(){stopped=true;cancelPicker();chrome.runtime.onMessage.removeListener(listener);}};
  chrome.runtime.onMessage.addListener(listener);
})();
