'use strict';
const codes=['','LOCAL_ERROR','QUOTA','CHALLENGE','TAB_CLOSED','UI_NEEDS_REVIEW','INTERRUPTED','RETRY_NOT_READY','SERVER_UNAVAILABLE','RENDER_WAIT','VOICE_WAIT'];
const states=['preparing','dispatched','collected','awaiting-receipt','confirmed','attention','expired'];
const id=v=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
const code=v=>codes.includes(v)?v:'LOCAL_ERROR';
function validateReport(r,accounts,now){
 const bad=()=>{throw Object.assign(Error('Báo cáo agent không hợp lệ; không nhận mật khẩu/ảnh/nội dung trò chuyện.'),{code:'REPORT',status:422});};
 if(!r||Object.keys(r).some(k=>!['release','code','runs','preview'].includes(k))||r.release!=='5.7.10.42'||!codes.includes(r.code)||!Array.isArray(r.runs)||r.runs.length>80)bad();
 const runs=r.runs.map(v=>{if(!v||Object.keys(v).some(k=>!['runId','jobId','accountId','status','code','canRetry','expiresAt'].includes(k))||!(typeof v.runId==='string'&&/^[a-f0-9]{36}$/.test(v.runId))||!(typeof v.jobId==='string'&&/^TEAM-[a-f0-9]{24}-[1-9][0-9]{0,4}$/.test(v.jobId))||!accounts.some(a=>a.id===v.accountId)||!states.includes(v.status)||!codes.includes(v.code)||typeof v.canRetry!=='boolean'||!Number.isFinite(v.expiresAt)||v.expiresAt<0||v.expiresAt>now+25*3600000)bad();return {...v};});
 const p=r.preview;if(!p||Object.keys(p).some(k=>!['busy','hasPending','phase','jobId','lastSuccessAt','code'].includes(k))||typeof p.busy!=='boolean'||typeof p.hasPending!=='boolean'||!['','render','upload'].includes(p.phase)||p.jobId!==''&&!id(p.jobId)||!Number.isFinite(p.lastSuccessAt)||p.lastSuccessAt<0||p.lastSuccessAt>now+300000||!codes.includes(p.code))bad();
 return {release:r.release,code:r.code,runs,preview:{...p}};
}
function project({hub,preview,controller}){
 const runs=hub.runs.slice(-80).map(r=>({runId:r.id,jobId:r.jobId,accountId:r.accountId,status:r.status,code:code(r.code||''),canRetry:r.status==='attention'&&r.canRetry===true,expiresAt:r.jobExpiresAt||0}));
 return {release:'5.7.10.42',code:codes.includes(controller?.lastCode)?controller.lastCode:controller?.lastError?'LOCAL_ERROR':'',runs,preview:{busy:preview.busy===true,hasPending:preview.hasPending===true,phase:preview.phase||'',jobId:preview.jobId||'',lastSuccessAt:preview.lastSuccessAt||0,code:preview.lastError?'RENDER_WAIT':''}};
}
module.exports={codes,validateReport,project};
