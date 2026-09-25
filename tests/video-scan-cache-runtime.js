'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cache = require('../modules/kbl-video-scan-cache');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kbl-scan-'));
  try {
    const video = path.join(dir, 'sample.mp4');
    const db = path.join(dir, 'cache.json');
    fs.writeFileSync(video, Buffer.from('video A'));
    const catalog = [{sku:'KBL-1',priceVnd:1000000}];
    const digest = await cache.key(video, catalog, 'gemini-2.5-flash');
    const result = {cardPlan:[{sku:'KBL-1',startSeconds:2,endSeconds:5}],cautions:[]};
    assert.strictEqual(cache.get(db, digest), null);
    assert.strictEqual(cache.put(db, digest, result, 'gemini-2.5-flash'), true);
    assert.deepStrictEqual(cache.get(db, digest).data, result);
    assert.notStrictEqual(digest, await cache.key(video, [{sku:'KBL-1',priceVnd:1100000}], 'gemini-2.5-flash'));
    fs.writeFileSync(video, Buffer.from('video B'));
    assert.notStrictEqual(digest, await cache.key(video, catalog, 'gemini-2.5-flash'));
    assert.notStrictEqual(digest, await cache.key(video, catalog, 'gemini-2.5-flash-lite'));
    const stored = JSON.parse(fs.readFileSync(db, 'utf8'));
    stored.entries[0].at = Date.now() - 22 * 86400000;
    fs.writeFileSync(db, JSON.stringify(stored));
    assert.strictEqual(cache.get(db, digest), null);
    console.log('video scan cache: verified reuse and video/catalog/model/age invalidation');
  } finally { fs.rmSync(dir, {recursive:true,force:true}); }
})().catch(error => { console.error(error); process.exitCode=1; });
