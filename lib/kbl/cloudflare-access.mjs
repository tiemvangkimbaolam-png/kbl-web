import { createRemoteJWKSet, jwtVerify } from 'jose';

const caches = new Map();
const ownerPath = path => path === '/admin' || path.startsWith('/admin/') || path === '/api/admin' || path.startsWith('/api/admin/');
const reply = (message, status) => Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
function settings(env) {
    const team = String(env.CF_ACCESS_TEAM_DOMAIN || '').replace(/\/$/, '');
    if (!/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/.test(team) || !/^[a-f0-9]{64}$/.test(env.CF_ACCESS_AUD || '') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.OWNER_EMAIL || '')) return null;
    return { team, audience: env.CF_ACCESS_AUD, owner: env.OWNER_EMAIL.toLowerCase() };
}
function remoteKeys(team) {
    if (!caches.has(team)) {
        if (caches.size >= 4) caches.delete(caches.keys().next().value);
        caches.set(team, createRemoteJWKSet(new URL(team + '/cdn-cgi/access/certs'), { timeoutDuration: 5000, cooldownDuration: 30000, cacheMaxAge: 600000 }));
    }
    return caches.get(team);
}
function safeReturn(value, origin) {
    if (!value?.startsWith('/') || value.startsWith('//')) return '/admin';
    const u = new URL(value, origin);
    return u.origin === origin && ownerPath(u.pathname) && !u.pathname.startsWith('/api/') ? u.pathname + u.search : '/admin';
}
export function createAccessGate({ keys = remoteKeys } = {}) {
    return async function gate(request, env) {
        const url = new URL(request.url), headers = new Headers(request.headers);
        // These headers are trusted only inside the Sites dispatcher. A directly
        // hosted Worker must drop every client-supplied identity on every path.
        for (const name of [...headers.keys()]) if (name.startsWith('oai-authenticated-user-')) headers.delete(name);
        const cfg = settings(env);
        if (url.pathname === '/signin-with-chatgpt') {
            if (!cfg) return reply('Chưa cấu hình Cloudflare Access cho Admin. Xem HUONG_DAN_CLOUDFLARE.md.', 503);
            return Response.redirect(new URL(safeReturn(url.searchParams.get('return_to'), url.origin), url.origin).href, 303);
        }
        if (url.pathname === '/signout-with-chatgpt') return Response.redirect(url.origin + '/cdn-cgi/access/logout', 303);
        const cookieTokens = (headers.get('cookie') || '').split(';').map(x => x.trim()).filter(x => x.startsWith('CF_Authorization=')).map(x => x.slice('CF_Authorization='.length));
        const token = headers.get('cf-access-jwt-assertion') || (cookieTokens.length === 1 ? cookieTokens[0] : '');
        let user;
        if (cfg && token && token.length < 16000) {
            try {
                const { payload } = await jwtVerify(token, keys(cfg.team), { issuer: cfg.team, audience: cfg.audience, algorithms: ['RS256'], requiredClaims: ['exp', 'iat', 'sub', 'email'], clockTolerance: 15 });
                if (payload.type !== 'app' || typeof payload.sub !== 'string' || !payload.sub || typeof payload.email !== 'string' || payload.email.toLowerCase() !== cfg.owner) throw Error('Not the owner');
                user = payload;
            } catch { /* Public paths remain public; private paths fail closed. */ }
        }
        if (ownerPath(url.pathname) && !user) return reply(cfg ? 'Đăng nhập Cloudflare Access bằng tài khoản chủ. Kiểm tra ứng dụng Access đã bảo vệ /admin và /api/admin trên hostname này.' : 'Chưa cấu hình Cloudflare Access cho Admin. Xem HUONG_DAN_CLOUDFLARE.md.', cfg ? 401 : 503);
        if (user) {
            headers.set('oai-authenticated-user-id', user.sub);
            headers.set('oai-authenticated-user-email', user.email);
        }
        // Do not let the source of the assertion leak further into the app logs.
        headers.delete('cf-access-jwt-assertion');
        return new Request(request, { headers });
    };
}
