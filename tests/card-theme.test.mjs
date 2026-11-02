import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
const require = createRequire(import.meta.url), {card, THEME_VERSION} = require('../windows/cards.cjs');
const prices = [
    {code:'610',label:'Vàng 610',buy:7420001,sell:8020003,unit:'đồng/chỉ'},
    {code:'9999',label:'Vàng 999.9',buy:12599001,sell:12899003,unit:'đồng/chỉ'},
    {code:'980',label:'Vàng 980',buy:12110001,sell:12710003,unit:'đồng/chỉ'}
];
test('gold cards freeze exact snapshot through asynchronous rendering, order gold codes and keep the same pixels after live-price changes', {timeout:60000}, async t => {
    if(cp.spawnSync('ffmpeg',['-version']).status!==0) return t.skip('FFmpeg unavailable');
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kbl-card-theme-'));
    try {
        const input=structuredClone(prices), original=structuredClone(input), at=Date.parse('2026-11-02T01:00:00Z');
        const task=card({dir,ffmpeg:'ffmpeg',prices:input,at});
        input[0].sell=99999999;
        const file=await task, bytes=fs.readFileSync(file), meta=JSON.parse(fs.readFileSync(path.join(dir,'card-0-layout.json')));
        assert.equal(meta.themeVersion,THEME_VERSION);
        assert.deepEqual(meta.prices.map(r=>r.code),['9999','980','610']);
        assert.equal(meta.prices[2].sell,8020003);
        assert.equal(meta.snapshotAt,at);
        assert.equal(fs.readFileSync(path.join(dir,'card-0-sell-0.txt'),'utf8'),'12.899.003');
        await card({dir,ffmpeg:'ffmpeg',prices:original,at});
        assert.deepEqual(fs.readFileSync(file),bytes);
        const probe=JSON.parse(cp.spawnSync('ffprobe',['-v','quiet','-show_streams','-of','json',file],{encoding:'utf8'}).stdout);
        assert.equal(probe.streams[0].width,1080);assert.equal(probe.streams[0].height,1350);
    } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('card renderer rejects missing, duplicate and wrong-unit gold data before creating an output', async () => {
    const options={dir:os.tmpdir(),ffmpeg:'never-execute',prices,at:Date.parse('2026-11-02T01:00:00Z')};
    await assert.rejects(card({...options,prices:prices.slice(1)}),/9999/);
    await assert.rejects(card({...options,prices:[...prices,prices[0]]}),/9999/);
    await assert.rejects(card({...options,prices:prices.map(p=>({...p,unit:'đồng/lượng'}))}),/đơn vị/);
    await assert.rejects(card({...options,prices:prices.map(p=>({...p,buy:NaN}))}),/hợp lệ/);
    await assert.rejects(card({...options,at:undefined}),/thời điểm/);
});
