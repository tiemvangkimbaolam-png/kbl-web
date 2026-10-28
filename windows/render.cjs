'use strict';
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const voice = require('./runtime/kbl-bulletin-voice.js'), captions = require('./runtime/kbl-bulletin-captions.js');
function run(exe, args, cwd) { return new Promise((resolve, reject) => { const c = cp.spawn(exe, args, { cwd, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] }); let err = ''; const timer = setTimeout(() => { c.kill(); reject(Error('Tiến trình dựng quá 30 phút; giữ các file đã hoàn thành.')); }, 30 * 60000); c.stderr.on('data', x => { err = (err + x).slice(-6000); }); c.on('error', e => { clearTimeout(timer); reject(e); }); c.on('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(Error(exe + ' kết thúc lỗi ' + code + ': ' + err.slice(-700))); }); }); }
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
function preflight(config) { const t = toolsFor(config); return { ...t, ready: probe(t.ffmpeg, ['-version']) && probe(t.ffprobe, ['-version']) && voice.available({ ttsRuntimeDir: t.runtimeDir }).ready }; }
function srt(timings) { const time = t => { const n = Math.round(t * 1000); return String(Math.floor(n / 3600000)).padStart(2, '0') + ':' + String(Math.floor(n / 60000) % 60).padStart(2, '0') + ':' + String(Math.floor(n / 1000) % 60).padStart(2, '0') + ',' + String(n % 1000).padStart(3, '0'); }; const rows = []; for (let i = 0; i < timings.length; i += 8) {
    const p = timings.slice(i, i + 8);
    rows.push(`${rows.length + 1}\n${time(p[0].start)} --> ${time(p.at(-1).end)}\n${p.map(w => w.text).join(' ')}\n`);
} return rows.join('\n'); }
async function render({ job, lease, bridge, config, workDir }) {
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
    const inputHash = crypto.createHash('sha256').update(JSON.stringify({ version: 4, kind:job.context.story?.kind, company:job.context.company,products:job.context.story?.productSnapshots||null,images: images.map(x => x.assetId), script: write.script, voice: voice.VOICE, rate: captions.pace(write.script), width: 1080, height: 1920, fps: 24, font: process.platform === 'win32' ? 'Arial' : 'DejaVu Sans' })).digest('hex');
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
    fs.writeFileSync(path.join(dir, 'captions.ass'), ass, 'utf8');
    const output = path.join(dir, 'video.mp4'), building = path.join(dir, 'video.building.mp4'), receiptFile = path.join(dir, 'render-receipt.json'), half = duration / images.length;
    const scenes=images.map((_,i)=>`[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:white,setsar=1,fps=24[v${i}]`).join(';'),filter=scenes+';'+images.map((_,i)=>`[v${i}]`).join('')+`concat=n=${images.length}:v=1:a=0,subtitles=captions.ass[v]`;
    const fileHash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if (fs.existsSync(output)) {
        let receipt;
        try { receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8')); } catch { }
        if (receipt?.inputHash !== inputHash || receipt.videoHash !== fileHash(output)) throw Error('Video cache chưa có biên nhận đúng hash. Giữ file gốc để kiểm tra; chưa tự ghi đè.');
    }
    if (!fs.existsSync(output))
        await run(tools.ffmpeg, ['-y', '-nostdin', ...sceneFiles.flatMap(file=>['-loop','1','-t',String(half),'-i',file]), '-i', 'voice.mp3', '-filter_complex', filter, '-map', '[v]', '-map', images.length+':a', '-c:v', 'libx264', '-threads', '2', '-preset', 'veryfast', '-crf', '25', '-maxrate', '1200k', '-bufsize', '2400k', '-c:a', 'aac', '-b:a', '128k', '-pix_fmt', 'yuv420p', '-af', 'apad', '-t', String(duration), '-movflags', '+faststart', 'video.building.mp4'], dir);
    const raw = cp.spawnSync(tools.ffprobe, ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', fs.existsSync(output) ? output : building], { encoding: 'utf8', windowsHide: true, timeout: 15000 }), meta = JSON.parse(raw.stdout), video = meta.streams.find(s => s.codec_type === 'video');
    if (video?.width !== 1080 || video?.height !== 1920 || !meta.streams.some(s => s.codec_type === 'audio') || Math.abs(Number(meta.format.duration) - duration) > 1)
        throw Error('Video chưa khớp hình, giọng và thời lượng.');
    if (!fs.existsSync(output))
        fs.renameSync(building, output);
    fs.writeFileSync(receiptFile, JSON.stringify({ inputHash, videoHash: fileHash(output), duration: Number(meta.format.duration), width: 1080, height: 1920 }), { mode: 0o600 });
    const upload = async (file, mime, purpose) => { const data = fs.readFileSync(file); if (data.length > 20 * 1024 * 1024)
        throw Error('Video vượt 20MB; giữ bản gốc ở Windows.'); const r = await bridge.request('/api/worker/assets?storyId=' + storyId + '&purpose=' + purpose, 'POST', data, { 'Content-Type': mime, 'x-kbl-job-id': job.id, 'x-kbl-job-lease': lease }); return r.assetId; };
    const posterIds=[];for(const file of posterFiles)posterIds.push(await upload(file,'image/jpeg','social-card'));
    return { ...(posterIds.length?{posterIds}:job.context.story?.kind==='gold'?{posterIds:[images[0].assetId]}:{}),videoId: await upload(output, 'video/mp4', 'video-temp'), audioId: await upload(path.join(dir, 'voice.mp3'), 'audio/mpeg', 'audio'), captionsId: await upload(path.join(dir, 'captions.srt'), 'application/x-subrip', 'captions'), duration: Number(meta.format.duration), width: 1080, height: 1920, voiceProfile: speech.voiceProfile, timingMode: speech.timingMode };
}
module.exports = { render, preflight, toolsFor, srt };
