'use strict';

// Provider-only transport. Never logs prompts, images, responses or credentials.
// The bounded in-memory diagnostics are exposed only behind the existing Admin auth.
const RELEASE = '1.3.11-ai-api-recovery';
const HINTS = {
  AUTH: 'Kiểm tra API key trong biến môi trường của tiến trình Node, rồi khởi động lại ứng dụng.',
  PERMISSION: 'Kiểm tra quyền API/project, giới hạn key và quyền dùng model.',
  BILLING: 'Kiểm tra số dư hoặc billing của tài khoản API.',
  QUOTA: 'Kiểm tra quota/rate limit của model và tài khoản API.',
  MODEL: 'Kiểm tra model hiện có cho API key; dùng nút kiểm tra model trong Admin.',
  REQUEST: 'Nhà cung cấp từ chối cấu trúc/tham số request; xem thông báo đã che thông tin nhạy cảm.',
  TIMEOUT: 'Nhà cung cấp chưa trả xong trong thời hạn; kiểm tra kết nối outbound và thời gian xử lý.',
  NETWORK: 'Kiểm tra DNS, TLS và kết nối HTTPS từ hosting đến nhà cung cấp.',
  PROVIDER: 'Nhà cung cấp đang lỗi; thử lại sau.',
  MAX_TOKENS: 'Model hết ngân sách token trước khi trả đủ nội dung.',
  BLOCKED: 'Nhà cung cấp chặn nội dung; kiểm tra yêu cầu và chính sách của model.',
  EMPTY: 'API trả HTTP thành công nhưng không có nội dung dùng được.',
  INVALID_JSON: 'Phản hồi không phải JSON hợp lệ; kiểm tra proxy và nhà cung cấp.',
  MISSING_KEY: 'Chưa cấu hình API key trên tiến trình Node.',
  RUNTIME: 'Runtime cần Node có fetch, Response và AbortController (Node 20+).'
};

