import app from './index';
import { createAccessGate } from '../lib/kbl/cloudflare-access.mjs';
import { runMaintenance } from '../lib/kbl/scheduled.mjs';
import { tick, cleanup } from '../lib/kbl/pipeline';
import { event } from '../lib/kbl/store';
const gate = createAccessGate();
export default {
    async fetch(request: Request, env: Cloudflare.Env, ctx: Parameters<typeof app.fetch>[2]) {
        const checked = await gate(request, env);
        if (checked instanceof Response) return checked;
        return app.fetch(checked, env, ctx);
    },
    async scheduled() { await runMaintenance({ tick, cleanup, event }); }
};
