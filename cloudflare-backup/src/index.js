const VERSION = '0.5.0-stage4-auto-catalog';
const PRIMARY_CATALOG_URL = 'https://tiemvangkimbaolam.id.vn/api/products';

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

function safeText(value, max = 100) {
  return String(value ?? '').trim().slice(0, max);
}

function validIso(value) {
  const text = safeText(value, 80);
  const time = Date.parse(text);
  return Number.isFinite(time) ? new Date(time).toISOString() : '';
}

async function safeEqual(a, b) {
  const encoder = new TextEncoder();

  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(String(a || ''))),
    crypto.subtle.digest('SHA-256', encoder.encode(String(b || '')))
  ]);

  const left = new Uint8Array(hashA);
  const right = new Uint8Array(hashB);

  let diff = 0;
  for (let i = 0; i < left.length; i++) {
    diff |= left[i] ^ right[i];
  }

  return diff === 0;
}

async function checkD1(env) {
  if (!env.DB) {
    return {
      connected: false,
      status: 'binding-missing',
      record: null,
      error: 'DB binding is not available.'
    };
  }

  try {
    const row = await env.DB
      .prepare(`
        SELECT id, service, status, updated_at
        FROM kbl_backup_status
        WHERE id = 1
        LIMIT 1
      `)
      .first();

    return {
      connected: true,
      status: row?.status || 'connected',
      record: row || null,
      error: ''
    };
  } catch (error) {
    return {
      connected: false,
      status: 'query-error',
      record: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function getGoldPrice(env) {
  if (!env.DB) return null;

  return env.DB
    .prepare(`
      SELECT
        symbol,
        bid_raw,
        ask_raw,
        source_base_vnd,
        markup_vnd,
        final_sell_9999,
        source_checked_at,
        source_success_at,
        synced_at
      FROM kbl_gold_price
      WHERE symbol = 'BK'
      LIMIT 1
    `)
    .first();
}

function publicGoldPrice(row) {
  if (!row) return null;

  const syncedTime = Date.parse(row.synced_at || '');
  const ageSeconds = Number.isFinite(syncedTime)
    ? Math.max(0, Math.round((Date.now() - syncedTime) / 1000))
    : null;

  return {
    symbol: row.symbol,
    bidRaw: row.bid_raw,
    askRaw: row.ask_raw,
    sourceBaseVnd: row.source_base_vnd,
    markupVnd: row.markup_vnd,
    finalSell9999: row.final_sell_9999,
    sourceCheckedAt: row.source_checked_at,
    sourceSuccessAt: row.source_success_at,
    syncedAt: row.synced_at,
    ageSeconds,
    fresh: ageSeconds !== null && ageSeconds <= 180
  };
}


function safeCatalogMedia(value) {
  const text = String(value ?? '').trim();
  if (!text || text.length > 2048) return '';
  if (/^https:\/\//i.test(text) || /^\//.test(text)) return text;
  return '';
}

function safeCatalogNumber(value, min = 0, max = 1000000000000) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(max, Math.max(min, number));
}

function sanitizeCatalogAvailability(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};

  return {
    status: safeText(raw.status || 'available', 40) || 'available',
    reserved: Boolean(raw.reserved),
    label: safeText(raw.label || 'Còn hàng tại tiệm', 120) || 'Còn hàng tại tiệm'
  };
}

function sanitizeCatalogProduct(product) {
  if (!product || typeof product !== 'object' || Array.isArray(product)) {
    return null;
  }

  const sku = safeText(product.sku, 80);
  const id = safeText(product.id || sku, 120);

  if (!sku || !id) return null;

  return {
    id,
    sku,
    name: safeText(product.name, 160),
    posName: safeText(product.posName, 160),
    displayName: safeText(product.displayName, 160),
    category: safeText(product.category, 100),
    displayShelf: safeText(product.displayShelf, 100),
    displayGoldShelf: safeText(product.displayGoldShelf, 100),
    goldCode: safeText(product.goldCode, 20),
    weightChi: safeCatalogNumber(product.weightChi, 0, 10000),
    workmanship: Math.round(safeCatalogNumber(product.workmanship, 0, 10000000000)),
    sizeLabel: safeText(product.sizeLabel, 80),
    featured: Boolean(product.featured),
    featuredOrder: Math.round(safeCatalogNumber(product.featuredOrder, 0, 1000000)),
    kind: safeText(product.kind, 40),
    status: 'available',
    image: safeCatalogMedia(product.image),
    tryOnImage: safeCatalogMedia(product.tryOnImage),
    geminiTryOnImage: safeCatalogMedia(product.geminiTryOnImage),
    description: safeText(product.description, 1200),
    detail: safeText(product.detail, 1200),
    productSymbol: safeText(product.productSymbol, 120),
    goldContentLabel: safeText(product.goldContentLabel, 120),
    attachedWeightChi: safeCatalogNumber(product.attachedWeightChi, 0, 10000),
    totalWeightChi: safeCatalogNumber(product.totalWeightChi, 0, 10000),
    producerName: safeText(product.producerName, 200),
    producerCode: safeText(product.producerCode, 100),
    producerAddress: safeText(product.producerAddress, 400),
    supplierName: safeText(product.supplierName, 200),
    supplierAddress: safeText(product.supplierAddress, 400),
    origin: safeText(product.origin || 'Việt Nam', 160),
    applicableStandard: safeText(product.applicableStandard, 240),
    specialMark: safeText(product.specialMark, 160),
    warnings: safeText(product.warnings, 600),
    referencePrice: Math.round(safeCatalogNumber(product.referencePrice, 0, 1000000000000)),
    availability: sanitizeCatalogAvailability(product.availability)
  };
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value ?? ''));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function getCatalogSnapshot(env) {
  if (!env.DB) return null;

  return env.DB
    .prepare(`
      SELECT
        id,
        product_count,
        checksum,
        source_updated_at,
        synced_at,
        payload_json
      FROM kbl_public_catalog_snapshot
      WHERE id = 1
      LIMIT 1
    `)
    .first();
}

function publicCatalogSnapshot(row) {
  if (!row) return null;

  let products = [];

  try {
    const parsed = JSON.parse(String(row.payload_json || '[]'));
    if (Array.isArray(parsed)) products = parsed;
  } catch (_) {}

  const syncedTime = Date.parse(row.synced_at || '');
  const ageSeconds = Number.isFinite(syncedTime)
    ? Math.max(0, Math.round((Date.now() - syncedTime) / 1000))
    : null;

  return {
    productCount: Number(row.product_count || products.length || 0),
    checksum: safeText(row.checksum, 128),
    sourceUpdatedAt: row.source_updated_at || '',
    syncedAt: row.synced_at || '',
    ageSeconds,
    fresh: ageSeconds !== null && ageSeconds <= 900,
    products
  };
}

async function syncCatalog(request, env) {
  if (!env.DB) {
    return json({
      success: false,
      message: 'D1 binding is unavailable.'
    }, 503);
  }

  const expectedSecret = String(env.KBL_BACKUP_SYNC_SECRET || '');

  if (!expectedSecret) {
    return json({
      success: false,
      message: 'Backup sync secret is not configured.'
    }, 503);
  }

  const suppliedSecret =
    request.headers.get('x-kbl-sync-secret') || '';

  if (!(await safeEqual(expectedSecret, suppliedSecret))) {
    return json({
      success: false,
      message: 'Unauthorized.'
    }, 401);
  }

  const maxPayloadBytes = 2 * 1024 * 1024;
  const contentLength = Number(request.headers.get('content-length') || 0);

  if (contentLength > maxPayloadBytes) {
    return json({
      success: false,
      message: 'Catalog payload too large.'
    }, 413);
  }

  let raw = '';
  let body;

  try {
    raw = await request.text();

    if (new TextEncoder().encode(raw).length > maxPayloadBytes) {
      return json({
        success: false,
        message: 'Catalog payload too large.'
      }, 413);
    }

    body = JSON.parse(raw);
  } catch (_) {
    return json({
      success: false,
      message: 'Invalid JSON.'
    }, 400);
  }

  const sourceUpdatedAt = validIso(body?.sourceUpdatedAt);
  const incomingProducts = Array.isArray(body?.products) ? body.products : null;

  if (!sourceUpdatedAt) {
    return json({
      success: false,
      message: 'sourceUpdatedAt is invalid.'
    }, 400);
  }

  if (!incomingProducts) {
    return json({
      success: false,
      message: 'Catalog products array is missing.'
    }, 400);
  }

  if (incomingProducts.length < 1 || incomingProducts.length > 2000) {
    return json({
      success: false,
      message: 'Catalog product count is outside the safe range.'
    }, 400);
  }

  const products = [];
  const seenSku = new Set();

  for (const rawProduct of incomingProducts) {
    const product = sanitizeCatalogProduct(rawProduct);
    if (!product) continue;

    const key = product.sku.toUpperCase();
    if (seenSku.has(key)) continue;

    seenSku.add(key);
    products.push(product);
  }

  if (!products.length) {
    return json({
      success: false,
      message: 'Catalog contains no valid public products.'
    }, 400);
  }

  const existing = await getCatalogSnapshot(env);

  if (existing?.source_updated_at) {
    const oldTime = Date.parse(existing.source_updated_at);
    const incomingTime = Date.parse(sourceUpdatedAt);

    if (
      Number.isFinite(oldTime) &&
      Number.isFinite(incomingTime) &&
      incomingTime < oldTime
    ) {
      return json({
        success: false,
        message: 'Stale catalog payload rejected.'
      }, 409);
    }
  }

  const payloadJson = JSON.stringify(products);
  const checksum = await sha256Hex(payloadJson);
  const syncedAt = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO kbl_public_catalog_snapshot (
        id,
        product_count,
        checksum,
        source_updated_at,
        synced_at,
        payload_json
      )
      VALUES (1, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        product_count = excluded.product_count,
        checksum = excluded.checksum,
        source_updated_at = excluded.source_updated_at,
        synced_at = excluded.synced_at,
        payload_json = excluded.payload_json
    `).bind(
      products.length,
      checksum,
      sourceUpdatedAt,
      syncedAt,
      payloadJson
    ),

    env.DB.prepare(`
      INSERT INTO kbl_sync_state (
        sync_key,
        source,
        status,
        last_attempt_at,
        last_success_at,
        last_error,
        updated_at
      )
      VALUES (
        'catalog',
        'TENTEN',
        'online',
        ?,
        ?,
        '',
        ?
      )
      ON CONFLICT(sync_key) DO UPDATE SET
        source = excluded.source,
        status = excluded.status,
        last_attempt_at = excluded.last_attempt_at,
        last_success_at = excluded.last_success_at,
        last_error = '',
        updated_at = excluded.updated_at
    `).bind(
      syncedAt,
      syncedAt,
      syncedAt
    )
  ]);

  return json({
    success: true,
    message: 'Public catalog synchronized to Cloudflare D1.',
    catalog: {
      productCount: products.length,
      checksum,
      sourceUpdatedAt,
      syncedAt
    }
  });
}


async function pullCatalogFromPrimary(env) {
  const startedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(PRIMARY_CATALOG_URL, {
      method: 'GET',
      headers: { 'accept': 'application/json' },
      cache: 'no-store',
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Primary catalog HTTP ${response.status}`);
    }

    const body = await response.json();
    const products = Array.isArray(body?.products) ? body.products : null;

    if (!products || products.length < 1) {
      throw new Error('Primary catalog returned no products.');
    }

    const secret = String(env.KBL_BACKUP_SYNC_SECRET || '');
    if (!secret) {
      throw new Error('Backup sync secret is not configured.');
    }

    const internalRequest = new Request('https://kbl-internal/sync/catalog', {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-kbl-sync-secret': secret
      },
      body: JSON.stringify({
        sourceUpdatedAt: new Date().toISOString(),
        products
      })
    });

    const saved = await syncCatalog(internalRequest, env);

    if (!saved.ok) {
      const errorBody = await saved.text().catch(() => '');
      throw new Error(`Catalog save failed HTTP ${saved.status}${errorBody ? `: ${errorBody.slice(0, 220)}` : ''}`);
    }

    return {
      success: true,
      productCount: products.length,
      startedAt,
      finishedAt: new Date().toISOString()
    };
  } catch (error) {
    const failedAt = new Date().toISOString();
    const message = error?.name === 'AbortError'
      ? 'Primary catalog pull timed out.'
      : safeText(error?.message || String(error), 300);

    if (env.DB) {
      try {
        await env.DB.prepare(`
          INSERT INTO kbl_sync_state (
            sync_key,
            source,
            status,
            last_attempt_at,
            last_success_at,
            last_error,
            updated_at
          )
          VALUES ('catalog', 'TENTEN', 'error', ?, NULL, ?, ?)
          ON CONFLICT(sync_key) DO UPDATE SET
            source = excluded.source,
            status = excluded.status,
            last_attempt_at = excluded.last_attempt_at,
            last_error = excluded.last_error,
            updated_at = excluded.updated_at
        `).bind(failedAt, message, failedAt).run();
      } catch (_) {}
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function syncGoldPrice(request, env) {
  if (!env.DB) {
    return json({
      success: false,
      message: 'D1 binding is unavailable.'
    }, 503);
  }

  const expectedSecret = String(env.KBL_BACKUP_SYNC_SECRET || '');

  if (!expectedSecret) {
    return json({
      success: false,
      message: 'Backup sync secret is not configured.'
    }, 503);
  }

  const suppliedSecret =
    request.headers.get('x-kbl-sync-secret') || '';

  if (!(await safeEqual(expectedSecret, suppliedSecret))) {
    return json({
      success: false,
      message: 'Unauthorized.'
    }, 401);
  }

  const contentLength =
    Number(request.headers.get('content-length') || 0);

  if (contentLength > 8192) {
    return json({
      success: false,
      message: 'Payload too large.'
    }, 413);
  }

  let raw = '';
  let body;

  try {
    raw = await request.text();

    if (raw.length > 8192) {
      return json({
        success: false,
        message: 'Payload too large.'
      }, 413);
    }

    body = JSON.parse(raw);
  } catch (_) {
    return json({
      success: false,
      message: 'Invalid JSON.'
    }, 400);
  }

  const symbol = safeText(body?.symbol, 10).toUpperCase();

  const bidRaw = safeText(body?.bidRaw, 40);
  const askRaw = safeText(body?.askRaw, 40);

  const sourceBaseVnd = Math.round(Number(body?.sourceBaseVnd));
  const markupVnd = Math.round(Number(body?.markupVnd));
  const finalSell9999 = Math.round(Number(body?.finalSell9999));

  const sourceCheckedAt = validIso(body?.sourceCheckedAt);
  const sourceSuccessAt = validIso(body?.sourceSuccessAt);

  if (symbol !== 'BK') {
    return json({
      success: false,
      message: 'Unsupported gold symbol.'
    }, 400);
  }

  if (!bidRaw || !askRaw) {
    return json({
      success: false,
      message: 'BK BID/ASK is missing.'
    }, 400);
  }

  if (
    !Number.isFinite(sourceBaseVnd) ||
    sourceBaseVnd < 1000000 ||
    sourceBaseVnd > 100000000
  ) {
    return json({
      success: false,
      message: 'sourceBaseVnd is outside the safe range.'
    }, 400);
  }

  if (
    !Number.isFinite(markupVnd) ||
    markupVnd < 0 ||
    markupVnd > 5000000
  ) {
    return json({
      success: false,
      message: 'markupVnd is outside the safe range.'
    }, 400);
  }

  if (
    !Number.isFinite(finalSell9999) ||
    finalSell9999 < 1000000 ||
    finalSell9999 > 100000000
  ) {
    return json({
      success: false,
      message: 'finalSell9999 is outside the safe range.'
    }, 400);
  }

  const expectedFinal =
    Math.round((sourceBaseVnd + markupVnd) / 1000) * 1000;

  if (Math.abs(finalSell9999 - expectedFinal) > 1000) {
    return json({
      success: false,
      message: 'Gold price arithmetic verification failed.'
    }, 400);
  }

  if (!sourceSuccessAt) {
    return json({
      success: false,
      message: 'sourceSuccessAt is invalid.'
    }, 400);
  }

  const existing = await getGoldPrice(env);

  if (existing) {
    const oldTime = Date.parse(
      existing.source_success_at || existing.synced_at || ''
    );

    const incomingTime = Date.parse(sourceSuccessAt);

    if (
      Number.isFinite(oldTime) &&
      Number.isFinite(incomingTime) &&
      incomingTime < oldTime
    ) {
      return json({
        success: false,
        message: 'Stale gold-price payload rejected.'
      }, 409);
    }
  }

  const syncedAt = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO kbl_gold_price (
        symbol,
        bid_raw,
        ask_raw,
        source_base_vnd,
        markup_vnd,
        final_sell_9999,
        source_checked_at,
        source_success_at,
        synced_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)

      ON CONFLICT(symbol) DO UPDATE SET
        bid_raw = excluded.bid_raw,
        ask_raw = excluded.ask_raw,
        source_base_vnd = excluded.source_base_vnd,
        markup_vnd = excluded.markup_vnd,
        final_sell_9999 = excluded.final_sell_9999,
        source_checked_at = excluded.source_checked_at,
        source_success_at = excluded.source_success_at,
        synced_at = excluded.synced_at
    `).bind(
      symbol,
      bidRaw,
      askRaw,
      sourceBaseVnd,
      markupVnd,
      finalSell9999,
      sourceCheckedAt || null,
      sourceSuccessAt,
      syncedAt
    ),

    env.DB.prepare(`
      INSERT INTO kbl_sync_state (
        sync_key,
        source,
        status,
        last_attempt_at,
        last_success_at,
        last_error,
        updated_at
      )
      VALUES (
        'gold-price',
        'TENTEN',
        'online',
        ?,
        ?,
        '',
        ?
      )

      ON CONFLICT(sync_key) DO UPDATE SET
        source = excluded.source,
        status = excluded.status,
        last_attempt_at = excluded.last_attempt_at,
        last_success_at = excluded.last_success_at,
        last_error = '',
        updated_at = excluded.updated_at
    `).bind(
      syncedAt,
      syncedAt,
      syncedAt
    )
  ]);

  const saved = await getGoldPrice(env);

  return json({
    success: true,
    message: 'Gold price synchronized to Cloudflare D1.',
    goldPrice: publicGoldPrice(saved)
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      const d1 = await checkD1(env);

      let goldPrice = null;
      let catalog = null;

      if (d1.connected) {
        try {
          goldPrice = publicGoldPrice(await getGoldPrice(env));
        } catch (_) {}

        try {
          catalog = publicCatalogSnapshot(await getCatalogSnapshot(env));
        } catch (_) {}
      }

      return json({
        success: true,
        service: 'Kim Bao Lam Cloudflare backup runtime',
        version: VERSION,
        runtime: 'cloudflare-workers',

        d1Connected: d1.connected,
        d1Status: d1.status,
        d1Record: d1.record,
        d1Error: d1.error,

        syncSecretConfigured:
          Boolean(String(env.KBL_BACKUP_SYNC_SECRET || '')),

        goldPriceBackupReady: Boolean(goldPrice),
        goldPriceFresh: Boolean(goldPrice?.fresh),
        catalogBackupReady: Boolean(catalog?.productCount),
        catalogFresh: Boolean(catalog?.fresh),
        catalogProductCount: Number(catalog?.productCount || 0),
        catalogAutoPullEnabled: true,
        catalogAutoPullMinutes: 5,

        independentBackupData: false,
        mediaBackupReady: false,
        readyForFailover: false,

        message: d1.connected
          ? 'D1 is connected. Gold-price sync is live and catalog auto-pull runs every 5 minutes.'
          : 'Worker is online, but D1 is not healthy.'
      });
    }

    if (url.pathname === '/api/db-status') {
      const d1 = await checkD1(env);

      return json({
        success: d1.connected,
        database: 'kbl-backup-db',
        binding: 'DB',
        ...d1
      }, d1.connected ? 200 : 503);
    }

    if (
      url.pathname === '/api/sync/gold-price' &&
      request.method === 'POST'
    ) {
      return syncGoldPrice(request, env);
    }

    if (
      url.pathname === '/api/sync/catalog' &&
      request.method === 'POST'
    ) {
      return syncCatalog(request, env);
    }

    if (url.pathname === '/api/gold-price') {
      try {
        const row = await getGoldPrice(env);

        if (!row) {
          return json({
            success: false,
            message: 'No backed-up gold price yet.'
          }, 404);
        }

        return json({
          success: true,
          source: 'Cloudflare D1 backup',
          goldPrice: publicGoldPrice(row)
        });
      } catch (error) {
        return json({
          success: false,
          message: 'Cannot read backup gold price.',
          error:
            error instanceof Error
              ? error.message
              : String(error)
        }, 500);
      }
    }

    if (url.pathname === '/api/products') {
      try {
        const catalog = publicCatalogSnapshot(await getCatalogSnapshot(env));

        if (!catalog || !catalog.productCount) {
          return json({
            success: false,
            message: 'No backed-up public catalog yet.'
          }, 404);
        }

        return json({
          success: true,
          source: 'Cloudflare D1 backup',
          products: catalog.products,
          backup: {
            productCount: catalog.productCount,
            checksum: catalog.checksum,
            sourceUpdatedAt: catalog.sourceUpdatedAt,
            syncedAt: catalog.syncedAt,
            ageSeconds: catalog.ageSeconds,
            fresh: catalog.fresh
          }
        });
      } catch (error) {
        return json({
          success: false,
          message: 'Cannot read backup public catalog.',
          error:
            error instanceof Error
              ? error.message
              : String(error)
        }, 500);
      }
    }

    if (url.pathname === '/api/failover-status') {
      const d1 = await checkD1(env);

      let goldPrice = null;
      let catalog = null;

      if (d1.connected) {
        try {
          goldPrice = publicGoldPrice(await getGoldPrice(env));
        } catch (_) {}

        try {
          catalog = publicCatalogSnapshot(await getCatalogSnapshot(env));
        } catch (_) {}
      }

      return json({
        success: true,
        primaryOrigin: 'TENTEN',
        backupOrigin: 'Cloudflare Workers',
        workerOnline: true,

        dataLayer:
          d1.connected
            ? 'd1-connected'
            : 'not-connected',

        goldPriceBackupReady: Boolean(goldPrice),
        goldPriceFresh: Boolean(goldPrice?.fresh),
        catalogBackupReady: Boolean(catalog?.productCount),
        catalogFresh: Boolean(catalog?.fresh),
        catalogProductCount: Number(catalog?.productCount || 0),

        mediaLayer: 'not-connected',
        productionDataSynced: false,
        automaticFailover: false,
        readyForProductionTraffic: false
      });
    }

    if (url.pathname.startsWith('/api/')) {
      return json({
        success: false,
        message: 'Backup API route not implemented yet.'
      }, 404);
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      pullCatalogFromPrimary(env).catch((error) => {
        console.warn('KBL BACKUP CATALOG AUTO-PULL:', error?.message || String(error));
      })
    );
  }
};