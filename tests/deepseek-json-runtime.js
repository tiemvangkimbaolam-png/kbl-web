'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { matchesSchema } = require('../modules/kbl-deepseek-json');

const schema = { type: 'object', additionalProperties: false, properties: { answer: { type: 'string' } }, required: ['answer'] };
assert(matchesSchema({ answer: 'verified' }, schema));
assert(!matchesSchema({ answer: 42 }, schema));
assert(!matchesSchema({ answer: 'verified', inventedClaim: true }, schema));

// Exercise the actual route adapter without loading Express, customer data or keys.
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const start = source.indexOf('async function kblMasterGenerateJson(');
const end = source.indexOf('function kblMasterOpportunitySchema()', start);
assert(start >= 0 && end > start);
const adapter = source.slice(start, end);

async function scenario(deepSeekPayload, enabled = true, dedicatedFreeKey = false) {
  const calls = [], events = [];
  const ctx = {
    fetch: () => {}, AbortController, setTimeout, clearTimeout, Response,
    KBL_AI_V4_PRO_ENABLED: false, KBL_AI_MASTER_BRAIN_TIMEOUT_MS: 60000,
    GEMINI_API_KEY: 'fixture-gemini', GEMINI_TEXT_MODEL: 'gemini-3.6-flash',
    GEMINI_TEXT_API_KEY: dedicatedFreeKey ? 'fixture-free-project' : 'fixture-gemini',
    GEMINI_ECONOMY_TEXT_MODEL: 'gemini-2.5-flash', KBL_ALLOW_PAID_TEXT_FALLBACK: false,
    DEEPSEEK_API_KEY: 'fixture-deepseek', KBL_PROMPT_DEEPSEEK_BASE: 'https://api.deepseek.com',
    KBL_AI_V8_PROVIDER_FALLBACK_ENABLED: enabled, OPENAI_API_KEY: '',
    KBL_AI_MASTER_CONTRACT: 'Only verified facts.',
    number: (x, fallback) => Number(x) || fallback,
    cleanLabelText: value => String(value || ''),
    plainVietnamese: value => String(value || ''),
    geminiModelCandidates: () => ['gemini-3.6-flash', 'gemini-3.7-flash'],
    geminiTextGenerationConfig: () => ({}),
    kblPromptDeepSeekRuntimeModel: () => 'deepseek-flash',
    kblAiApi: { redact: value => String(value || '') },
    kblAiMasterDiag: (...args) => events.push(args),
    generateDeepSeekJson: require('../modules/kbl-deepseek-json').generateDeepSeekJson,
    kblAiFetch: async (url, opts) => {
      calls.push({ url, body: JSON.parse(opts.body) });
      return url.includes('generativelanguage.googleapis.com')
        ? new Response(JSON.stringify({ error: { message: 'Your prepayment credits are depleted.' } }), { status: 402 })
        : new Response(JSON.stringify(deepSeekPayload), { status: 200 });
    }
  };
  const run = vm.runInNewContext(adapter + '\nkblMasterGenerateJson', ctx);
  const result = await run('Evidence only', '{"source":"verified"}', schema, { stage: 'market-analysis' });
  return { result, calls, events };
}

(async () => {
  const good = await scenario({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"answer":"verified"}' }] }] });
  assert.equal(good.result.provider, 'deepseek-fallback');
  assert.equal(good.result.data.answer, 'verified');
  assert.equal(good.calls.filter(x => x.url.includes('googleapis.com')).length, 1, '402 must skip other paid Gemini models');
  assert.equal(good.calls.filter(x => x.url.endsWith('/responses')).length, 1);
  assert.equal(good.calls[1].body.text.format.type, 'json_schema');
  assert.equal(good.calls[1].body.reasoning.effort, 'none');

  const invalid = await scenario({ status: 'completed', output_text: '{"answer":42}' });
  assert.equal(invalid.result, null, 'unverified schema must not be accepted');
  const disabled = await scenario({ status: 'completed', output_text: '{"answer":"verified"}' }, false);
  assert.equal(disabled.calls.length, 1, 'fallback setting must be respected');
  assert.equal(disabled.result, null);
  const freeQuota = await scenario({status:'completed',output_text:'{"answer":"verified"}'}, true, true);
  assert.equal(freeQuota.calls.length, 1, 'Free project billing/quota failure must never auto-spend on DeepSeek/OpenAI');
  assert.equal(freeQuota.result, null);
  console.log('DEEPSEEK_JSON_OK: billing 402 skips duplicate Gemini calls; verified JSON uses DeepSeek only when enabled');
})().catch(error => { console.error(error); process.exitCode = 1; });
