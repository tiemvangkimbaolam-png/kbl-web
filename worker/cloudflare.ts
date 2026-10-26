import app from './index';
import { createAccessGate } from '../lib/kbl/cloudflare-access.mjs';
const gate = createAccessGate();
export default {
    async fetch(request: Request, env: Cloudflare.Env, ctx: Parameters<typeof app.fetch>[2]) {
        const checked = await gate(request, env);
        if (checked instanceof Response) return checked;
        return app.fetch(checked, env, ctx);
    }
};
