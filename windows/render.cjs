'use strict';
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const voice = require('./runtime/kbl-bulletin-voice.js'), captions = require('./runtime/kbl-bulletin-captions.js');
function run(exe, args, cwd, minutes = 30) { return new Promise((resolve, reject) => { const c = cp.spawn(exe, args, { cwd, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] }); let err = ''; const timer = setTimeout(() => { c.kill(); reject(Error('Tiến trình dựng quá ' + minutes + ' phút; giữ các file đã hoàn thành.')); }, minutes * 60000); c.stderr.on('data', x => { err = (err + x).slice(-6000); }); c.on('error', e => { clearTimeout(timer); reject(e); }); c.on('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(Error(exe + ' kết thúc lỗi ' + code + ': ' + err.slice(-700))); }); }); }
function probe(exe, args) { const r = cp.spawnSync(exe, args, { encoding: 'utf8', windowsHide: true, timeout: 10000, shell: false }); return r.status === 0; }
function toolsFor(config) {
    const base = config.existingWorkerDir || path.resolve(__dirname, '..');
    let inherited = {};
    try {
        if (fs.existsSync(path.join(base, 'kbl-video-worker.js')))
            inherited = JSON.parse(fs.readFileSync(path.join(base, 'config.json'), 'utf8'));
    }
    catch { }
    const resolveTool = (value, fallback) => value ? (path.isAbsolute(value) || !/[\\/]/.test(value) ? value : path.resolve(base, value)) : fallback;
    let ffmpeg = resolveTool(config.ffmpeg || inherited.ffmpegPath, 'ffmpeg'), ffprobe = resolveTool(config.ffprobe || inherited.ffprobePath, 'ffprobe');
    const runtimeDir = config.ttsRuntimeDir || (fs.existsSync(path.join(base, '.kbl-render-runtime')) ? path.join(base, '.kbl-render-runtime') : path.join(__dirname, '.kbl-render-runtime'));
    if (ffmpeg === 'ffmpeg') {
        try {
            ffmpeg = require(require.resolve('ffmpeg-static', { paths: [runtimeDir] }));
        }
        catch { }
    }
    if (ffprobe === 'ffprobe') {
        try {
            ffprobe = require(require.resolve('ffprobe-static', { paths: [runtimeDir] })).path;
        }
        catch { }
    }
    return { ffmpeg, ffprobe, runtimeDir };
}
// Remotion is used for the bright composition whenever an installed project is
// found. The composition source ships in windows/remotion and is copied into
// that project before each render, so no second node_modules tree is needed.
function chromeFor(config) {
    const candidates = [config.chromePath, process.env.KBL_CHROME,
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe')];
    return candidates.find(file => typeof file === 'string' && path.isAbsolute(file) && fs.existsSync(file)) || null;
}
function remotionFor(config) {
    const base = config.existingWorkerDir || path.resolve(__dirname, '..');
    const candidates = [config.remotionDir, process.env.KBL_REMOTION_DIR, path.join(__dirname, 'remotion'), path.join(base, 'remotion'), path.join(path.dirname(base), 'remotion-sample')];
    for (const dir of candidates) {
        if (!dir || typeof dir !== 'string') continue;
        const full = path.isAbsolute(dir) ? dir : path.resolve(__dirname, dir);
        const cli = path.join(full, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
        if (fs.existsSync(cli) && fs.existsSync(path.join(__dirname, 'remotion', 'src', 'KblVideo.tsx'))) return { dir: full, cli };
    }
    return null;
}
function preflight(config) {
    const t = toolsFor(config);
    return { ...t, chrome: chromeFor(config), remotion: remotionFor(config), ready: probe(t.ffmpeg, ['-version']) && probe(t.ffprobe, ['-version']) && voice.available({ ttsRuntimeDir: t.runtimeDir }).ready };
}
const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
function shorten(s, max) { const v = clean(s); if (v.length <= max) return v; const part = v.slice(0, max), at = Math.max(part.lastIndexOf(' '), part.lastIndexOf(',')); return (at > max * 0.55 ? part.slice(0, at) : part).replace(/[,:;.\s]+$/, '') + '…'; }
const money = n => Number(n).toLocaleString('vi-VN');
const KIND_COPY = {
    gold: { kicker: 'GIÁ VÀNG · HÔM NAY', label: 'cập nhật trong ngày', tags: ['VÀNG', 'GIÁ HÔM NAY'], note: 'Giá tham khảo tại thời điểm đăng; xác nhận tại tiệm trước khi giao dịch.' },
    product: { kicker: 'TRANG SỨC · SẢN PHẨM', label: 'sản phẩm đang trưng bày', tags: ['TRANG SỨC', 'SẢN PHẨM'], note: 'Hình ảnh và giá thuộc sản phẩm thật đang trưng bày tại cửa hàng.' },
    outlook: { kicker: 'NHẬN ĐỊNH · GIÁ VÀNG', label: 'kịch bản trong ngày', tags: ['NHẬN ĐỊNH', 'XU HƯỚNG'], note: 'Nhận định tham khảo tại thời điểm tạo nội dung, không phải khuyến nghị đầu tư.' },
    news: { kicker: 'TIN VÀNG · THẾ GIỚI', label: 'tin vàng hôm nay', tags: ['TIN VÀNG', 'THẾ GIỚI'], note: 'Thông tin tham khảo tại thời điểm tạo nội dung, không phải khuyến nghị đầu tư.' }
};
function titleParts(headline, label, company) {
    const h = clean(headline) || clean(company) || 'KIM BẢO LÂM';
    const split = h.split(/\s*[·|–—]\s*/).filter(Boolean);
    if (split.length >= 2) return [shorten(split[0], 30), shorten(split.slice(1).join(' · '), 30)];
    if (h.length <= 22) return [shorten(h, 30), label];
    const words = h.split(' '), half = Math.ceil(words.length / 2);
    return [shorten(words.slice(0, half).join(' '), 30), shorten(words.slice(half).join(' '), 30)];
}
function rowsFromText(text) {
    const parts = clean(text).split(/(?:[.!?;]\s+|\n+)/).map(clean).filter(s => s.length >= 12);
    const rows = [];
    for (const part of parts) {
        if (rows.length >= 3) break;
        const at = part.search(/[,:–—]/), label = clean(at > 18 && at < 74 && part.length - at > 12 ? part.slice(0, at) : part).replace(/[,:–—.!?;]+$/, '');
        if (!label || rows.some(row => row.label === label)) continue;
        const note = clean(at > 18 && at < 74 && part.length - at > 12 ? part.slice(at + 1) : '').replace(/[,:–—.!?;]+$/, '');
        rows.push({ label: shorten(label, 64), note: shorten(note, 92) });
    }
    return rows;
}
function pagesFrom(timings) {
    const pages = []; let page = [], chars = 0;
    for (const w of timings) {
        const text = clean(w.text); if (!text) continue;
        if (page.length && (chars + text.length > 66 || page.length >= 9 || /[.!?…]$/.test(page.at(-1).text))) { pages.push(page); page = []; chars = 0; }
        page.push({ text, s: +Number(w.start).toFixed(2), e: +Number(w.end).toFixed(2) }); chars += text.length + 1;
    }
    if (page.length) pages.push(page);
    return pages.map(p => ({ s: p[0].s, e: p.at(-1).e, words: p }));
}
function cuePoints(pages, from, to) {
    const out = [];
    for (let i = 0; i < 3; i++) {
        const target = from + (to - from) * (0.28 + 0.25 * i);
        const hit = pages.find(p => p.s >= target - 0.4 && p.s <= to - 0.8)?.s;
        out.push(+(hit ?? Math.min(to - 1.5, Math.max(from + 1, target))).toFixed(2));
    }
    return out.filter((v, i, list) => i === 0 || v > list[i - 1]);
}
function remotionProps({ story, company, domain, write, timings, imageFiles, duration }) {
    const kind = KIND_COPY[story?.kind] || KIND_COPY.news, rows = [];
    if (story?.kind === 'gold' && Array.isArray(story.priceSnapshot?.rows)) {
        for (const row of story.priceSnapshot.rows.slice(0, 3).sort((a, b) => Number(b.sell) - Number(a.sell)))
            rows.push({ label: shorten(row.label || ('Vàng ' + row.code), 34), note: 'Mua ' + money(row.buy) + ' · Bán ' + money(row.sell) + ' đ/chỉ' });
    } else if (Array.isArray(story?.productSnapshots)) {
        for (const p of story.productSnapshots.slice(0, 3))
            rows.push({ label: shorten(p.name, 32), note: shorten([p.purity, p.weight, Number.isFinite(Number(p.price)) ? money(p.price) + ' đ' : ''].filter(Boolean).join(' · '), 60) });
    }
    if (rows.length < 2) for (const row of rowsFromText(write?.summary || write?.script || '')) { if (rows.length >= 3) break; if (!rows.some(r => r.label === row.label)) rows.push(row); }
    const [title1, title2] = titleParts(write?.headline || story?.title, kind.label, company);
    const totalSeconds = +Number(duration).toFixed(2), scene1End = +Math.min(8, Math.max(6, totalSeconds * 0.25)).toFixed(2);
    const scene2From = +(scene1End - 0.5).toFixed(2);
    const scene3From = +Math.max(scene2From + 8, totalSeconds - 6).toFixed(2);
    const pages = pagesFrom(timings), at = Number(story?.editionAt) || Date.now();
    const stamps = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(at));
    const stamp = type => stamps.find(part => part.type === type)?.value || '';
    const day = stamp('day') + '/' + stamp('month'), time = stamp('hour') + ':' + stamp('minute');
    const companyName = clean(company) || 'KIM BẢO LÂM';
    return {
        totalSeconds, kicker: kind.kicker, title1, title2,
        tags: [...kind.tags, shorten(companyName.toUpperCase(), 16)],
        sectionTitle1: 'Ba điểm chính', sectionTitle2: 'trong bản tin',
        rows: rows.slice(0, 3), company: companyName, domain,
        endNote: kind.note, endTags: story?.kind === 'gold' ? [time, day] : [day, companyName.toUpperCase()],
        image1: path.basename(imageFiles[0]), image2: path.basename(imageFiles[1]), audio: 'voice.mp3',
        pages, scenes: { scene1End, scene2From, scene3From },
        cues: cuePoints(pages, scene2From, scene3From)
    };
}
function srt(timings) { const time = t => { const n = Math.round(t * 1000); return String(Math.floor(n / 3600000)).padStart(2, '0') + ':' + String(Math.floor(n / 60000) % 60).padStart(2, '0') + ':' + String(Math.floor(n / 1000) % 60).padStart(2, '0') + ',' + String(n % 1000).padStart(3, '0'); }; const rows = []; for (let i = 0; i < timings.length; i += 8) {
    const p = timings.slice(i, i + 8);
    rows.push(`${rows.length + 1}\n${time(p[0].start)} --> ${time(p.at(-1).end)}\n${p.map(w => w.text).join(' ')}\n`);
} return rows.join('\n'); }
async function render({ job, lease, bridge, config, workDir }) {
    job = structuredClone(job);
    const tools = preflight(config);
    if (!tools.ready)
        throw Error('Chưa tìm thấy FFmpeg/ffprobe và node-edge-tts. Đặt bộ mới trong thư mục worker hiện tại hoặc khai báo existingWorkerDir.');
    const images = job.context.outputs.image?.rows || [], write = job.context.outputs.write;
    if (![2,3].includes(images.length) || !write?.script || write.script.length > 3000)
        throw Error('Cần hai hoặc ba ảnh đã duyệt và lời đọc tối đa 3.000 ký tự.');
    const storyId = job.storyId || job.story_id;
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(storyId || '')) throw Error('Mã hồ sơ dựng không hợp lệ.');
    // Each immutable set of inputs has its own directory. A revised script or
    // image must never reuse the previous video just because storyId matches.
    const snapshotCards = job.context.story?.kind === 'gold' || !!job.context.story?.productSnapshots;
    // Gold/product videos contain the complete approved card. News keeps its
    // existing renderer; no live-price lookup can replace a card mid-render.
    const renderer = !snapshotCards && tools.remotion && tools.chrome && config.renderer !== 'ffmpeg' ? 'remotion' : 'ffmpeg';
    const inputHash = crypto.createHash('sha256').update(JSON.stringify({ version: 5, ...(snapshotCards ? { cardTheme: require('./cards.cjs').THEME_VERSION, captionTheme: 1 } : {}), renderer, kind:job.context.story?.kind, company:job.context.company,products:job.context.story?.productSnapshots||null,images: images.map(x => x.assetId), script: write.script, voice: voice.VOICE, rate: captions.pace(write.script), width: 1080, height: 1920, fps: renderer === 'remotion' ? 30 : 24, font: process.platform === 'win32' ? 'Arial' : 'DejaVu Sans' })).digest('hex');
    const dir = path.join(workDir, storyId, inputHash);
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < images.length; i++) {
        const v = await bridge.request('/api/worker/assets/' + images[i].assetId + '?jobId=' + encodeURIComponent(job.id), 'GET', undefined, { 'x-kbl-job-lease': lease, _binary: true });
        if (crypto.createHash('sha256').update(v.bytes).digest('hex') !== images[i].assetId)
            throw Error('Ảnh sai hash.');
        fs.writeFileSync(path.join(dir, 'scene-' + i + '.png'), v.bytes);
    }
    const productSnapshots=job.context.story?.productSnapshots;const sceneFiles=images.map((_,i)=>'scene-'+i+'.png'),posterFiles=[];
    if(productSnapshots){if(productSnapshots.length!==3||images.length!==3)throw Error('Bộ sản phẩm cần đúng 3 SKU/ảnh.');for(let i=0;i<3;i++){const file=await require('./cards.cjs').card({dir,ffmpeg:tools.ffmpeg,company:job.context.company,product:productSnapshots[i],at:job.context.story.editionAt,source:sceneFiles[i],index:i});sceneFiles[i]=path.basename(file);posterFiles.push(file);}}
    if(!productSnapshots&&job.context.story?.kind!=='gold'){for(let i=0;i<images.length;i++)posterFiles.push(await require('./cards.cjs').newsPoster({dir,ffmpeg:tools.ffmpeg,source:sceneFiles[i],index:i,illustration:job.context.story?.kind!=='product'}));}
    const speech = await voice.prepare({ version: 1, text: write.script, rate: captions.pace(write.script), animatedText: true }, path.join(dir, 'speech'), { ttsRuntimeDir: tools.runtimeDir, voiceCacheDir: path.join(workDir, 'voice-cache'), ffprobePath: tools.ffprobe, requireBoundaryTimings: true });
    if (speech.timingMode !== 'word-boundaries')
        throw Error('Chưa có mốc chữ khớp giọng; giữ việc để kiểm tra.');
    const duration = speech.duration;
    if (!(duration >= 10 && duration <= 150))
        throw Error('Giọng đọc phải dài 10–150 giây.');
    fs.copyFileSync(speech.file, path.join(dir, 'voice.mp3'));
    fs.writeFileSync(path.join(dir, 'captions.srt'), srt(speech.timings), 'utf8');
    let ass = captions.ass(speech.timings, duration, false);
    if (process.platform === 'win32')
        ass = ass.replace(/DejaVu Sans/g, 'Arial');
    if (snapshotCards) ass = ass.replace(/^Style: News,.*$/m, 'Style: News,Arial,42,&H002D4D9B,&H00432C10,&H00FBFDFF,&HFFFBFDFF,1,0,0,0,100,100,0,0,1,0,0,2,80,80,142,1');
    fs.writeFileSync(path.join(dir, 'captions.ass'), ass, 'utf8');
    const output = path.join(dir, 'video.mp4'), receiptFile = path.join(dir, 'render-receipt.json'), half = duration / images.length;
    const building = path.join(dir, renderer === 'remotion' ? 'video.remotion.mp4' : 'video.building.mp4');
    const fileHash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if (fs.existsSync(output)) {
        let receipt;
        try { receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8')); } catch { }
        if (receipt?.inputHash !== inputHash || receipt.videoHash !== fileHash(output)) throw Error('Video cache chưa có biên nhận đúng hash. Giữ file gốc để kiểm tra; chưa tự ghi đè.');
    }
    if (!fs.existsSync(output)) {
        try { fs.rmSync(building, { force: true }); } catch { }
        if (renderer === 'remotion') {
            const propsFile = path.join(dir, 'remotion-props.json');
            let domain = '';
            try { domain = new URL(config.serverUrl).host; } catch { }
            fs.writeFileSync(propsFile, JSON.stringify(remotionProps({ story: job.context.story, company: job.context.company?.name || job.context.company, domain, write, timings: speech.timings, imageFiles: sceneFiles, duration })), 'utf8');
            const sourceDir = path.join(tools.remotion.dir, '.kbl-render', 'src');
            fs.mkdirSync(sourceDir, { recursive: true });
            for (const file of ['index.ts', 'Root.tsx', 'KblVideo.tsx'])
                fs.copyFileSync(path.join(__dirname, 'remotion', 'src', file), path.join(sourceDir, file));
            const maxRate = Math.max(650000, Math.min(2400000, Math.round(159000000 / duration - 128000))), bitrate = Math.round(maxRate / 1000) + 'k';
            await run(process.execPath, [tools.remotion.cli, 'render', path.join(sourceDir, 'index.ts'), 'KBLVideo', building, '--props=' + propsFile, '--public-dir=' + dir, '--codec=h264', '--video-bitrate=' + bitrate, '--audio-bitrate=128k', '--concurrency=2', '--browser-executable=' + tools.chrome, '--log=error'], tools.remotion.dir, 45);
        } else {
            const filter = portraitFilter(images.length, snapshotCards) + ',subtitles=captions.ass[v]';
            await run(tools.ffmpeg, ['-y', '-nostdin', ...sceneFiles.flatMap(file=>['-loop','1','-t',String(half),'-i',file]), '-i', 'voice.mp3', '-filter_complex', filter, '-map', '[v]', '-map', images.length+':a', '-c:v', 'libx264', '-threads', '2', '-preset', 'veryfast', '-crf', '25', '-maxrate', '1200k', '-bufsize', '2400k', '-c:a', 'aac', '-b:a', '128k', '-pix_fmt', 'yuv420p', '-af', 'apad', '-t', String(duration), '-movflags', '+faststart', 'video.building.mp4'], dir);
        }
    }
    if (!fs.existsSync(output) && !fs.existsSync(building)) throw Error('Bộ dựng không tạo được file video.');
    const raw = cp.spawnSync(tools.ffprobe, ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', fs.existsSync(output) ? output : building], { encoding: 'utf8', windowsHide: true, timeout: 15000 }), meta = JSON.parse(raw.stdout), video = meta.streams.find(s => s.codec_type === 'video');
    if (video?.width !== 1080 || video?.height !== 1920 || !meta.streams.some(s => s.codec_type === 'audio') || Math.abs(Number(meta.format.duration) - duration) > 1)
        throw Error('Video chưa khớp hình, giọng và thời lượng.');
    if (!fs.existsSync(output))
        fs.renameSync(building, output);
    fs.writeFileSync(receiptFile, JSON.stringify({ inputHash, renderer, videoHash: fileHash(output), duration: Number(meta.format.duration), width: 1080, height: 1920 }), { mode: 0o600 });
    const upload = async (file, mime, purpose) => { const data = fs.readFileSync(file); if (data.length > 20 * 1024 * 1024)
        throw Error('Video vượt 20MB; giữ bản gốc ở Windows.'); const r = await bridge.request('/api/worker/assets?storyId=' + storyId + '&purpose=' + purpose, 'POST', data, { 'Content-Type': mime, 'x-kbl-job-id': job.id, 'x-kbl-job-lease': lease }); return r.assetId; };
    const posterIds=[];for(const file of posterFiles)posterIds.push(await upload(file,'image/jpeg','social-card'));
    return { ...(posterIds.length?{posterIds}:job.context.story?.kind==='gold'?{posterIds:[images[0].assetId]}:{}),videoId: await upload(output, 'video/mp4', 'video-temp'), audioId: await upload(path.join(dir, 'voice.mp3'), 'audio/mpeg', 'audio'), captionsId: await upload(path.join(dir, 'captions.srt'), 'application/x-subrip', 'captions'), duration: Number(meta.format.duration), width: 1080, height: 1920, voiceProfile: speech.voiceProfile, timingMode: speech.timingMode };
}
function portraitFilter(count, snapshotCards = true) {
    const background = snapshotCards ? require('./cards.cjs').THEME.paper : 'white';
    return Array.from({ length: count }, (_, i) => `[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:${background},setsar=1,fps=24[v${i}]`).join(';') + ';' + Array.from({ length: count }, (_, i) => `[v${i}]`).join('') + `concat=n=${count}:v=1:a=0`;
}
module.exports = { render, preflight, toolsFor, srt, remotionProps, portraitFilter };
