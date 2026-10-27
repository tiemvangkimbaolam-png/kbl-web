'use strict';
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
function validateConfig(value) {
    if (!value || typeof value !== 'object' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.id || '') || typeof value.token !== 'string' || !/^[a-f0-9]{64}$/.test(value.token)) throw Error('Cấu hình worker không hợp lệ. Tải lại từ Admin → Kết nối; không nhập token bằng tay.');
    const u = new URL(value.serverUrl);
    if (u.protocol !== 'https:' || u.pathname !== '/' || u.username || u.password || u.search || u.hash) throw Error('Website phải là địa chỉ HTTPS gốc.');
    return { serverUrl: u.origin, id: value.id };
}
function loadConfig(root) { return validateConfig(JSON.parse(fs.readFileSync(path.join(root, 'kbl-config.json'), 'utf8'))); }
function startupPlan(root, mode) {
    if (!['enable','disable'].includes(mode)) throw Error('Chọn enable hoặc disable.');
    return { file: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-File', path.join(root, 'CAI_TU_KHOI_DONG.ps1'), '-Mode', mode], options: { shell: false, windowsHide: true, stdio: 'inherit' } };
}
if (require.main === module) {
    try {
        if (Number(process.versions.node.split('.')[0]) < 24) throw Error('Cần Node.js 24.');
        const mode = process.argv[2] || 'check', root = __dirname;
        if (mode === 'check') {
            const c = loadConfig(root);
            console.log('Cấu hình hợp lệ cho ' + c.serverUrl + '. Chưa chứng minh máy chủ/AI/giọng đọc online.');
            console.log('Thiết lập một lần: MO_CAU_HINH.cmd · chạy nền: CHAY_NEN.cmd · tự khởi động: BAT_TU_KHOI_DONG.cmd.');
        } else if (mode === 'open') {
            if (process.platform !== 'win32') throw Error('Chỉ mở thiết lập trên Windows.');
            loadConfig(root);
            cp.spawn('wscript.exe', [path.join(root, 'CHAY_AN.vbs')], { windowsHide: true, detached: true, stdio: 'ignore', shell: false }).unref();
            (async () => {
                for (let i=0; i<30; i++) {
                    if (await require('./launcher.cjs').running()) {
                        const c=cp.spawn('rundll32.exe',['url.dll,FileProtocolHandler','http://127.0.0.1:39878/'], { windowsHide:true, detached:true, stdio:'ignore', shell:false });
                        c.on('error', e=>{console.error(e.message);process.exitCode=1;}); c.unref(); return;
                    }
                    await new Promise(r=>setTimeout(r,1000));
                }
                console.error('Worker chưa sẵn sàng. Mở BAT_DAU.cmd để xem lỗi; không tạo thêm hồ sơ Chrome.'); process.exitCode=1;
            })().catch(e=>{console.error(e.message);process.exitCode=1;});
        } else if (['enable', 'disable'].includes(mode)) {
            if (process.platform !== 'win32') throw Error('Chỉ cài tự khởi động trên Windows.');
            if (mode === 'enable') loadConfig(root);
            const p = startupPlan(root, mode), r = cp.spawnSync(p.file, p.args, p.options);
            if (r.error) throw r.error;
            process.exitCode = r.status || 0;
        } else throw Error('Dùng node setup.cjs check|open|enable|disable');
    } catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = { validateConfig, loadConfig, startupPlan };
