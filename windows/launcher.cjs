'use strict';
// One launcher per installation. Never closes Chrome or another worker.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), cp = require('node:child_process'), http = require('node:http');
const setup = require('./setup.cjs');
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function running() { return new Promise(resolve => { const r = http.get('http://127.0.0.1:39878/integration/health', { timeout: 2000 }, res => { let b=''; res.on('data', x => b+=x); res.on('end', () => { try { resolve(JSON.parse(b).protocol === 'kbl-chrome-bridge-v1'); } catch { resolve(false); } }); }); r.on('timeout', () => r.destroy()); r.on('error', () => resolve(false)); }); }
async function main() {
    const config = setup.loadConfig(__dirname), dir = path.join(process.env.LOCALAPPDATA || os.homedir(), 'KBL-New', 'worker-' + config.id);
    fs.mkdirSync(dir, { recursive: true });
    const lock = path.join(dir, 'launcher.lock'); let fd;
    try { fd = fs.openSync(lock, 'wx'); }
    catch (e) {
        if (e.code !== 'EEXIST') throw e;
        let pid; try { pid = Number(fs.readFileSync(lock, 'utf8')); if (pid > 0) { process.kill(pid, 0); return; } } catch (x) { if (x.code !== 'ESRCH' && x.code !== 'ENOENT') return; }
        fs.rmSync(lock, { force: true }); fd = fs.openSync(lock, 'wx');
    }
    fs.writeFileSync(fd, String(process.pid));
    process.on('exit', () => { try { fs.closeSync(fd); if (fs.readFileSync(lock,'utf8') === String(process.pid)) fs.unlinkSync(lock); } catch {} });
    if (await running()) return;
    const log = path.join(dir, 'worker-console.log');
    for (let attempt=0; attempt<5; attempt++) {
        if (fs.existsSync(log) && fs.statSync(log).size > 5*1024*1024) { fs.rmSync(log+'.previous', {force:true}); fs.renameSync(log, log+'.previous'); }
        const stream = fs.openSync(log,'a');
        const child = cp.spawn(process.execPath,[path.join(__dirname,'KBL_WINDOWS.cjs')],{cwd:__dirname,windowsHide:true,shell:false,stdio:['ignore',stream,stream]});
        const code = await new Promise((resolve,reject) => { child.once('error',reject); child.once('exit',resolve); });
        fs.closeSync(stream);
        if (code === 0 || code === 2 || await running()) return;
        await wait(Math.min(60000, 5000*(attempt+1)));
    }
    fs.appendFileSync(log,'\nWorker dừng sau 5 lần khởi động lỗi. Mở BAT_DAU.cmd để kiểm tra. Không đóng Chrome.\n');
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode=1; });
module.exports = { running };
