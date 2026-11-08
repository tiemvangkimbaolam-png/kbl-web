'use strict';
// One uninterrupted utterance for a bulletin. This module never publishes or reads POS.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFile} = require('node:child_process');
const captions = require('./kbl-bulletin-captions');
const VOICE = 'vi-VN-HoaiMyNeural';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const runtimeDir = config => path.resolve(config.ttsRuntimeDir || process.env.KBL_TTS_RUNTIME_DIR || path.join(__dirname, '.kbl-render-runtime'));

function validate(plan) {
  if (plan?.version !== 1 || typeof plan.text !== 'string' || !plan.text.trim() || plan.text.length > 3000) throw Error('Lời đọc bản tin không hợp lệ.');
  const rate = plan.rate ?? 1;
  if (!Number.isFinite(rate) || rate < .9 || rate > 1.12) throw Error('Tốc độ giọng đọc phải từ 0.9 đến 1.12.');
  return rate;
}
function available(config = {}) {
  try { require.resolve('node-edge-tts', {paths: [runtimeDir(config)]}); return {ready: true, voice: VOICE, engine: 'edge-node'}; }
  catch { return {ready: false, message: 'Chưa có thư viện giọng đọc. Chạy CAI_GIONG_BAN_TIN.cmd trong thư mục worker.'}; }
}
function run(bin, args, timeout, signal) {
  return new Promise((resolve, reject) => execFile(bin, args, {
    timeout, signal, maxBuffer: 512 * 1024, windowsHide: true,
  }, (error, stdout, stderr) => error ? reject(Error(path.basename(bin) + ': ' + String(stderr || error.message).slice(-500))) : resolve(stdout)));
}
async function duration(file, config = {}) {
  const result = JSON.parse(await run(config.ffprobePath || 'ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], 15000, config.renderSignal));
  const seconds = Number(result.format?.duration);
  if (!result.streams?.some(stream => stream.codec_type === 'audio') || !Number.isFinite(seconds) || seconds <= 0 || seconds > 149) throw Error('Audio bản tin trống hoặc quá 149 giây.');
  return seconds;
}
async function synth(plan, dir, config = {}) {
  const rate = validate(plan), status = available(config);
  if (!status.ready) throw Error(status.message);
  fs.mkdirSync(dir, {recursive: true});
  const spec = path.join(dir, 'speech-request.json'), file = path.join(dir, 'speech.mp3');
  fs.writeFileSync(spec, JSON.stringify({text: plan.text, rate, runtimeDir: runtimeDir(config)}), {mode: 0o600});
  await run(process.execPath, [__filename, '--edge', spec, file], 90000, config.renderSignal);
  return {file, duration: await duration(file, config), engine: 'edge-node'};
}
async function prepare(plan, dir, config = {}, synthImpl = synth) {
  const rate = validate(plan), kind = ['gold', 'news', 'product'].includes(plan.storyboard?.kind) ? plan.storyboard.kind : 'news';
  const key = hash(JSON.stringify([plan.text, VOICE, rate, 'continuous-v1']));
  const cache = path.join(config.voiceCacheDir||runtimeDir(config), kind + '-voice-cache'), file = path.join(cache, key + '.mp3'), meta = file + '.meta.json';
  let audio;
  try {
    const receipt = JSON.parse(fs.readFileSync(meta, 'utf8')), bytes = fs.readFileSync(file);
    if (receipt.key !== key || receipt.voice !== VOICE || receipt.engine !== 'edge-node' || bytes.length > 3 * 1024 * 1024 || hash(bytes) !== receipt.sha256 || Date.now() - receipt.at > 14 * 86400000) throw Error('Cache giọng đã cũ.');
    audio = {file, duration: await duration(file, config), engine: 'edge-node'};
  } catch {}
  if (!audio) {
    try {
      audio = await synthImpl(plan, dir, config);
      if (audio.engine !== 'edge-node' || !Number.isFinite(audio.duration) || audio.duration <= 0 || audio.duration > 149) throw Error('Giọng chưa đạt QA.');
    } catch (error) {
      if (config.renderSignal?.aborted) throw error;
      const wait = Error(kind.toUpperCase() + '_VOICE_WAIT: ' + error.message);
      wait.retryable = true; throw wait;
    }
    try {
      const bytes = fs.readFileSync(audio.file);
      if (bytes.length > 3 * 1024 * 1024) throw Error('Audio quá lớn.');
      fs.mkdirSync(cache, {recursive: true});
      const tmp = file + '.tmp-' + process.pid;
      fs.writeFileSync(tmp, bytes); fs.renameSync(tmp, file);
      try {
        const markers = fs.readFileSync(audio.file + '.json');
        if (markers.length > 300000) throw Error('Mốc chữ quá lớn.');
        fs.writeFileSync(file + '.json', markers);
      } catch { fs.rmSync(file + '.json', {force: true}); }
      fs.writeFileSync(meta, JSON.stringify({key, voice: VOICE, engine: 'edge-node', sha256: hash(bytes), at: Date.now()}));
      const entries = fs.readdirSync(cache).filter(name => /^[a-f0-9]{64}\.mp3\.meta\.json$/.test(name))
        .map(name => ({name, at: fs.statSync(path.join(cache, name)).mtimeMs})).sort((a, b) => b.at - a.at);
      for (const entry of entries.slice(64)) for (const suffix of ['', '.json', '.meta.json']) fs.rmSync(path.join(cache, entry.name.replace(/\.meta\.json$/, '') + suffix), {force: true});
    } catch {} // A cache write failure must not discard valid speech.
  }
  let timings = captions.read(audio.file, plan.text, audio.duration), timingMode = 'word-boundaries';
  if (!timings.length) { if(config.requireBoundaryTimings)throw Error('VOICE_WAIT: Chưa có mốc phụ đề khớp giọng đọc từ dịch vụ.');timings = captions.estimate(plan.text, 0, audio.duration); timingMode = 'estimated-continuous'; }
  return {...audio, timings, timingMode, voiceProfile: VOICE, narrationHash: hash(JSON.stringify(plan)), duration: Math.max(8, Math.ceil(audio.duration + .7))};
}
async function child(specPath, file) {
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  validate({version: 1, text: spec.text, rate: spec.rate});
  const {EdgeTTS} = require(require.resolve('node-edge-tts', {paths: [spec.runtimeDir]}));
  const tts = new EdgeTTS({voice: VOICE, lang: 'vi-VN', rate: Math.round((spec.rate - 1) * 100) + '%',
    saveSubtitles: true, outputFormat: 'audio-24khz-96kbitrate-mono-mp3', timeout: 60000,
    proxy: process.env.KBL_TTS_PROXY || process.env.HTTPS_PROXY || process.env.https_proxy});
  await tts.ttsPromise(spec.text, file);
}
if (require.main === module) {
  if (process.argv[2] !== '--edge') { console.error('Chỉ chạy bộ đọc từ worker hoặc file kiểm tra.'); process.exitCode = 1; }
  else child(process.argv[3], process.argv[4]).then(() => process.exit(0), error => {
    console.error('Edge TTS chưa tạo được giọng Hoài My: ' + String(error.message || error).replace(/https?:\/\/\S+/g, '[endpoint]').slice(0, 350)); process.exit(1);
  });
}
module.exports = {available, prepare, synth, duration, validate, runtimeDir, VOICE};
