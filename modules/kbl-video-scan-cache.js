'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSION = 1;
const MAX_AGE_MS = 21 * 86400000;

async function keys(filePath, catalog, models) {
  const video = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) video.update(chunk);
  const videoHash = video.digest('hex');
  return models.map(model => crypto.createHash('sha256')
    .update(JSON.stringify({version: VERSION, catalog, model, videoHash})).digest('hex'));
}

async function key(filePath, catalog, model) {
  return (await keys(filePath, catalog, [model]))[0];
}

function entries(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (raw.length > 2500000) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch (_) { return []; }
}

function valid(row, now) {
  return row && typeof row.key === 'string' && /^[a-f0-9]{64}$/.test(row.key)
    && typeof row.at === 'number' && row.at <= now && now - row.at < MAX_AGE_MS
    && row.data && Array.isArray(row.data.cardPlan) && Array.isArray(row.data.cautions);
}

function get(filePath, digest) {
  const now = Date.now();
  return entries(filePath).find(row => valid(row, now) && row.key === digest) || null;
}

function put(filePath, digest, data, model) {
  if (!valid({key: digest, at: Date.now(), data}, Date.now())) return false;
  const now = Date.now();
  const next = [{key: digest, at: now, model, data}, ...entries(filePath).filter(row => valid(row, now) && row.key !== digest)].slice(0, 12);
  const temp = filePath + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  try {
    fs.writeFileSync(temp, JSON.stringify({version: VERSION, entries: next}), {mode: 0o600});
    fs.renameSync(temp, filePath);
    return true;
  } finally { try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch (_) {} }
}

module.exports = {key, keys, get, put};
