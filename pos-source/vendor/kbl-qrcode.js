/* KBL local QR fallback - MIT-compatible wrapper around Kazuhiko Arase QRCode. */
(function(global){
  'use strict';
  if (typeof global.QRCode === 'function') return;
  let MatrixQRCode = null;
  try {
    const p = (typeof __dirname !== 'undefined' && typeof require === 'function')
      ? require('path').join(__dirname, 'vendor', 'qrcode') : './vendor/qrcode';
    MatrixQRCode = require(p);
  } catch (error) {
    console.error('[KBL QR] Local QR engine unavailable:', error && error.message ? error.message : error);
    return;
  }
  const levels = { L:1, M:0, Q:3, H:2 };
  function svgDataUrl(matrix, dark, light){
    const count = matrix.getModuleCount();
    const quiet = 4, side = count + quiet * 2;
    const cells = [];
    for (let y=0; y<count; y++) for (let x=0; x<count; x++) {
      if (matrix.isDark(y,x)) cells.push('M'+(x+quiet)+','+(y+quiet)+'h1v1h-1z');
    }
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+side+' '+side+'" shape-rendering="crispEdges">'
      + '<rect width="'+side+'" height="'+side+'" fill="'+String(light||'#fff')+'"/>'
      + '<path fill="'+String(dark||'#000')+'" d="'+cells.join('')+'"/></svg>';
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  }
  function resolveElement(el){ return typeof el === 'string' ? document.getElementById(el) : el; }
  function QRCodeCompat(el, options){
    if (!(this instanceof QRCodeCompat)) return new QRCodeCompat(el, options);
    this._el = resolveElement(el);
    this._htOption = Object.assign({text:'', width:128, height:128, colorDark:'#000000', colorLight:'#ffffff', correctLevel:levels.H}, options||{});
    this._oQRCode = null;
    if (this._htOption.text !== undefined && this._htOption.text !== null) this.makeCode(this._htOption.text);
  }
  QRCodeCompat.prototype.clear = function(){ if (this._el) this._el.innerHTML=''; };
  QRCodeCompat.prototype.makeCode = function(text){
    const raw = String(text == null ? '' : text);
    const matrix = new MatrixQRCode(-1, Number(this._htOption.correctLevel));
    matrix.addData(raw); matrix.make(); this._oQRCode = matrix;
    if (!this._el) return;
    this.clear();
    const img = document.createElement('img');
    img.alt = 'QR';
    img.width = Number(this._htOption.width)||128; img.height = Number(this._htOption.height)||128;
    img.style.width = img.width+'px'; img.style.height = img.height+'px'; img.style.imageRendering='pixelated';
    img.src = svgDataUrl(matrix, this._htOption.colorDark, this._htOption.colorLight);
    this._el.appendChild(img);
  };
  QRCodeCompat.CorrectLevel = levels;
  global.QRCode = QRCodeCompat;
})(window);
