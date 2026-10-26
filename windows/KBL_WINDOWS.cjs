'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto'), cp = require('node:child_process'), os = require('node:os');
if (Number(process.versions.node.split('.')[0]) < 24)
    throw Error('Cần Node.js 24 để dùng SQLite bền vững.');
const root = __dirname, configFile = path.join(root, 'kbl-config.json');
if (!fs.existsSync(configFile)) {
    console.error('Chưa có kbl-config.json. Vào Admin mới → Kết nối → Kết nối Windows → Tải cấu hình, đặt cạnh file này.');
    process.exit(2);
}
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
const origin = new URL(config.serverUrl);
if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.username || origin.password || origin.search || origin.hash)
    throw Error('Cần địa chỉ HTTPS gốc của website mới.');
config.serverUrl = origin.origin;
const dataDir = path.join(process.env.LOCALAPPDATA || os.homedir(), 'KBL-New', 'worker-' + config.id), ledger = require('./ledger.cjs').open(dataDir), bridge = require('./bridge.cjs').create({ config, ledger }), hub = require('./runtime/browser-hub.cjs').createHub({ bridge, dataDir });
bridge.attachHub(hub);
const pos = require('./pos-relay.cjs').create({ config, ledger, bridge });
const secret = crypto.randomBytes(32).toString('hex'), PORT = 39878;
let syncing = false, rendering = false, renderStatus = 'Chưa kiểm tra công cụ dựng.', capabilities = [], renderActive = ledger.get('render-active');
const htmlEscape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function chromePath() { return [path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe')].find(f => fs.existsSync(f)); }
async function openAccount(a, commandId, background = false) { const visible = ledger.get('visible-until') || {}; visible[a.id] = background ? 0 : Date.now() + 300000; ledger.set('visible-until', visible); if (a.online && hub.requestLogin(a.id, commandId))
    return { waiting: true, message: 'Đã yêu cầu tiện ích mở lại đúng tab hiện có.' }; const exe = chromePath(); if (!exe)
    throw Error('Không tìm thấy Google Chrome.'); const maps = ledger.get('profiles') || {}, dir = maps[a.id] || path.join(dataDir, 'profiles', a.id); if (a.extensionId && !maps[a.id])
    throw Error('Hồ sơ đã ghép ngoài thư mục quản lý. Mở đúng Chrome hiện có; không tự tạo hồ sơ thay thế.'); if (maps[a.id] && await profileRunning(dir))
    throw Error('Đúng hồ sơ Chrome vẫn đang mở nhưng tiện ích chưa báo về. Kiểm tra tiện ích trong cửa sổ đó; không tạo tab khác.'); fs.mkdirSync(dir, { recursive: true }); maps[a.id] = dir; ledger.set('profiles', maps); cp.spawn(exe, ['--user-data-dir=' + dir, '--new-window', ...(background ? ['--start-minimized'] : []), PROVIDERS[a.provider]], { detached: true, stdio: 'ignore', windowsHide: background }).unref(); return { ok: true, message: 'Đã mở đúng hồ sơ được quản lý. Nếu lần đầu: nạp tiện ích EXTENSION tại chrome://extensions và ghép mã từ trang local.' }; }
async function profileRunning(dir) { if (process.platform !== 'win32')
    return false; const script = "$p=$env:KBL_PROFILE_PATH; $found=@(Get-CimInstance Win32_Process -Filter \"name='chrome.exe'\" | Where-Object {$_.CommandLine -and $_.CommandLine.IndexOf($p,[StringComparison]::OrdinalIgnoreCase) -ge 0}).Count; if($found -gt 0){'yes'}else{'no'}"; return new Promise((resolve, reject) => { const c = cp.spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, shell: false, env: { ...process.env, KBL_PROFILE_PATH: dir }, stdio: ['ignore', 'pipe', 'ignore'] }); let output = ''; const timer = setTimeout(() => { c.kill(); reject(Error('Kiểm tra Chrome quá thời gian; không mở thêm.')); }, 12000); c.stdout.on('data', b => output += b); c.on('error', e => { clearTimeout(timer); reject(e); }); c.on('exit', code => { clearTimeout(timer); if (code !== 0)
    reject(Error('Chưa xác nhận được Chrome đang chạy; không mở thêm.'));
else
    resolve(output.trim() === 'yes'); }); }); }
