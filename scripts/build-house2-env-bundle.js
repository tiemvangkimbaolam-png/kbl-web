'use strict';

const fs = require('fs');
const path = require('path');

const source = path.resolve(process.argv[2] || '.env');
const outputDir = path.resolve(process.argv[3] || 'data/.house2-secrets');
const MAX_PART = 4400; // comfortably below Cloudflare's 5 KB value limit.

if (!fs.existsSync(source)) {
  console.error(`Không tìm thấy file env: ${source}`);
  process.exit(1);
}

function parseEnv(text) {
  const out = {};
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2] || '';
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value.replace(/\\n/g, '\n');
  }
  return out;
}

const env = parseEnv(fs.readFileSync(source, 'utf8'));
for (const key of ['PORT', 'HOST', 'NODE_ENV', 'KBL_DATA_DIR', 'KBL_HOUSE2_RUNTIME', 'KBL_BACKUP_SYNC_URL']) delete env[key];
const payload = JSON.stringify(env);
if (!Object.keys(env).length) {
  console.error('File env không có biến nào để đóng gói.');
  process.exit(1);
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });
const parts = [];
for (let i = 0; i < payload.length; i += MAX_PART) parts.push(payload.slice(i, i + MAX_PART));
if (parts.length > 8) {
  console.error(`Env bundle cần ${parts.length} phần, vượt giới hạn 8 phần. Hãy bỏ biến không dùng hoặc chuyển secret lớn sang cấu hình riêng.`);
  process.exit(2);
}
parts.forEach((part, index) => fs.writeFileSync(path.join(outputDir, `KBL_HOUSE2_ENV_BUNDLE_${index + 1}.txt`), part, { mode: 0o600 }));
fs.writeFileSync(path.join(outputDir, 'README.txt'), [
  'KHÔNG COMMIT THƯ MỤC NÀY. Mặc định nó nằm trong data/ đã được gitignore.',
  'Cloudflare -> kbl-backup -> Settings -> Variables and Secrets:',
  ...parts.map((_, i) => `- Secret: KBL_HOUSE2_ENV_BUNDLE_${i + 1}  (copy toàn bộ nội dung file cùng tên)`),
  '- Secret: KBL_R2_ACCOUNT_ID',
  '- Secret: KBL_R2_ACCESS_KEY_ID',
  '- Secret: KBL_R2_SECRET_ACCESS_KEY',
  '- Giữ nguyên Secret KBL_BACKUP_SYNC_SECRET hiện có.',
  '',
  `Đã đóng gói ${Object.keys(env).length} biến thành ${parts.length} phần.`
].join('\n'), { mode: 0o600 });
console.log(`Đã tạo ${parts.length} phần secret tại ${outputDir}. KHÔNG commit thư mục này.`);
