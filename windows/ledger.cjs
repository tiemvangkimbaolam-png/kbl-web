'use strict';
const fs = require('node:fs'), path = require('node:path');
const caches = new Map();
function open(dir) { dir = path.resolve(dir); if (caches.has(dir))
    return caches.get(dir); fs.mkdirSync(dir, { recursive: true }); const { DatabaseSync } = require('node:sqlite'), db = new DatabaseSync(path.join(dir, 'kbl-ledger.sqlite')); db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY,value TEXT NOT NULL);'); const ledger = { db, get(key) { const r = db.prepare('SELECT value FROM kv WHERE key=?').get(key); return r ? JSON.parse(r.value) : null; }, set(key, value) { db.prepare('INSERT INTO kv VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value)); } }; caches.set(dir, ledger); return ledger; }
module.exports = { open };
