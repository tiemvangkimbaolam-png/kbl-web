// Display only. Never rewrites an input, changes its cursor, submits or stores a value.
export function formatNumberInput(value,kind='money') {
  const raw=String(value??'').trim();
  if(!raw)return '';
  if(raw.length>60)return null;
  let integer,fraction,decimal=false;
  if(kind==='money') {
    if(!/^(?:\d+|\d{1,3}(?:[.,]\d{3})+)$/.test(raw))return null;
    integer=raw.replace(/[.,]/g,'');
  } else if(kind==='decimal') {
    const match=/^(\d+)(?:[.,](\d*))?$/.exec(raw);
    if(!match)return null;
    integer=match[1];fraction=match[2];decimal=fraction!==undefined;
  } else return null;
  integer=integer.replace(/^0+(?=\d)/,'').replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  return integer+(decimal?','+fraction:'');
}
/** @param {Document|Element} root */
export function refreshNumberPreviews(root=document) {
  for(const input of root.querySelectorAll('input[data-number-preview]')) {
    const doc=input.ownerDocument,output=doc.getElementById(input.dataset.numberPreviewOutput);
    if(!output)continue;
    const formatted=formatNumberInput(input.value,input.dataset.numberPreview);
    output.hidden=formatted==='';
    output.textContent=formatted===null?'Chưa đọc được số này':formatted?'Đang nhập: '+formatted+(input.dataset.numberUnit?' '+input.dataset.numberUnit:''):'';
  }
}
let sequence=0;
/** @param {Document|Element} root */
export function mountNumberPreviews(root=document) {
  const added=[];
  for(const input of root.querySelectorAll('input[data-number-preview]')) {
    const doc=input.ownerDocument;
    if(doc.getElementById(input.dataset.numberPreviewOutput))continue;
    let id;do{id='kbl-number-preview-'+(++sequence);}while(doc.getElementById(id));
    const output=doc.createElement('output');output.id=id;output.className='kbl-number-preview';output.hidden=true;
    output.setAttribute('aria-live','polite');output.setAttribute('aria-atomic','true');
    if(input.id)output.setAttribute('for',input.id);
    input.dataset.numberPreviewOutput=id;
    const described=(input.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean);input.setAttribute('aria-describedby',[...described,id].join(' '));
    const anchor=input.hasAttribute('data-number-preview-outside')?input.parentElement:input;
    anchor.insertAdjacentElement('afterend',output);added.push({input,output});
  }
  const refresh=()=>refreshNumberPreviews(root),reset=()=>queueMicrotask(refresh);
  root.addEventListener('input',refresh);root.addEventListener('change',refresh);root.addEventListener('reset',reset);refresh();
  return {refresh,destroy(){root.removeEventListener('input',refresh);root.removeEventListener('change',refresh);root.removeEventListener('reset',reset);for(const {input,output} of added){output.remove();const ids=(input.getAttribute('aria-describedby')||'').split(/\s+/).filter(id=>id&&id!==output.id);if(ids.length)input.setAttribute('aria-describedby',ids.join(' '));else input.removeAttribute('aria-describedby');delete input.dataset.numberPreviewOutput;}}};
}