function existingProfiles() { const roots = [path.join(config.existingWorkerDir || path.resolve(root, '..'), 'work', 'ai-browser43', 'profiles'), path.join(process.env.LOCALAPPDATA || os.homedir(), 'KBL-AI-Team', 'admin-39', 'profiles')], out = []; for (const base of roots) {
    if (!fs.existsSync(base))
        continue;
    for (const name of fs.readdirSync(base).slice(0, 50)) {
        const dir = path.join(base, name);
        try {
            if (fs.lstatSync(dir).isSymbolicLink() || !fs.statSync(dir).isDirectory() || !fs.existsSync(path.join(dir, 'Default', 'Preferences')))
                continue;
        }
        catch {
            continue;
        }
        out.push({ key: crypto.createHash('sha256').update(dir.toLowerCase()).digest('hex'), label: name, dir });
    }
} return out; }
const PROVIDERS = { gemini: 'https://gemini.google.com/app', chatgpt: 'https://chatgpt.com/', claude: 'https://claude.ai/', deepseek: 'https://chat.deepseek.com/', grok: 'https://grok.com/' };
async function read(req) { let n = 0, p = []; for await (const b of req) {
    n += b.length;
    if (n > 17 * 1024 * 1024)
        throw Error('Dữ liệu quá lớn.');
    p.push(b);
} return JSON.parse(Buffer.concat(p)); }
const server = http.createServer(async (req, res) => {
    const send = (code, v) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(v)); };
    const host = '127.0.0.1:' + PORT;
    if (req.headers.host !== host || !['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress))
        return send(403, { success: false });
    try {
        const u = new URL(req.url, 'http://' + host);
        if (u.pathname.startsWith('/api/sync/')) {
            if (req.method !== 'POST' || !pos.auth(req.headers['x-kbl-sync-token']) || req.headers.origin && req.headers.origin !== 'http://' + host)
                return send(403, { success: false, message: 'Thiếu quyền đồng bộ POS local.' });
            const result = await pos.accept(u.pathname.slice('/api/sync/'.length), await read(req));
            return send(result.status, result.body);
        }
        if (req.method === 'GET' && u.pathname === '/') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'nonce-" + secret + "'; frame-ancestors 'none'" });
            const rows = hub.view().accounts, candidates = existingProfiles();
            return res.end(`<!doctype html><html lang="vi"><meta charset="utf-8"><title>KBL Windows mới</title><style>body{font:15px Arial;max-width:900px;margin:40px auto;padding:20px;background:#f3f8fb;color:#173b55}section{background:white;padding:20px;margin:16px 0;border:1px solid #cbd8df;border-radius:12px}button{padding:10px;cursor:pointer}code{overflow-wrap:anywhere}input{padding:10px;width:330px}</style><h1>KBL Windows · Kết nối mới</h1><p>Máy chủ: ${htmlEscape(config.serverUrl)}. Giữ cửa sổ chạy; không upload thư mục Windows lên hosting.</p><p>${htmlEscape(renderStatus)}</p><p>Tiện ích: <code>${htmlEscape(path.join(root, 'EXTENSION'))}</code></p><p>Trong đúng hồ sơ Chrome: mở chrome://extensions → Chế độ nhà phát triển → Tải tiện ích đã giải nén → chọn EXTENSION. Sau đó mở tiện ích, dán mã ghép một lần bên dưới, bật nhận việc và lưu.</p><section><h2>Đồng bộ POS → Website</h2><p>Chỉ đọc dữ liệu POS. Dán URL và mã bên dưới vào phần đồng bộ website sẵn có trong POS.</p><button id="pos-connect">Lấy cấu hình POS trên máy này</button><div id="pos-settings" hidden><p>Địa chỉ đồng bộ: <code>http://127.0.0.1:39878</code></p><label>Mã đồng bộ <input id="pos-token" readonly type="password" autocomplete="off"></label><p>Thư mục data đang chứa product-photos:</p><input id="pos-dir" aria-label="Thư mục data POS"><button id="pos-dir-save">Lưu đường dẫn đọc ảnh</button></div><p id="pos-status"></p></section>${rows.map(a => `<section><h2>${htmlEscape(a.label)}</h2><p>${htmlEscape(a.id)} · ${htmlEscape(a.provider)}</p><button data-pair="${htmlEscape(a.id)}">Lấy mã ghép một lần</button> <button data-open="${htmlEscape(a.id)}">Mở đăng nhập</button><p>Giữ phiên Chrome đang có (không sao chép cookie): <select id="p-${htmlEscape(a.id)}"><option value="">Chọn hồ sơ cũ nếu có</option>${candidates.map(p => `<option value="${p.key}">${htmlEscape(p.label)} · ${htmlEscape(p.dir)}</option>`).join('')}</select> <button data-bind="${htmlEscape(a.id)}">Dùng hồ sơ này</button></p><p id="r-${htmlEscape(a.id)}"></p></section>`).join('')}<script nonce="${secret}">async function posCall(route,body={}){const r=await fetch('/local/'+route,{method:'POST',headers:{'Content-Type':'application/json','x-kbl-local':'${secret}'},body:JSON.stringify(body)});const v=await r.json();if(!r.ok)throw Error(v.message||'Chưa kết nối được.');return v;}document.getElementById('pos-connect').onclick=async()=>{try{const v=await posCall('pos-config');document.getElementById('pos-settings').hidden=false;document.getElementById('pos-token').value=v.token;document.getElementById('pos-dir').value=v.dataDir;document.getElementById('pos-status').textContent='Chờ gửi: '+v.pending+' · Ảnh chờ: '+v.photoPending+' · '+(v.lastError||'Chưa có lỗi ghi nhận.');}catch(e){document.getElementById('pos-status').textContent=e.message;}};document.getElementById('pos-dir-save').onclick=async()=>{try{await posCall('pos-directory',{dataDir:document.getElementById('pos-dir').value});document.getElementById('pos-status').textContent='Đã lưu đường dẫn chỉ đọc; không sửa dữ liệu POS.';}catch(e){document.getElementById('pos-status').textContent=e.message;}};document.onclick=async e=>{const id=e.target.dataset.pair||e.target.dataset.open||e.target.dataset.bind;if(!id)return;const r=await fetch(e.target.dataset.pair?'/local/pair':e.target.dataset.bind?'/local/profile':'/local/open',{method:'POST',headers:{'Content-Type':'application/json','x-kbl-local':'${secret}'},body:JSON.stringify({accountId:id,profileKey:document.getElementById('p-'+id)?.value})}),v=await r.json();document.getElementById('r-'+id).textContent=v.code||v.message||'Chưa thực hiện được.';};</script></html>`);
        }
        if (u.pathname.startsWith('/local/')) {
            if (req.headers['x-kbl-local'] !== secret || req.headers.origin && req.headers.origin !== 'http://' + host)
                return send(403, { success: false });
            const b = await read(req);
            if (u.pathname === '/local/pos-config') return send(200, pos.credentials());
            if (u.pathname === '/local/pos-directory') return send(200, pos.setDataDir(b.dataDir));
            if (u.pathname === '/local/pair')
                return send(200, { code: hub.issuePairing(b.accountId) });
            if (u.pathname === '/local/profile') {
                const profile = existingProfiles().find(p => p.key === b.profileKey), account = hub.view().accounts.find(a => a.id === b.accountId);
                if (!profile || !account)
                    throw Error('Chọn đúng hồ sơ đã có trên máy.');
                if (hub.view().runs.some(r => r.accountId === account.id && !['confirmed', 'expired'].includes(r.status)))
                    throw Error('Đang có việc; chưa đổi hồ sơ.');
                const maps = ledger.get('profiles') || {};
                maps[account.id] = profile.dir;
                ledger.set('profiles', maps);
                return send(200, { message: 'Đã giữ đường dẫn hồ sơ cũ. Tắt tiện ích KBL cũ trong hồ sơ, nạp tiện ích mới và ghép mã; không xóa đăng nhập AI.' });
            }
            if (u.pathname === '/local/open') {
                const a = hub.view().accounts.find(x => x.id === b.accountId);
                if (!a)
                    throw Error('Không có tài khoản.');
                return send(200, await openAccount(a, crypto.randomBytes(16).toString('hex')));
            }
            return send(404, { success: false });
        }
        if (u.pathname === '/integration/health')
            return send(200, { protocol: 'kbl-chrome-bridge-v1', release: '2.1.0' });
        if (!u.pathname.startsWith('/browser/'))
            return send(404, { success: false });
        const eid = req.headers['x-kbl-extension-id'];
        if (req.headers.origin && req.headers.origin !== 'chrome-extension://' + eid)
            return send(403, { success: false });
        if (u.pathname === '/browser/pair' && req.method === 'POST') {
            const b = await read(req);
            return send(200, { success: true, ...hub.redeemPairing(b.code, eid) });
        }
        const a = hub.auth(req.headers['x-kbl-browser-token'], eid);
        if (u.pathname === '/browser/window') {
            const b = await read(req);
            return send(200, { success: true, ...require('./window-control.cjs').control(ledger, a.id, b) });
        }
        if (u.pathname === '/browser/identity')
            return send(200, { success: true, account: { id: a.id, label: a.label, provider: a.provider, roles: a.roles } });
        if (u.pathname === '/browser/asset') {
            const v = await hub.asset(a, u.searchParams.get('run'), Number(u.searchParams.get('index')));
            res.writeHead(200, { 'Content-Type': v.mime, 'x-kbl-asset-hash': v.hash });
            return res.end(v.bytes);
        }
        const b = await read(req);
        if (u.pathname === '/browser/poll') {
            const v = await hub.poll(a, b);
            if (v.task) {
                const r = hub.view().runs.find(r => r.id === v.task.runId);
                if (r)
                    await bridge.dispatch(r.jobId);
            }
            return send(200, { success: true, ...v });
        }
        if (u.pathname === '/browser/result')
            return send(200, { success: true, ...await hub.result(a, b) });
        if (u.pathname === '/browser/failure') {
            const v = hub.failure(a, b), r = hub.view().runs.find(r => r.id === b.runId);
            if (r) {
                const c = ledger.get('claims')?.[r.jobId];
                if (c)
                    await bridge.request('/api/worker/jobs/' + r.jobId + '/failure', 'POST', { lease: c.token, message: b.message, notSent: b.notSent === true }).catch(() => { });
            }
            return send(200, { success: true, ...v });
        }
        return send(404, { success: false });
    }
    catch (e) {
        send(e.status || 409, { success: false, message: e.message });
    }
});
async function renderTick() { if (rendering || !capabilities.includes('render') || Date.now() < (ledger.get('render-next-at') || 0))
    return; rendering = true; try {
    if (!renderActive) {
        const r = await bridge.request('/api/worker/claim', 'POST', { capabilities: ['render'] });
        if (!r.job)
            return;
        renderActive = r;
        ledger.set('render-active', r);
    }
    const { job, lease } = renderActive;
    await bridge.request('/api/worker/jobs/' + job.id + '/dispatch', 'POST', { lease });
    if (!renderActive.result) {
        renderActive.result = await require('./render.cjs').render({ job, lease, bridge, config, workDir: path.join(dataDir, 'render') });
        ledger.set('render-active', renderActive);
    }
    const r = await bridge.request('/api/worker/jobs/' + job.id + '/complete', 'POST', { lease, result: renderActive.result });
    if (r.stored) {
        renderActive = null;
        ledger.set('render-active', null);
        console.log('Đã lưu biên nhận video vào website. Bản gốc ở Windows.');
    }
}
catch (e) {
    renderStatus = e.message;
    ledger.set('render-next-at', Date.now() + 60000);
    if (renderActive)
        await bridge.request('/api/worker/jobs/' + renderActive.job.id + '/failure', 'POST', { lease: renderActive.lease, message: e.message, notSent: false }).catch(() => { });
    console.log('Dựng video: ' + e.message);
}
finally {
    rendering = false;
} }
async function tick() {
    if (syncing)
        return;
    syncing = true;
    try {
        const hv = hub.view(), accounts = hv.accounts.map(a => ({ id: a.id, status: a.online ? (a.blocked ? 'quota' : hv.runs.some(r => r.accountId === a.id && !['confirmed', 'expired'].includes(r.status)) ? 'working' : a.ready ? 'ready' : 'attention') : 'offline', message: hv.runs.filter(r => r.accountId === a.id).at(-1)?.message || '' }));
        const r = await bridge.request('/api/worker/heartbeat', 'POST', { version: '2.1.0', capabilities, renderStatus, posStatus: pos.view(), accounts, activeJobIds: [...hv.runs.filter(x => !['confirmed', 'expired'].includes(x.status)).map(x => x.jobId), ...(renderActive ? [renderActive.job.id] : [])] });
        bridge.setAccounts(r.accounts);
        hub.reconcile(r.accounts);
        await bridge.sync();
        if (r.settings.teamEnabled && !hub.view().enabled)
            await hub.enabled(true, true);
        if (!r.settings.teamEnabled && hub.view().enabled)
            await hub.enabled(false);
        await hub.tick();
        if (r.settings.teamEnabled) {
            const all = hub.view().accounts, maps = ledger.get('profiles') || {}, attempted = ledger.get('profile-reopen') || {}, waiting = bridge.view().server.jobs.filter(j => j.status === 'waiting');
            for (const j of waiting) {
                if (all.some(a => a.online && !a.blocked && a.roles.includes(j.role) && a.id !== j.forbiddenAccount))
                    continue;
                const candidate = all.find(a => !a.online && !a.blocked && a.extensionId && maps[a.id] && a.roles.includes(j.role) && a.id !== j.forbiddenAccount && Date.now() - (attempted[a.id] || 0) > 300000);
                if (candidate) {
                    attempted[candidate.id] = Date.now();
                    ledger.set('profile-reopen', attempted);
                    try {
                        await openAccount(candidate, crypto.randomBytes(16).toString('hex'), true);
                    }
                    catch (e) {
                        console.log('Khôi phục Chrome: ' + e.message);
                    }
                    break;
                }
            }
        }
        for (const c of r.commands) {
            let result = { ok: false, message: 'Lệnh chưa có cơ chế thực thi.' };
            try {
                const a = hub.view().accounts.find(a => a.id === c.accountId);
                if (!a)
                    throw Error('Không có hồ sơ.');
                if (c.operation === 'open-login')
                    result = await openAccount(a, c.id);
                else if (c.operation === 'check-session')
                    result = { ok: true, message: a.online ? (a.ready ? 'Tiện ích đã báo ô nhập sẵn sàng.' : 'Tiện ích có kết nối nhưng ô nhập chưa sẵn sàng.') : 'Chưa có heartbeat tiện ích trong hồ sơ này.' };
                else if (c.operation === 'hide-window')
                    result = require('./window-control.cjs').hideAccount(ledger, a.id);
                else if (c.operation === 'resume')
                    result = { ok: true, message: 'Đã kiểm tra lại hàng đợi; giữ nguyên lượt đã gửi.' };
                if (result.waiting) {
                    const pending = ledger.get('open-commands') || {};
                    pending[c.id] = { accountId: a.id, expiresAt: c.expiresAt };
                    ledger.set('open-commands', pending);
                    continue;
                }
            }
            catch (e) {
                result = { ok: false, message: e.message };
            }
            await bridge.request('/api/worker/commands/' + c.id, 'POST', result);
        }
        const opening = ledger.get('open-commands') || {};
        for (const [cid, c] of Object.entries(opening)) {
            if (hub.loginStatus(c.accountId, cid) === 'opened') {
                await bridge.request('/api/worker/commands/' + cid, 'POST', { ok: true, message: 'Tiện ích đã mở đúng tab đã ghép.' });
                delete opening[cid];
            }
            else if (c.expiresAt < Date.now()) {
                await bridge.request('/api/worker/commands/' + cid, 'POST', { ok: false, message: 'Hồ sơ đã ghép đang đóng. Mở đúng Chrome; không tự tạo hồ sơ thay thế.' });
                delete opening[cid];
            }
        }
        ledger.set('open-commands', opening);
    }
    catch (e) {
        console.log('Kết nối: ' + String(e.message).slice(0, 250));
    }
    finally {
        syncing = false;
    }
    renderTick().catch(() => { });
}
server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? 'KBL mới đã chạy ở cổng 39878. Không mở thêm bản thứ hai.' : e.message); process.exitCode = 1; });
server.listen(PORT, '127.0.0.1', () => { console.log('KBL Windows 2.1 · ' + config.serverUrl); console.log('Thiết lập: http://127.0.0.1:' + PORT); console.log('Không dùng dữ liệu/phiên công việc của bộ cũ. Đăng nhập AI vẫn nằm trong Chrome.'); const pre = require('./render.cjs').preflight(config); capabilities = pre.ready ? ['browser', 'render', 'pos-readonly'] : ['browser', 'pos-readonly']; renderStatus = pre.ready ? 'FFmpeg và Node Edge TTS đã phát hiện; dịch vụ giọng đọc thật chưa được xác minh.' : 'Chưa đủ FFmpeg/ffprobe/node-edge-tts; chưa nhận việc dựng video.'; tick(); setInterval(tick, 15000); const posTick = () => { pos.syncLocalSnapshot(); pos.flush().catch(() => {}); pos.syncPhotos().catch(() => {}); }; posTick(); setInterval(posTick, 15000); });
