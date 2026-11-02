'use strict';
// Connection-only override. Never reads/writes prices, sales, stock or pawn data.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const file=()=>path.join(process.env.LOCALAPPDATA||os.homedir(),'KBL-New','pos-link.json');
function validateUrl(value){
 const u=new URL(String(value||'').trim());
 const local=u.protocol==='http:'&&u.hostname==='127.0.0.1'&&u.port==='39878';
 if((u.protocol!=='https:'&&!local)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('Dùng HTTPS gốc của website hoặc http://127.0.0.1:39878. Không thêm đường dẫn.');
 return u.origin;
}
function validate(value){
 const url=validateUrl(value?.url),token=String(value?.token||'').trim();
 if(token.length>4096||/[\r\n\x00]/.test(token))throw Error('Mã đồng bộ không hợp lệ.');
 return {url,token};
}
function read(){try{return validate(JSON.parse(fs.readFileSync(file(),'utf8')));}catch(e){if(e.code==='ENOENT')return null;throw Error('Cấu hình kết nối riêng bị lỗi; kiểm tra pos-link.json trước khi đồng bộ.');}}
function save(value){const data=validate(value),target=file();fs.mkdirSync(path.dirname(target),{recursive:true});const tmp=target+'.'+process.pid+'.tmp';try{fs.writeFileSync(tmp,JSON.stringify(data),{mode:0o600});fs.renameSync(tmp,target);}finally{fs.rmSync(tmp,{force:true});}return {success:true,url:data.url};}
function publicBase(value){const candidate=String(value||'').trim()||'https://tiemvangkimbaolam.id.vn';const url=validateUrl(candidate);if(!url.startsWith('https://'))throw Error('QR sản phẩm phải dùng tên miền HTTPS công khai, không dùng relay local.');return url;}
module.exports={validateUrl,validate,read,save,publicBase};
