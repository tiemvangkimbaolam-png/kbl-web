import {processPriceNotifications} from '../lib/kbl/customer-plans';
import {customerMaintenance} from '../lib/kbl/customer-maintenance';
import {capturePriceHistory} from '../lib/kbl/price-history';
import {deliverFeedback} from '../lib/kbl/feedback';
import { pollCloudPrice } from '../lib/kbl/cloud-price';
import { processInboxReplies } from '../lib/kbl/inbox';
import app from './index';
import { createAccessGate } from '../lib/kbl/cloudflare-access.mjs';
import { adminCallbackRedirect } from '../lib/kbl/social-core.mjs';
import { runMaintenance,runScheduledTasks,hourlyMaintenanceDue } from '../lib/kbl/scheduled.mjs';
import { tick, cleanup } from '../lib/kbl/pipeline';
import { event } from '../lib/kbl/store';
import {pruneCounters} from '../lib/kbl/maintenance';
import {sql} from '../lib/kbl/store';
const gate = createAccessGate();
export default {
    async fetch(request: Request, env: Cloudflare.Env, ctx: Parameters<typeof app.fetch>[2]) {
        const callbackRedirect = adminCallbackRedirect(request, env as any);
        if (callbackRedirect) return callbackRedirect;
        const checked = await gate(request, env);
        if (checked instanceof Response) return checked;
        const result=await app.fetch(checked, env, ctx);if(new URL(request.url).hostname.endsWith('.workers.dev')){const headers=new Headers(result.headers);headers.set('X-Robots-Tag','noindex, follow');return new Response(result.body,{status:result.status,statusText:result.statusText,headers});}return result;
    },
    async scheduled(controller:ScheduledController) {
        const at=controller.scheduledTime||Date.now();
        await runMaintenance({tick:async()=>{
            // Refresh the selected source before consumers; a failed Relay cannot stop AI/history.
            const quote=await Promise.allSettled([pollCloudPrice()]);
            const other=await Promise.allSettled([runScheduledTasks({
                'điều phối AI':()=>tick({housekeeping:false}),
                'trả lời hộp thư':processInboxReplies,
                'phản hồi cửa hàng':deliverFeedback,
                'lịch sử giá':()=>capturePriceHistory(at,{housekeeping:false}),
                'mốc cảnh báo giá':()=>processPriceNotifications({housekeeping:false})
            },event)]);
            if(quote[0].status==='rejected')await event('cloud-price-error','Chưa cập nhật nguồn BK/ASK; giữ giá có thời điểm.').catch(()=>{});
            if(quote[0].status==='rejected'||other[0].status==='rejected')throw Error('Scheduled work incomplete.');
        },cleanup:async()=>{if(hourlyMaintenanceDue(at))await runScheduledTasks({
            'dọn nhật ký và bộ đếm':()=>pruneCounters(at),
            'dọn phiên và ảnh hết hạn':customerMaintenance,
            'dọn lịch sử thế giới':()=>sql().prepare("DELETE FROM records WHERE kind='history-world' AND created_at<?").bind(at-30*86400000).run(),
            'dọn biên nhận thông báo cũ':()=>sql().prepare("DELETE FROM records WHERE kind='customer-push-job' AND created_at<? AND json_extract(data,'$.status') IN ('accepted','rejected','cancelled','unknown')").bind(at-30*86400000).run(),
            'dọn video đã đủ biên nhận':cleanup
        },event);},event});
    }
};
