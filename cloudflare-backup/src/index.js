const VERSION = '0.3.0-stage2-sync';

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

      if (d1.connected) {
        try {
          goldPrice = publicGoldPrice(await getGoldPrice(env));
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

        independentBackupData: false,
        mediaBackupReady: false,
        readyForFailover: false,

        message: d1.connected
          ? 'D1 is connected. Gold-price sync endpoint is ready.'
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

    if (url.pathname === '/api/failover-status') {
      const d1 = await checkD1(env);

      let goldPrice = null;

      if (d1.connected) {
        try {
          goldPrice = publicGoldPrice(await getGoldPrice(env));
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
  }
};