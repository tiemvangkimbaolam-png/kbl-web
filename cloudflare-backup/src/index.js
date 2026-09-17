const VERSION = '0.1.0-stage1';

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return json({
        success: true,
        service: 'Kim Bao Lam Cloudflare backup runtime',
        version: VERSION,
        runtime: 'cloudflare-workers',
        independentBackupData: false,
        readyForFailover: false,
        message: 'Stage 1 is online. D1/R2 data sync is not connected yet.'
      });
    }

    if (url.pathname === '/api/failover-status') {
      return json({
        success: true,
        primaryOrigin: 'TENTEN',
        backupOrigin: 'Cloudflare Workers',
        workerOnline: true,
        dataLayer: 'not-connected',
        mediaLayer: 'not-connected',
        automaticFailover: false,
        readyForProductionTraffic: false
      });
    }

    if (url.pathname.startsWith('/api/')) {
      return json({ success: false, message: 'Backup API route not implemented yet.' }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};
