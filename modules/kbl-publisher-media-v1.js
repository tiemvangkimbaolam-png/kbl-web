'use strict';

// Publisher helpers. No credentials, network posts, transcoding or background work on import.
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const TELEGRAM_VIDEO_LIMIT = 50_000_000;
const TELEGRAM_PHOTO_LIMIT = 10_000_000;

function redact(value, max = 600) {
  return String(value == null ? '' : value)
    .replace(/(access_token|refresh_token|client_secret|app_secret|upload_token)([=\s:"']+)[^&\s"'<>]+/gi, '$1$2[REDACTED]')
    .replace(/\/bot\d+:[A-Za-z0-9_-]+/g, '/bot[REDACTED]')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').slice(0, max);
}

function apiError(data, label, status) {
  const err = data && typeof data.error === 'object' ? data.error : {};
  const detail = data && (data.error_description || err.message || data.description || data.message);
  const code = err.code || (data && data.error_code) || '';
  const subcode = err.error_subcode || err.subcode || '';
  let message = `${label}: ${detail || 'HTTP ' + status}`;
  if (code) message += ` [code ${code}${subcode ? ', subcode ' + subcode : ''}]`;
  if (Number(status) === 413) message += ' — Yêu cầu tải lên quá lớn; kiểm tra dung lượng file và giới hạn API/proxy.';
  const error = new Error(redact(message, 600));
  error.httpStatus = Number(status) || 0;
  error.providerCode = String(code);
  return error;
}

function containerError(platform, code, detail) {
  const name = platform === 'instagram' ? 'Instagram' : 'Threads';
  const raw = redact(detail || code, 220);
  const generic = !raw || /^(UNKNOWN|ERROR|EXPIRED)$/i.test(raw);
  if (generic) return `${name}: container ${code || 'ERROR'} (${raw || 'không có chi tiết'}). API chưa nêu nguyên nhân; bấm KIỂM TRA MEDIA để kiểm tra URL, dung lượng và định dạng video.`;
  return redact(`${name}: ${raw}${/2207077/.test(raw) ? ' — Lỗi nhận/xử lý media; cần kiểm tra media trước khi kết luận lỗi liên kết.' : ''}`, 400);
}

function youtubeState(resource, previous = {}) {
  const status = resource && resource.status || {};
  const processing = resource && resource.processingDetails || {};
  const visibility = String(status.privacyStatus || '');
  const requestedVisibility = String(previous.requestedVisibility || '');
  const uploadStatus = String(status.uploadStatus || '');
  const processingStatus = String(processing.processingStatus || '');
  const result = { ...previous, visibility, requestedVisibility, uploadStatus, processingStatus,
    lastCheckedAt: new Date().toISOString(), stage: 'youtube-processing' };
  if (['failed', 'rejected', 'deleted'].includes(uploadStatus) || ['failed', 'terminated'].includes(processingStatus)) {
    return { ...result, status: 'failed', stage: 'youtube-failed',
      message: redact(`YouTube: ${uploadStatus || processingStatus} — ${status.failureReason || status.rejectionReason || processing.processingFailureReason || 'nền tảng không xử lý được video'}.`, 300) };
  }
  if ((uploadStatus !== 'processed' && processingStatus !== 'succeeded') || !['public', 'private', 'unlisted'].includes(visibility)) {
    return { ...result, status: 'processing', message: `YouTube đã nhận file; đang xác nhận xử lý và quyền xem (${uploadStatus || processingStatus || 'chưa có trạng thái'}).` };
  }
  if (requestedVisibility && requestedVisibility !== visibility) {
    return { ...result, status: 'needs_attention', stage: 'youtube-visibility',
      message: `YouTube đã xử lý xong, thực tế ${visibility}; yêu cầu ${requestedVisibility}. Mở YouTube Studio kiểm tra quyền xem/giới hạn dự án API. Kiểm tra lại bài hiện có, không cần tải lại video.` };
  }
  return { ...result, status: 'published', stage: 'published',
    message: `YouTube xác nhận xử lý xong · ${visibility === 'public' ? 'CÔNG KHAI' : visibility === 'private' ? 'RIÊNG TƯ' : 'KHÔNG CÔNG KHAI (có link mới xem)'}.` };
}

function tiktokChunks(size) {
  if (!Number.isSafeInteger(size) || size < 1) throw new Error('TikTok: file video trống hoặc dung lượng không hợp lệ.');
  // Decimal MB is conservative for both documented MB and binary MiB limits.
  const chunkSize = size <= 64_000_000 ? size : 20_000_000;
  const count = Math.floor(size / chunkSize);
  if (count < 1 || count > 1000) throw new Error('TikTok: số phần upload ngoài giới hạn.');
  const chunks = Array.from({ length: count }, (_, i) => ({ start: i * chunkSize,
    end: i === count - 1 ? size : (i + 1) * chunkSize }));
  return { chunkSize, count, chunks };
}

function mimeFor(src) {
  const ext = path.extname(String(src).split('?')[0]).toLowerCase();
  return ({ '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' })[ext] || 'application/octet-stream';
}

async function readLimitedResponse(response, max) {
  const size = Number(response.headers.get('content-length') || 0);
  if (size > max) { await response.body?.cancel().catch(() => {}); throw new Error(`Media lớn hơn giới hạn ${(max / 1_000_000).toFixed(0)} MB.`); }
  const reader = response.body && response.body.getReader();
  if (!reader) throw new Error('Media không có nội dung tải về.');
  const parts = []; let bytes = 0;
  try {
    while (true) {
      const item = await reader.read(); if (item.done) break;
      bytes += item.value.byteLength;
      if (bytes > max) throw new Error(`Media lớn hơn giới hạn ${(max / 1_000_000).toFixed(0)} MB.`);
      parts.push(Buffer.from(item.value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(parts, bytes);
}

async function openMedia(src, localPath, maxBytes, fetchImpl = globalThis.fetch) {
  if (localPath) {
    const stat = await fs.promises.stat(localPath);
    if (!stat.isFile() || stat.size < 1) throw new Error('Media không phải file hoặc file trống.');
    if (stat.size > maxBytes) throw new Error(`File ${(stat.size / 1_000_000).toFixed(1)} MB vượt giới hạn ${(maxBytes / 1_000_000).toFixed(0)} MB của lần gửi này.`);
    return { size: stat.size, contentType: mimeFor(localPath), localPath,
      async read(start = 0, end = stat.size) {
        if (start < 0 || end > stat.size || end <= start) throw new Error('Khoảng đọc media không hợp lệ.');
        const handle = await fs.promises.open(localPath, 'r');
        try {
          const data = Buffer.alloc(end - start); let offset = 0;
          while (offset < data.length) {
            const { bytesRead } = await handle.read(data, offset, data.length - offset, start + offset);
            if (!bytesRead) throw new Error('File media đã thay đổi trong lúc tải lên.');
            offset += bytesRead;
          }
          return data;
        } finally { await handle.close(); }
      }, stream() { return fs.createReadStream(localPath); } };
  }
  const url = new URL(src);
  if (url.protocol !== 'https:') throw new Error('Media từ xa phải dùng HTTPS.');
  const signal = AbortSignal.timeout(180_000);
  const response = await fetchImpl(url.href, { signal });
  if (!response.ok) { await response.body?.cancel().catch(() => {}); throw new Error(`Không tải được media: HTTP ${response.status}.`); }
  const data = await readLimitedResponse(response, maxBytes);
  if (!data.length) throw new Error('Media tải về bị trống.');
  return { size: data.length, contentType: response.headers.get('content-type') || mimeFor(src),
    localPath: '', async read(start = 0, end = data.length) { return data.subarray(start, end); }, stream() { return data; } };
}

function probeEncoding(localPath, executable = process.env.KBL_FFPROBE_PATH || 'ffprobe') {
  if (!localPath) return Promise.resolve({ available: false, note: 'Không có file cục bộ để kiểm tra codec.' });
  return new Promise(resolve => execFile(executable, ['-v', 'error', '-show_entries',
    'format=format_name,duration,size:stream=codec_type,codec_name,width,height,pix_fmt,r_frame_rate,field_order',
    '-of', 'json', localPath], { timeout: 6000, maxBuffer: 64 * 1024, windowsHide: true }, (error, stdout) => {
    if (error) return resolve({ available: false, note: error.code === 'ENOENT' ? 'Hosting chưa có ffprobe; chưa kiểm tra được codec.' : 'ffprobe chưa đọc được file video.' });
    try {
      const data = JSON.parse(stdout), video = (data.streams || []).find(x => x.codec_type === 'video') || {};
      const audio = (data.streams || []).find(x => x.codec_type === 'audio') || {};
      resolve({ available: true, format: data.format?.format_name || '', duration: Number(data.format?.duration) || 0,
        videoCodec: video.codec_name || '', audioCodec: audio.codec_name || '', width: video.width || 0,
        height: video.height || 0, pixelFormat: video.pix_fmt || '', frameRate: video.r_frame_rate || '', fieldOrder: video.field_order || '' });
    } catch (_) { resolve({ available: false, note: 'ffprobe trả dữ liệu chưa đọc được.' }); }
  }));
}

const probeCache = new Map();
async function inspectMedia(url, localPath, platform, fetchImpl = globalThis.fetch) {
  let stat = null;
  if (localPath) stat = await fs.promises.stat(localPath);
  const key = `${url}|${stat?.size || 0}|${stat?.mtimeMs || 0}|${platform}`;
  const cached = probeCache.get(key);
  if (cached && cached.until > Date.now()) return cached.promise;
  const promise = (async () => {
    const issues = [], warnings = [], parsed = new URL(url);
    const report = { platform, url: parsed.origin + parsed.pathname, localBytes: stat?.size || 0, httpStatus: 0,
      contentType: '', remoteBytes: 0, rangeSupported: false, issues, warnings,
      note: 'Kiểm tra từ hosting KBL; chưa chứng minh máy chủ Meta/TikTok cũng tải được file.' };
    if (parsed.protocol !== 'https:') { issues.push('Media phải có URL HTTPS công khai.'); return { ...report, ok: false }; }
    let head = Buffer.alloc(0);
    try {
      const response = await fetchImpl(url, { method: 'GET', headers: { Range: 'bytes=0-1023', Accept: '*/*' }, signal: AbortSignal.timeout(12000) });
      report.httpStatus = response.status;
      report.contentType = (response.headers.get('content-type') || '').toLowerCase();
      report.rangeSupported = response.status === 206;
      report.remoteBytes = response.status === 206 ? Number((response.headers.get('content-range') || '').split('/')[1]) || 0 : Number(response.headers.get('content-length') || 0);
      const reader = response.body && response.body.getReader();
      if (reader) {
        try {
          const parts = []; let read = 0;
          while (read < 1024) {
            const chunk = await reader.read(); if (chunk.done) break;
            const part = Buffer.from(chunk.value).subarray(0, 1024 - read);
            parts.push(part); read += part.length;
          }
          head = Buffer.concat(parts, read);
        }
        finally { await reader.cancel().catch(() => {}); }
      }
      if (!response.ok) issues.push(`URL media trả HTTP ${response.status}; kiểm tra file, quyền truy cập và hosting/CDN.`);
      else if (/text\/html|application\/json/.test(report.contentType)) issues.push('URL trả trang HTML/JSON thay vì file media; kiểm tra chuyển hướng, trang đăng nhập hoặc chống bot.');
      else if (!head.length) issues.push('URL media trả nội dung trống.');
      if (response.ok && !report.rangeSupported) warnings.push('Hosting chưa trả HTTP 206 cho yêu cầu đọc từng phần; cần kiểm tra hỗ trợ Range nếu nền tảng không tải được video.');
    } catch (error) { issues.push(redact(`Không đọc được URL media trong 12 giây: ${error.message}`, 240)); }
    const isVideo = /^video\//.test(report.contentType) || /\.(mp4|mov|webm)$/i.test(parsed.pathname) || head.subarray(4, 8).toString('ascii') === 'ftyp';
    if (isVideo && ['instagram', 'threads'].includes(platform)) {
      if (/webm/i.test(report.contentType) || head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) issues.push('Instagram/Threads cần MP4 hoặc MOV; file này là WebM. Xuất một bản video phù hợp rồi duyệt lại.');
      const encoding = await probeEncoding(localPath); report.encoding = encoding;
      if (!encoding.available) warnings.push(encoding.note);
      else {
        if (!/(^|,)(mov|mp4)(,|$)/.test(encoding.format)) issues.push('Container video không phải MP4/MOV.');
        if (!['h264', 'hevc'].includes(encoding.videoCodec)) issues.push(`Codec video ${encoding.videoCodec || 'không rõ'} không thuộc H.264/HEVC của Meta.`);
        if (encoding.audioCodec && encoding.audioCodec !== 'aac') warnings.push(`Audio hiện là ${encoding.audioCodec}; nên xuất bản dùng AAC để tương thích Meta.`);
      }
    } else if (platform === 'instagram' && head.length && !(head[0] === 0xff && head[1] === 0xd8)) issues.push('Bài ảnh Instagram cần file JPEG thật; đổi đuôi file không chuyển đổi định dạng.');
    return { ...report, ok: issues.length === 0 };
  })();
  if (probeCache.size >= 40) probeCache.delete(probeCache.keys().next().value);
  probeCache.set(key, { until: Date.now() + 60_000, promise });
  try { return await promise; } catch (error) { probeCache.delete(key); throw error; }
}

module.exports = { TELEGRAM_VIDEO_LIMIT, TELEGRAM_PHOTO_LIMIT, redact, apiError, containerError,
  youtubeState, tiktokChunks, mimeFor, openMedia, inspectMedia, probeEncoding };