function createAiApi(options = {}) {
  const events = [];
  const startedAt = new Date().toISOString();
  const secrets = () => (typeof options.secrets === 'function' ? options.secrets() : []).filter(Boolean);
  function redact(value) {
    let text = String(value || '');
    for (const secret of secrets()) text = text.split(String(secret)).join('[REDACTED]');
    return text.replace(/Bearer\s+[^\s"',;]+/gi, 'Bearer [REDACTED]')
      .replace(/AIza[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{12,}/g, '[REDACTED]')
      .replace(/https?:\/\/[^\s"<>]+/g, '[URL]')
      .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL]')
      .replace(/\s+/g, ' ').slice(0, 500);
  }
  function record(row) {
    const clean = { at: new Date().toISOString(), ...row, message: redact(row.message), hint: HINTS[row.code] || '' };
    events.push(clean);
    if (events.length > 120) events.shift();
    return clean;
  }
  function failure(status, payload, error) {
    const message = String(payload?.error?.message || payload?.message || error?.cause?.code || error?.message || `HTTP ${status}`);
    let code = 'PROVIDER';
    if (error) code = /abort|timeout/i.test(error.name + ' ' + message) ? 'TIMEOUT' : 'NETWORK';
    else if (status === 401 || /API_KEY_INVALID|API key not valid|invalid api key/i.test(message)) code = 'AUTH';
    else if (status === 402 || /insufficient.*(?:balance|credit)|billing|balance.*insufficient/i.test(message)) code = 'BILLING';
    else if (status === 403) code = 'PERMISSION';
    else if (status === 429) code = 'QUOTA';
    else if (status === 404) code = 'MODEL';
    else if (status === 400 || status === 422) code = 'REQUEST';
    return { ok: false, code, message };
  }
  function outcome(payload, info) {
    if (payload?.error) return failure(Number(payload.error.code) || 502, payload);
    if (info.operation === 'generateContent') {
      const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
      const parts = candidates.flatMap(c => c.content?.parts || []).filter(p => !p.thought);
      const hasOutput = parts.some(p => typeof p.text === 'string' && p.text.trim() || p.functionCall || p.function_call || p.inlineData?.data || p.inline_data?.data);
      const finish = candidates.map(c => String(c.finishReason || '')).join(' ');
      if (/MAX_TOKENS/.test(finish)) return { ok: false, code: 'MAX_TOKENS', message: 'GenerateContent: MAX_TOKENS', empty: !hasOutput };
      if (payload?.promptFeedback?.blockReason || /SAFETY|RECITATION|BLOCKLIST|PROHIBITED|IMAGE_SAFETY/.test(finish)) return { ok: false, code: 'BLOCKED', message: 'GenerateContent: ' + (payload.promptFeedback?.blockReason || finish) };
      if (!hasOutput) return { ok: false, code: 'EMPTY', message: 'GenerateContent không có text, function call hoặc ảnh.' };
    } else if (info.operation === 'chat/completions') {
      const choice = payload?.choices?.[0];
      if (choice?.finish_reason === 'length') return { ok: false, code: 'MAX_TOKENS', message: 'Chat completion: length' };
      if (!choice?.message?.content?.trim() && !choice?.message?.tool_calls?.length) return { ok: false, code: 'EMPTY', message: 'Chat completion không có nội dung cuối.' };
    } else if (info.operation === 'responses') {
      if (payload?.status === 'incomplete') return { ok: false, code: 'MAX_TOKENS', message: 'Responses: incomplete' };
      if (!payload?.output_text && !payload?.output?.some(x => x.type === 'function_call' || x.content?.some(c => c.type === 'output_text' && c.text))) return { ok: false, code: 'EMPTY', message: 'Responses không có nội dung cuối.' };
    } else if (info.operation === 'interactions') {
      const blocks = (payload?.steps || []).filter(s => s.type === 'model_output').flatMap(s => s.content || []);
      if (!payload?.output_image?.data && !blocks.some(b => b.type === 'image' && b.data || b.type === 'text' && b.text)) return { ok: false, code: 'EMPTY', message: 'Interactions không có nội dung cuối hỗ trợ bởi ứng dụng.' };
    }
    return { ok: true, code: 'OK', message: 'Nhận được phản hồi API.' };
  }
  function describe(url, init, context) {
    const u = new URL(String(url));
    const provider = u.hostname === 'generativelanguage.googleapis.com' ? 'gemini' : u.hostname === 'api.openai.com' ? 'openai' : 'deepseek';
    const modelMatch = u.pathname.match(/\/models\/([^/:]+):/);
    const bodyModel = typeof init.body === 'string' && init.body.match(/"model"\s*:\s*"([a-z0-9._:-]+)"/i);
    const operation = u.pathname.includes(':') ? u.pathname.split(':').pop() : /\/chat\/completions$/.test(u.pathname) ? 'chat/completions' : u.pathname.split('/').pop();
    return { provider, model: modelMatch ? decodeURIComponent(modelMatch[1]) : bodyModel ? bodyModel[1] : '', operation, context: String(context || 'ai').slice(0, 100) };
  }
  async function request(url, init = {}, context = 'ai', retried = false) {
    const info = describe(url, init, context), started = Date.now();
    if (typeof globalThis.fetch !== 'function') { record({ ...info, ok: false, code: 'RUNTIME', status: 0, message: HINTS.RUNTIME }); throw new Error(HINTS.RUNTIME); }
    try {
      const response = await globalThis.fetch(url, init);
      // All these endpoints return JSON; file uploads/downloads keep their own transport.
      const raw = await response.text();
      let payload, result;
      try { payload = JSON.parse(raw); result = response.ok ? outcome(payload, info) : failure(response.status, payload); }
      catch (_) { result = response.ok ? { ok: false, code: 'INVALID_JSON', message: 'HTTP ' + response.status + ': phản hồi không phải JSON' } : failure(response.status, {}); }
      record({ ...info, status: response.status, durationMs: Date.now() - started, ...result });
      // One bounded recovery for a thinking-only text response. Never retry an
      // image, a chargeable video operation, an HTTP error or a policy refusal.
      if (!retried && info.operation === 'generateContent' && result.code === 'MAX_TOKENS' && result.empty && !init.signal?.aborted && typeof init.body === 'string' && !/inline_data|inlineData|file_data|fileData|responseModalities/.test(init.body)) {
        const body = JSON.parse(init.body), config = body.generationConfig;
        const previous = Number(config?.maxOutputTokens);
        if (previous > 0 && previous < 4096) {
          config.maxOutputTokens = Math.min(4096, Math.max(2048, previous * 2));
          return request(url, { ...init, body: JSON.stringify(body) }, context, true);
        }
      }
      const headers = new Headers(response.headers);
      headers.delete('content-length'); headers.delete('content-encoding');
      return new Response(raw, { status: response.status, statusText: response.statusText, headers });
    } catch (error) {
      record({ ...info, status: 0, durationMs: Date.now() - started, ...failure(0, null, error) });
      throw error;
    }
  }
  return {
    fetch: request, redact, record,
    snapshot: () => ({ release: RELEASE, scope: 'Provider responses observed in this Node process; successful API transport does not prove every feature passed.', startedAt, events: events.map(e => ({ ...e })).reverse() })
  };
}

module.exports = { createAiApi, RELEASE };
