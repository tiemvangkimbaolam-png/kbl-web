'use strict';
// Public catalogue transport only. Original product records/images stay intact.
const crypto = require('crypto');

function create({ getProducts, publicationStatusFor, safeImageSource }) {
  const fields = new Set(['image', 'tryOnImage', 'geminiTryOnImage']);
  const cache = new WeakMap();

  function entryFor(product, field) {
    if (!product || typeof product !== 'object' || !fields.has(field)) return null;
    const source = String(product[field] || '');
    let entries = cache.get(product);
    if (!entries) { entries = new Map(); cache.set(product, entries); }
    const old = entries.get(field);
    if (old && old.source === source && old.id === String(product.id)) return old;
    const safe = safeImageSource(source);
    const entry = { source, id: String(product.id), safe, url: safe };
    if (safe.startsWith('data:image/')) {
      const comma = safe.indexOf(',');
      entry.encoded = safe.slice(comma + 1);
      const rawMime = safe.slice(5, safe.indexOf(';'));
      entry.mime = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[entry.mime];
      if (ext) {
        const hash = crypto.createHash('sha256').update(entry.mime).update('\0').update(entry.encoded).digest('hex');
        entry.etag = '"' + hash + '"';
        entry.version = hash;
        entry.size = Buffer.from(entry.encoded, 'base64').length;
        const key = Buffer.from(entry.id, 'utf8').toString('base64url');
        // Extensionless API URLs also work when the host serves /uploads/*.jpg
        // directly from disk before forwarding other requests to Node.
        const url = '/api/catalog-media/' + key + '/' + field + '/' + entry.version;
        if (url.length <= 300) entry.url = url;
      }
    }
    entries.set(field, entry);
    return entry;
  }

  function imageFor(product, field, compact = false) {
    const entry = entryFor(product, field);
    return entry ? (compact ? entry.url : entry.safe) : '';
  }

  function serve(req, res) {
    const { productKey = '', field = '', version = '' } = req.params;
    const missing = () => res.set('Cache-Control', 'no-store').status(404).end();
    if (!fields.has(field) || !/^[a-zA-Z0-9_-]{1,512}$/.test(productKey)) return missing();
    const id = Buffer.from(productKey, 'base64url').toString('utf8');
    if (Buffer.from(id, 'utf8').toString('base64url') !== productKey) return missing();
    const product = getProducts().find(p => p && String(p.id) === id);
    if (!product || publicationStatusFor(product) !== 'published' || String(product.status || 'available') !== 'available') return missing();
    // A product without its approved display image is not public, either.
    if (!imageFor(product, 'image')) return missing();
    const entry = entryFor(product, field);
    if (!entry || !entry.encoded || version !== entry.version) return missing();
    res.set('Content-Type', entry.mime);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'public, max-age=3600, immutable');
    res.set('ETag', entry.etag);
    const validators = String(req.headers['if-none-match'] || '').split(',').map(v => v.trim().replace(/^W\//, ''));
    if (validators.includes(entry.etag) || validators.includes('*')) return res.status(304).end();
    res.set('Content-Length', String(entry.size));
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).send(Buffer.from(entry.encoded, 'base64'));
  }

  return { imageFor, serve };
}

module.exports = { create };
