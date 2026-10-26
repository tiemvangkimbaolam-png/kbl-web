import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
process.chdir(root);
const action = process.argv[2], configPath = 'wrangler.cloudflare.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
function run(file, args, env = {}) {
    const result = spawnSync(process.execPath, [file, ...args], { stdio: 'inherit', env: { ...process.env, ...env }, cwd: root, shell: false });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
}
const wrangler = (...args) => run('node_modules/wrangler/bin/wrangler.js', args);
if (action === 'login') wrangler('login');
else if (action === 'build') run('node_modules/vinext/dist/cli.js', ['build'], { KBL_HOSTING_TARGET: 'cloudflare' });
else if (action === 'check') check();
else if (action === 'deploy') {
    check();
    const output = JSON.parse(fs.readFileSync('dist/server/wrangler.json', 'utf8'));
    if (output.name !== config.name || output.d1_databases?.[0]?.database_id !== config.d1_databases[0].database_id || output.r2_buckets?.[0]?.bucket_name !== config.r2_buckets[0].bucket_name || JSON.stringify(output.vars) !== JSON.stringify(config.vars) || !fs.readFileSync('dist/server/index.js', 'utf8').includes('cf-access-jwt-assertion')) throw Error('Build chưa đúng cấu hình Cloudflare hiện tại. Chạy build:cloudflare lại.');
    // Always target the new database. No migrations/backups touch kbl-backup.
    wrangler('d1', 'migrations', 'apply', 'DB', '--remote', '--config', configPath);
    wrangler('deploy', '--config', 'dist/server/wrangler.json');
} else throw Error('Dùng: node scripts/cloudflare.mjs login|check|build|deploy');

function check() {
    if (config.name !== 'kbl-web-moi' || config.d1_databases?.[0]?.database_name !== 'kbl-web-moi-db' || config.r2_buckets?.[0]?.bucket_name !== 'kbl-web-moi-media') throw Error('Giữ tên tài nguyên mới để tránh ghi đè kbl-backup cũ.');
    const id = config.d1_databases[0].database_id;
    if (!/^[a-f0-9-]{36}$/.test(id) || id === '00000000-0000-4000-8000-000000000000') throw Error('Tạo D1 kbl-web-moi-db rồi điền Database ID vào wrangler.cloudflare.json.');
    if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(config.vars?.CF_ACCESS_TEAM_DOMAIN || '') || !/^[a-f0-9]{64}$/.test(config.vars?.CF_ACCESS_AUD || '')) throw Error('Điền Team domain và AUD của ứng dụng Cloudflare Access vào wrangler.cloudflare.json.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.vars?.OWNER_EMAIL || '') || config.vars?.KBL_AUTH_MODE !== 'cloudflare-access') throw Error('Chưa đặt email chủ Admin hoặc chế độ cloudflare-access.');
    if (config.routes?.length || config.route) throw Error('Kiểm tra trên workers.dev trước; chưa chuyển tên miền chính bằng script này.');
    console.log('Cấu hình tài nguyên mới hợp lệ; chưa thay DNS hay Worker cũ.');
}
