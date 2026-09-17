const VERSION = '0.2.0-stage2-d1';

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

    if (!row) {
      return {
        connected: true,
        status: 'connected-no-status-row',
        record: null,
        error: ''
      };
    }

    return {
      connected: true,
      status: row.status === 'online' ? 'online' : String(row.status || 'unknown'),
      record: row,
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      const d1 = await checkD1(env);

      return json({
        success: true,
        service: 'Kim Bao Lam Cloudflare backup runtime',
        version: VERSION,
        runtime: 'cloudflare-workers',

        d1Connected: d1.connected,
        d1Status: d1.status,
        d1Record: d1.record,
        d1Error: d1.error,

        independentBackupData: false,
        mediaBackupReady: false,
        readyForFailover: false,

        message: d1.connected
          ? 'Stage 2 D1 is connected. Production KBL data sync and R2 are not connected yet.'
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

    if (url.pathname === '/api/failover-status') {
      const d1 = await checkD1(env);

      return json({
        success: true,
        primaryOrigin: 'TENTEN',
        backupOrigin: 'Cloudflare Workers',
        workerOnline: true,

        dataLayer: d1.connected ? 'd1-connected-test-only' : 'not-connected',
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