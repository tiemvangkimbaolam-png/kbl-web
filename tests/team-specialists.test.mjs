import {test} from 'node:test';
import assert from 'node:assert/strict';
import {preferredSpecialist} from '../lib/kbl/team-specialists.mjs';
const at=1800000000000;
const accounts=['deepseek','claude','gemini','chatgpt','grok'].map(provider=>({id:provider,provider,enabled:true,paired:true,status:'ready',lastSeen:at,roles:['research','write','review','image','image-review']}));
test('owner specialization prefers DeepSeek writing, Claude independent review and Gemini then ChatGPT imagery',()=>{
    assert.equal(preferredSpecialist(accounts,'write',{at}),'deepseek');
    assert.equal(preferredSpecialist(accounts,'review',{at,exclude:'deepseek'}),'claude');
    assert.equal(preferredSpecialist(accounts,'image',{at}),'gemini');
    assert.equal(preferredSpecialist(accounts,'image',{at,busy:['gemini']}),'chatgpt');
});
test('unpaired/stale/disabled/quota/busy preferred accounts cannot starve a ready fallback or review their own work',()=>{
    const state=structuredClone(accounts);
    state[0].paired=false;state[1].lastSeen=at-90001;state[2].enabled=false;state[3].status='quota';
    assert.equal(preferredSpecialist(state,'write',{at}),'grok');
    assert.equal(preferredSpecialist(accounts,'review',{at,exclude:'claude',busy:['deepseek','chatgpt','gemini','grok']}),null);
    assert.equal(preferredSpecialist(state,'image',{at}),null);
});
