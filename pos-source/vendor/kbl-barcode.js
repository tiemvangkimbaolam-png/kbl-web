/* KBL offline barcode fallback. Renders Code 39 for KBL alphanumeric SKUs. */
(function(global){
  'use strict';
  if (typeof global.JsBarcode === 'function') return;
  const P={
    '0':'111221211','1':'211211112','2':'112211112','3':'212211111','4':'111221112','5':'211221111','6':'112221111','7':'111211212','8':'211211211','9':'112211211',
    'A':'211112112','B':'112112112','C':'212112111','D':'111122112','E':'211122111','F':'112122111','G':'111112212','H':'211112211','I':'112112211','J':'111122211',
    'K':'211111122','L':'112111122','M':'212111121','N':'111121122','O':'211121121','P':'112121121','Q':'111111222','R':'211111221','S':'112111221','T':'111121221',
    'U':'221111112','V':'122111112','W':'222111111','X':'121121112','Y':'221121111','Z':'122121111','-':'121111212','.':'221111211',' ':'122111211','$':'121212111','/':'121211121','+':'121112121','%':'111212121','*':'121121211'
  };
  function valid(text){ return /^[0-9A-Z. $/+%\-]+$/.test(text); }
  function JsBarcodeCompat(svg, value, options){
    if (!svg || !svg.setAttribute) throw new Error('Thiếu SVG barcode.');
    let text=String(value==null?'':value).toUpperCase();
    if (!valid(text)) throw new Error('Mã chứa ký tự Code39 không hỗ trợ.');
    const opt=Object.assign({width:1.25,height:40,margin:0,displayValue:false},options||{});
    text='*'+text+'*'; const narrow=Math.max(.5,Number(opt.width)||1.25), wide=narrow*2.4, gap=narrow;
    let x=Number(opt.margin)||0; const bars=[];
    for(let ci=0;ci<text.length;ci++){
      const pat=P[text[ci]]; if(!pat)continue;
      for(let i=0;i<pat.length;i++){
        const w=(pat[i]==='2'?wide:narrow);
        if(i%2===0)bars.push([x,w]);
        x+=w;
      }
      if(ci<text.length-1)x+=gap;
    }
    const h=Math.max(4,Number(opt.height)||40), margin=Number(opt.margin)||0, width=x+margin;
    while(svg.firstChild)svg.removeChild(svg.firstChild);
    svg.setAttribute('xmlns','http://www.w3.org/2000/svg'); svg.setAttribute('viewBox','0 0 '+width+' '+h); svg.setAttribute('width',String(width)); svg.setAttribute('height',String(h)); svg.setAttribute('shape-rendering','crispEdges');
    for(const b of bars){ const r=document.createElementNS('http://www.w3.org/2000/svg','rect'); r.setAttribute('x',String(b[0]));r.setAttribute('y','0');r.setAttribute('width',String(b[1]));r.setAttribute('height',String(h));r.setAttribute('fill','#000');svg.appendChild(r); }
    return svg;
  }
  global.JsBarcode=JsBarcodeCompat;
})(window);
