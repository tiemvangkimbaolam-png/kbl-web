'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const ORIGINAL='00661078da086f29309459e0ef348cdaca39f22dcae6ed8a73c69ef51d04c2e0';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function rendererPatch(bytes,edits){
 if(sha(bytes)!==ORIGINAL)throw Error('renderer.js khác bản ông đã gửi. Chưa ghi gì; cần đối chiếu bản đang dùng.');
 const source=bytes.toString('utf8'),eol=source.includes('\r\n')?'\r\n':'\n',lines=source.split(/\r?\n/);
 for(const e of [...edits].sort((a,b)=>b.line-a.line))lines.splice(e.line-1,e.deleteCount,...e.after.split('\n'));
 return Buffer.from(lines.join(eol));
}
function mainPatch(bytes){
 const source=bytes.toString('utf8');
 if(source.includes("require('./kbl-connection.cjs').read()"))return bytes;
 const marker='function getPublicWebSyncConfig() {',start=source.indexOf(marker);
 if(start<0||source.indexOf(marker,start+1)>=0)throw Error('Không khớp hàm kết nối trong main.js. Chưa ghi gì.');
 const tail=source.slice(start,start+600);
 if(!/^function getPublicWebSyncConfig\(\) \{\s*const settings = readSettingsObject\(\);\s*const url = String\(settings.web_sync_url/.test(tail))throw Error('main.js có thay đổi ở phần kết nối. Chưa ghi gì.');
 const eol=source.includes('\r\n')?'\r\n':'\n';
 return Buffer.from(source.slice(0,start+marker.length)+eol+"    const savedLink = require('./kbl-connection.cjs').read();"+eol+'    if (savedLink) return savedLink;'+source.slice(start+marker.length));
}
function install(root){
 const manifestFile=path.join(root,'KBL_BACKUP_DIA_CHI','manifest.json');
 if(fs.existsSync(manifestFile)){
  const m=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  if(m.files.every(r=>fs.existsSync(path.join(root,r.name))&&sha(fs.readFileSync(path.join(root,r.name)))===r.after))return {success:true,alreadyInstalled:true};
  throw Error('Đã có bản sửa nhưng file đã đổi. Không chép đè; cần kiểm tra.');
 }
 const edits=JSON.parse(fs.readFileSync(path.join(__dirname,'connection-edits.json'),'utf8'));
 const files=[{name:'renderer.js',change:b=>rendererPatch(b,edits)},{name:'main.js',change:mainPatch}].map(r=>({...r,before:fs.readFileSync(path.join(root,r.name))}));
 for(const r of files){r.after=r.change(r.before);const tmp=path.join(root,'.kbl-check-'+r.name);try{fs.writeFileSync(tmp,r.after);const c=cp.spawnSync(process.execPath,['--check',tmp],{encoding:'utf8',windowsHide:true});if(c.status!==0)throw Error('Kiểm tra cú pháp thất bại; chưa ghi file POS.');}finally{fs.rmSync(tmp,{force:true});}}
 const moduleName='kbl-connection.cjs',moduleData=fs.readFileSync(path.join(__dirname,moduleName)),moduleTarget=path.join(root,moduleName);
 if(fs.existsSync(moduleTarget)&&sha(fs.readFileSync(moduleTarget))!==sha(moduleData))throw Error('Module kết nối khác phiên bản. Chưa ghi gì.');
 const backup=path.join(root,'KBL_BACKUP_DIA_CHI');fs.mkdirSync(backup,{recursive:false});
 for(const r of files)fs.writeFileSync(path.join(backup,r.name),r.before,{flag:'wx'});
 const moduleExisted=fs.existsSync(moduleTarget);
 try{fs.writeFileSync(moduleTarget,moduleData);for(const r of files)fs.writeFileSync(path.join(root,r.name),r.after);
 fs.writeFileSync(manifestFile,JSON.stringify({moduleExisted,moduleHash:sha(moduleData),files:files.map(r=>({name:r.name,before:sha(r.before),after:sha(r.after)}))},null,2),{flag:'wx'});
 }catch(e){for(const r of files)fs.writeFileSync(path.join(root,r.name),r.before);if(!moduleExisted)fs.rmSync(moduleTarget,{force:true});throw e;}
 return {success:true,changed:['renderer.js','main.js',moduleName],backup:'KBL_BACKUP_DIA_CHI'};
}
if(require.main===module){try{console.log(JSON.stringify(install(path.resolve(process.argv[2]||path.join(__dirname,'..'))),null,2));console.log('Mở lại POS, nhập địa chỉ relay và mã local từ worker rồi bấm LƯU hoặc ĐỒNG BỘ GIÁ.');}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={install,rendererPatch,mainPatch};
