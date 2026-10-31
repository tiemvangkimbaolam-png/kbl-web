import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url), {validateConfig,startupPlan}=require('../windows/setup.cjs');
const good={id:'worker-1',token:'a'.repeat(64),serverUrl:'https://kbl.example/'};
test('Windows setup validates downloaded credentials without exposing the token in its diagnostic result',()=>{
 assert.deepEqual(validateConfig(good),{id:'worker-1',serverUrl:'https://kbl.example'});
 for(const patch of [{id:'../bad'},{token:'secret'},{serverUrl:'http://kbl.example'},{serverUrl:'https://user:pass@kbl.example/'},{serverUrl:'https://kbl.example/admin'},{serverUrl:'https://kbl.example/?token=secret'}]) assert.throws(()=>validateConfig({...good,...patch}));
});
test('startup only invokes the bundled reversible script with separate literal arguments',()=>{
 const root='D:\\không xóa & giữ nguyên\\KBL Windows';
 const plan=startupPlan(root,'disable');
 assert.equal(plan.options.shell,false); assert.equal(plan.args.at(-1),'disable');
 assert.equal(plan.args[3],path.join(root,'CAI_TU_KHOI_DONG.ps1'));
 assert.throws(()=>startupPlan(root,'disable; remove-all'));
});
