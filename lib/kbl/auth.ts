import { env } from 'cloudflare:workers';
import { get, sha } from './store';
export async function admin(req: Request) { const email = req.headers.get('oai-authenticated-user-email'), uid = req.headers.get('oai-authenticated-user-id'); const owner = (env as any).OWNER_EMAIL || 'vlam1881997@gmail.com'; if (!uid || !email)
    throw Object.assign(Error('Đăng nhập bằng tài khoản chủ để quản trị.'), { status: 401 }); if (email.toLowerCase() !== owner.toLowerCase())
    throw Object.assign(Error('Tài khoản này không có quyền quản trị.'), { status: 403 }); if (!['GET', 'HEAD'].includes(req.method)) {
    const origin = req.headers.get('origin');
    if (origin && origin !== new URL(req.url).origin)
        throw Object.assign(Error('Nguồn yêu cầu không hợp lệ.'), { status: 403 });
} return { uid, email }; }
export async function worker(req: Request) { const token = req.headers.get('x-kbl-worker-token') || req.headers.get('x-kbl-video-token') || ''; if (!/^[a-f0-9]{64}$/.test(token))
    throw Object.assign(Error('Thiếu mã Windows Worker.'), { status: 401 }); const key = await sha(token), r = await get('worker-auth', key); if (!r?.enabled)
    throw Object.assign(Error('Mã Windows đã hết hiệu lực hoặc bị tắt.'), { status: 403 }); return r.workerId as string; }
