// Local Miniflare D1 fixture only. Never opens the production database.
const fs=require('node:fs'),{createRequire}=require('node:module');
const {Miniflare}=createRequire(fs.realpathSync('node_modules/wrangler/package.json'))('miniflare');
(async()=>{const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("local fixture only")}}',compatibilityDate:'2026-05-15',d1Databases:{DB:'kbl-read-budget-fixture-v2'}});try{
 const db=await mf.getD1Database('DB'),out={environment:'Local Miniflare D1; synthetic fixture, NOT production usage',fixture:{events:2000,worldPoints:8640,finishedJobs:1000,inactiveAlerts:1000,finishedPushJobs:1000},results:[]},at=Date.now();
 async function migrate(f){for(const s of fs.readFileSync('drizzle/'+f,'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();}
 const migrations=fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort();for(const f of migrations.filter(f=>Number(f.slice(0,4))<3))await migrate(f);
 const seed=async(kind,n,data)=>db.prepare(`WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<${n}) INSERT INTO records(kind,id,data,created_at,updated_at) SELECT ?,printf('%06d',n),?,${at},${at} FROM seq`).bind(kind,JSON.stringify(data)).run();
 await db.prepare("WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<2000) INSERT INTO events(type,message,at) SELECT 'fixture','fixture',n FROM seq").run();
 await seed('history-world',8640,{xauUsd:1});await seed('customer-price-alert',1000,{enabled:false,status:'sent'});await seed('customer-push-job',1000,{status:'accepted'});
 await db.prepare("WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<1000) INSERT INTO jobs(id,story_id,stage,status,attempt,result_hash,created_at,updated_at) SELECT printf('job-%d',n),printf('story-%d',n),'write','complete',1,'fixture-hash',n,n FROM seq").run();
 await db.prepare("INSERT INTO records(kind,id,data,created_at,updated_at) SELECT 'job-transition',id||':1:fixture-hash','{}',1,1 FROM jobs").run();
 for(const f of migrations.filter(f=>Number(f.slice(0,4))===3))await migrate(f);
 const cases=[
 ['events',"DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY id DESC LIMIT 2000)","DELETE FROM events WHERE id < (SELECT id FROM events ORDER BY id DESC LIMIT 1 OFFSET 1999)",[],1440,24],
 ['world_retention',"DELETE FROM records WHERE kind='history-world' AND created_at<?",null,[at-30*86400000],1440,24],
 ['inactive_alerts',"SELECT id,data,version FROM records WHERE kind=? AND json_extract(data,'$.enabled')=1 AND json_extract(data,'$.status')='armed' ORDER BY updated_at LIMIT 5000",null,['customer-price-alert'],1440,1440],
 ['finished_push_jobs',"SELECT id,data,version FROM records WHERE kind=? AND json_extract(data,'$.status')='pending' AND COALESCE(json_extract(data,'$.nextAt'),0)<=? ORDER BY created_at LIMIT 20",null,['customer-push-job',at],1440,1440],
 ['admin_job_history',"SELECT id,story_id,stage,status,owner,exclude_account,lease_until,attempt,error,created_at,updated_at FROM jobs ORDER BY created_at DESC LIMIT 250",null,[],5760,2880],
 ['idle_worker_queue',"SELECT * FROM jobs ORDER BY CASE WHEN status IN ('complete','canceled') THEN 1 ELSE 0 END,created_at ASC LIMIT 300","SELECT * FROM jobs WHERE status IN ('queued','leased','running','attention','blocked','waiting-revision') ORDER BY created_at ASC LIMIT 300",[],5760,1440],
 ['transition_scan',"SELECT * FROM jobs WHERE status='complete' AND stage<>'publish' ORDER BY updated_at ASC LIMIT 5","SELECT * FROM jobs INDEXED BY jobs_needing_transition WHERE status='complete' AND stage<>'publish' AND (transitioned_result IS NULL OR transitioned_result<>attempt||':'||COALESCE(result_hash,'')) ORDER BY updated_at ASC LIMIT 5",[],1440,1440]
 ];
 for(const [name,oldSql,newSql,args,beforeRuns,afterRuns]of cases){const r=await db.prepare(oldSql).bind(...args).all();out.results.push({name,beforeReads:r.meta.rows_read,beforeRuns,afterRuns,sql:newSql||oldSql,args});}
 for(const f of migrations.filter(f=>Number(f.slice(0,4))>=4))await migrate(f);
 for(const r of out.results){const v=await db.prepare(r.sql).bind(...r.args).all();r.afterReads=v.meta.rows_read;r.beforeDaily=r.beforeReads*r.beforeRuns;r.afterDaily=r.afterReads*r.afterRuns;delete r.args;}
 console.log(JSON.stringify(out,null,2));
}finally{await mf.dispose();}})().catch(e=>{console.error(e);process.exitCode=1;});
