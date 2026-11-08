'use strict';
// Run manually once on the owner's Windows machine. Never prints the key.
if(process.platform!=='win32')throw Error('Chỉ dùng trên Windows.');
const cp=require('node:child_process'),crypto=require('node:crypto');
const result=cp.spawnSync('clip.exe',[],{input:crypto.randomBytes(32).toString('hex'),windowsHide:true,shell:false});
if(result.error||result.status!==0)throw Error('Chưa sao chép được khóa.');
console.log('Đã sao chép khóa mới vào clipboard. Dán vào Cloudflare Secret KBL_PRICE_ENCRYPTION_KEY, rồi lưu. Không gửi khóa trong chat. Không tạo/thay khóa nếu Worker đã có khóa đang dùng.');
