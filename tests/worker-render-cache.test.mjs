import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import crypto from 'node:crypto';
const require = createRequire(import.meta.url), voice = require('../windows/runtime/kbl-bulletin-voice.js'), renderer = require('../windows/render.cjs');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
test('actual FFmpeg fixture render validates portrait/audio, reuses matching cache and retains changed-input originals', { timeout: 90000 }, async t => {
    if (cp.spawnSync('ffmpeg', ['-version']).status !== 0 || cp.spawnSync('ffprobe', ['-version']).status !== 0) return t.skip('FFmpeg fixture tools unavailable');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kbl-render-cache-'));
    const run = args => { const r = cp.spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8', timeout: 20000 }); assert.equal(r.status, 0, r.stderr); };
    const originalAvailable = voice.available, originalPrepare = voice.prepare;
    try {
        const scenes = [];
        for (const color of ['red', 'blue']) { const file = path.join(dir, color + '.png'); run(['-f', 'lavfi', '-i', `color=c=${color}:s=64x64`, '-frames:v', '1', '-threads', '1', file]); const bytes = fs.readFileSync(file); scenes.push({ bytes, id: hash(bytes) }); }
        const audio = path.join(dir, 'fixture-synthetic.mp3');
        run(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=11', '-c:a', 'libmp3lame', audio]);
        // Synthetic speech fixture only. This verifies the real FFmpeg path,
        // never availability or quality of the live Hoai My TTS service.
        voice.available = () => ({ ready: true });
        voice.prepare = async plan => ({ file: audio, duration: 12, timingMode: 'word-boundaries', voiceProfile: 'synthetic-fixture-only', timings: plan.text.split(' ').map((text, i) => ({ text, start: i, end: i + 0.8 })) });
        const uploads = [];
        const bridge = { async request(route, method, bytes) {
            if (method === 'GET') { const id = route.split('/assets/')[1].split('?')[0]; return { bytes: scenes.find(s => s.id === id).bytes, mime: 'image/png' }; }
            uploads.push({ route, bytes: Buffer.from(bytes) }); return { assetId: hash(bytes) };
        } };
        const job = { id: 'render-fixture', storyId: 'fixture-story', context: { outputs: { image: { rows: scenes.map(s => ({ assetId: s.id, caption: 'Fixture only' })) }, write: { script: 'Fixture narration one with timed words' } } } };
        const render = () => renderer.render({ job, lease: 'fixture-only', bridge, config: { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' }, workDir: path.join(dir, 'work') });
        const first = await render();
        assert.equal(first.width, 1080); assert.equal(first.height, 1920);
        const folders = fs.readdirSync(path.join(dir, 'work', job.storyId)); assert.equal(folders.length, 1);
        const original = path.join(dir, 'work', job.storyId, folders[0], 'video.mp4'), originalTime = fs.statSync(original).mtimeMs, originalHash = hash(fs.readFileSync(original));
        const repeat = await render(); assert.equal(repeat.videoId, first.videoId); assert.equal(fs.statSync(original).mtimeMs, originalTime);
        job.context.outputs.write.script = 'Fixture revised narration with different words';
        await render(); assert.equal(fs.readdirSync(path.join(dir, 'work', job.storyId)).length, 2);
        assert.equal(hash(fs.readFileSync(original)), originalHash);
        job.context.outputs.write.script = 'Fixture narration one with timed words'; fs.appendFileSync(original, Buffer.from('fixture corruption'));
        await assert.rejects(render(), /cache.*hash/);
        assert.ok(fs.existsSync(original)); assert.equal(uploads.length, 9);
    } finally { voice.available = originalAvailable; voice.prepare = originalPrepare; fs.rmSync(dir, { recursive: true, force: true }); }
});
