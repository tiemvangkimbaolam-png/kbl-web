'use strict';

// Text-only fallback. The caller must provide verified evidence; this adapter
// cannot perform a web search or generate images.
function matchesSchema(value, schema) {
  if (!schema || typeof schema !== 'object') return true;
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return false;
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const props = schema.properties || {};
    if ((schema.required || []).some(key => !Object.prototype.hasOwnProperty.call(value, key))) return false;
    if (schema.additionalProperties === false && Object.keys(value).some(key => !Object.prototype.hasOwnProperty.call(props, key))) return false;
    return Object.entries(value).every(([key, item]) => !props[key] || matchesSchema(item, props[key]));
  }
  if (schema.type === 'array') return Array.isArray(value) && value.every(item => matchesSchema(item, schema.items));
  if (schema.type === 'string') return typeof value === 'string';
  if (schema.type === 'boolean') return typeof value === 'boolean';
  if (schema.type === 'integer') return Number.isInteger(value);
  if (schema.type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return true;
}

async function generateDeepSeekJson({ fetch, baseUrl, key, model, system, prompt, schema, schemaName, timeoutMs, maxOutputTokens, temperature }) {
  if (!key || !model) throw new Error('DeepSeek chưa có API key hoặc model.');
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model, store: false, reasoning: { effort: 'none' },
        max_output_tokens: maxOutputTokens, temperature,
        instructions: `${system}\nChỉ dùng bằng chứng có trong yêu cầu. Không tự tạo nguồn, dữ kiện hay tuyên bố chưa xác minh. Trả đúng JSON theo schema.`,
        input: prompt,
        text: { format: { type: 'json_schema', name: schemaName, schema } }
      })
    }, 'kblMasterGenerateJsonDeepSeek');
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}: ${String(payload.error?.message || 'API error').slice(0, 200)}`);
    if (payload.status !== 'completed') throw new Error(`DeepSeek chưa hoàn tất: ${String(payload.incomplete_details?.reason || payload.status || 'unknown').slice(0, 100)}`);
    const raw = typeof payload.output_text === 'string' ? payload.output_text :
      (payload.output || []).flatMap(item => item?.type === 'message' ? item.content || [] : [])
        .filter(part => part?.type === 'output_text').map(part => part.text || '').join('');
    if (!raw.trim()) throw new Error('DeepSeek trả JSON rỗng.');
    let data;
    try { data = JSON.parse(raw); } catch (_) { throw new Error('DeepSeek trả JSON không hợp lệ.'); }
    if (!matchesSchema(data, schema)) throw new Error('DeepSeek trả JSON không khớp schema.');
    return { data, model, attempt: 1, provider: 'deepseek-fallback' };
  } finally { clearTimeout(timer); }
}

module.exports = { generateDeepSeekJson, matchesSchema };
