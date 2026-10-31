import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyMeta,extractMessages,sendReplyOnce,telegramWebhookSecret} from '../lib/kbl/inbox-core.mjs';
import {telegramJSON} from '../lib/kbl/social-core.mjs';
test('Meta webhook HMAC verifies the exact raw payload and rejects wrong secrets or changed bytes',async()=>{
 const secret='fixture-secret-only',raw=JSON.stringify({entry:[]}),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const sig='sha256='+[...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(raw)))].map(v=>v.toString(16).padStart(2,'0')).join('');
 assert.equal(await verifyMeta(raw,sig,secret),true);assert.equal(await verifyMeta(raw+' ',sig,secret),false);assert.equal(await verifyMeta(raw,sig,'bad-secret'),false);assert.equal(await verifyMeta(raw,null,secret),false);
});
test('inbox accepts only bound Meta target, customer text and in-window messages; Telegram requires private human message',()=>{
 const now=1700000000000,payload={entry:[{id:'page',messaging:[{sender:{id:'customer'},recipient:{id:'page'},timestamp:now-500,message:{mid:'m_123',text:'Còn nhẫn không?'}}]}]};
 assert.equal(extractMessages('facebook',payload,'page',now).length,1);assert.equal(extractMessages('facebook',payload,'other',now).length,0);
 payload.entry[0].messaging[0].message.is_echo=true;assert.equal(extractMessages('facebook',payload,'page',now).length,0);
 const t={update_id:12,message:{message_id:4,date:now/1000,from:{is_bot:false},chat:{id:123,type:'private'},text:'Giá hôm nay?'}};
 assert.equal(extractMessages('telegram',t,'unused',now).length,1);t.message.chat.type='channel';assert.equal(extractMessages('telegram',t,'unused',now).length,0);
});
test('reply checkpoints before network call and never repeats an ambiguous write or sends outside Meta window',async()=>{
 const states=[];let calls=0;const row={platform:'facebook',receivedAt:1000,status:'awaiting-reply'};
 const options={now:()=>2000,checkpoint:async next=>states.push(next.status),request:async()=>{calls++;assert.equal(states.at(-1),'sending');throw Error('Connection lost');}};
 const result=await sendReplyOnce(row,'Xin chào',options);assert.equal(result.status,'uncertain');await sendReplyOnce(result,'Xin chào',options);assert.equal(calls,1);
 assert.deepEqual(states,['sending','uncertain']);
 const expired=await sendReplyOnce(row,'Xin chào',{...options,now:()=>1000+86400000});assert.equal(expired.status,'expired');assert.equal(calls,1);
});
test('telegram webhook secret is per-connection and requires a real master key',async()=>{
 const master='k'.repeat(64),a=await telegramWebhookSecret(master,'a'.repeat(32)),b=await telegramWebhookSecret(master,'b'.repeat(32));
 assert.match(a,/^[a-f0-9]{64}$/);assert.notEqual(a,b);
 await assert.rejects(()=>telegramWebhookSecret('short','a'.repeat(32)),/32/);
});
test('telegram API errors surface the description but never the bot token',async()=>{
 const token='123456:SECRET-TOKEN';
 await assert.rejects(()=>telegramJSON(token,'getChat',{},async()=>({ok:false,status:400,json:async()=>({ok:false,description:'Bad Request: chat not found for '+token})})),error=>error.status===502&&!error.message.includes(token)&&/chat not found/.test(error.message));
 const ok=await telegramJSON(token,'getMe',{},async()=>({ok:true,status:200,json:async()=>({ok:true,result:{is_bot:true}})}));
 assert.equal(ok.result.is_bot,true);
});
