'use strict';

function createDiagnostics({ api, providers, generationConfig }) {
  let active = null, lastRun = null, nextRunAt = 0;
  const labels = { gemini: 'Gemini', deepseek: 'DeepSeek', openai: 'OpenAI' };
  function snapshot() {
    const configs = providers();
    return { ...api.snapshot(), running: Boolean(active), lastRun, nextRunAt,
      providers: Object.entries(configs).map(([id, config]) => ({ id, name: labels[id], configured: Boolean(config.key), model: config.model || '', enabled: config.enabled !== false })),
      limitations: 'Kiểm tra văn bản/JSON/function call. Tạo ảnh, video và nghiệp vụ được theo dõi qua lượt sử dụng thật; chưa kiểm tra không có nghĩa là hoạt động.' };
  }
  async function probe(provider, config, kind) {
    const context = 'probe:' + provider + ':' + kind;
    const startedAt = new Date().toISOString();
    let url, body, headers, validate;
    const schema = { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'], additionalProperties: false };
    if (provider === 'gemini') {
      url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(config.model) + ':generateContent';
      headers = { 'x-goog-api-key': config.key, 'Content-Type': 'application/json' };
      body = { contents: [{ role: 'user', parts: [{ text: kind === 'tools' ? 'Call kbl_diagnostic_echo with value KBL_OK. Do not answer in text.' : kind === 'json' ? 'Return JSON with answer equal to KBL_OK.' : 'Reply exactly KBL_OK.' }] }], generationConfig: generationConfig(config.model, { thinkingLevel: 'low', maxOutputTokens: 2048, ...(kind === 'json' ? { responseMimeType: 'application/json', responseSchema: schema } : {}) }), store: false };
      if (kind === 'tools') {
        body.tools = [{ functionDeclarations: [{ name: 'kbl_diagnostic_echo', description: 'Read-only diagnostic echo; no business operations.', parameters: { type: 'OBJECT', properties: { value: { type: 'STRING' } }, required: ['value'] } }] }];
        body.toolConfig = { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['kbl_diagnostic_echo'] } };
      }
      validate = payload => {
        const parts = (payload?.candidates || []).flatMap(x => x.content?.parts || []).filter(x => !x.thought);
        if (kind === 'tools') return parts.some(p => p.functionCall?.name === 'kbl_diagnostic_echo' && p.functionCall?.args?.value === 'KBL_OK');
        const text = parts.map(x => x.text || '').join('').trim();
        return kind === 'json' ? JSON.parse(text).answer === 'KBL_OK' : text === 'KBL_OK';
      };
    } else if (provider === 'deepseek') {
      url = config.base + '/chat/completions';
      headers = { Authorization: 'Bearer ' + config.key, 'Content-Type': 'application/json' };
      body = { model: config.model, messages: [{ role: 'user', content: 'Return JSON: {"answer":"KBL_OK"}' }], thinking: { type: 'disabled' }, response_format: { type: 'json_object' }, max_tokens: 128 };
      validate = payload => JSON.parse(payload?.choices?.[0]?.message?.content || '').answer === 'KBL_OK';
    } else {
      url = 'https://api.openai.com/v1/responses';
      headers = { Authorization: 'Bearer ' + config.key, 'Content-Type': 'application/json' };
      body = { model: config.model, input: 'Return JSON with answer equal to KBL_OK.', text: { format: { type: 'json_schema', name: 'kbl_diagnostic', strict: true, schema } }, max_output_tokens: 2048, store: false };
      validate = payload => JSON.parse(payload?.output_text || (payload?.output || []).flatMap(x => x.content || []).filter(x => x.type === 'output_text').map(x => x.text).join('')).answer === 'KBL_OK';
    }
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await api.fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal }, context);
      const payload = await response.json();
      const latest = api.snapshot().events.find(e => e.context === context && e.at >= startedAt);
      if (!response.ok || latest?.ok === false) return { provider, kind, model: config.model, ...latest, ok: false };
      let valid = false; try { valid = validate(payload); } catch (_) {}
      return api.record({ provider, model: config.model, context, operation: latest?.operation || kind, status: response.status, ok: valid, code: valid ? 'OK' : 'INVALID_OUTPUT', message: valid ? 'Phản hồi đúng yêu cầu kiểm tra ' + kind + '.' : 'API trả nội dung sai hoặc thiếu cấu trúc kiểm tra ' + kind + '.' });
    } catch (_) {
      const latest = api.snapshot().events.find(e => e.context === context && e.at >= startedAt);
      return { provider, kind, model: config.model, ...latest, ok: false, code: latest?.code || 'INVALID_JSON' };
    } finally { clearTimeout(timer); }
  }
  async function run() {
    if (active) return active;
    if (Date.now() < nextRunAt) return { ...lastRun, cached: true };
    nextRunAt = Date.now() + 60000;
    active = (async () => {
      const checks = [], configs = providers();
      await Promise.all(Object.entries(configs).map(async ([provider, config]) => {
        if (!config.key || config.enabled === false) {
          checks.push({ provider, model: config.model, ok: false, skipped: true, code: config.enabled === false ? 'DISABLED' : 'MISSING_KEY', message: config.enabled === false ? 'Đang tắt trong cấu hình.' : 'Chưa cấu hình API key.' });
          return;
        }
        for (const kind of provider === 'gemini' ? ['text', 'json', 'tools'] : ['json']) {
          const result = await probe(provider, config, kind); checks.push({ ...result, kind });
          if (['AUTH', 'PERMISSION', 'BILLING', 'QUOTA', 'NETWORK', 'TIMEOUT', 'MODEL'].includes(result.code)) break;
        }
      }));
      const required = checks.filter(x => !x.skipped);
      lastRun = { at: new Date().toISOString(), ok: required.length > 0 && required.every(x => x.ok), checks };
      return lastRun;
    })();
    try { return await active; } finally { active = null; }
  }
  return { snapshot, run };
}

module.exports = { createDiagnostics };
