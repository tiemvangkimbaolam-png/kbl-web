import {customerMaintenance} from '../lib/kbl/customer-maintenance';
import {capturePriceHistory} from '../lib/kbl/price-history';
import {deliverFeedback} from '../lib/kbl/feedback';
import { pollCloudPrice } from '../lib/kbl/cloud-price';
import { processInboxReplies } from '../lib/kbl/inbox';
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
        const result=await app.fetch(checked, env, ctx);if(new URL(request.url).hostname.endsWith('.workers.dev')){const headers=new Headers(result.headers);headers.set('X-Robots-Tag','noindex, follow');return new Response(result.body,{status:result.status,statusText:result.statusText,headers});}return result;
    },
    async scheduled() { await runMaintenance({ tick: async()=>{try{await pollCloudPrice();}catch{await event('cloud-price-error','Chưa cập nhật nguồn BK/ASK; giữ giá có thời điểm.');}try{await tick();}finally{await processInboxReplies().catch(()=>{});await deliverFeedback().catch(()=>{});await capturePriceHistory().catch(()=>{});await customerMaintenance().catch(()=>{});}}, cleanup, event }); }
};
