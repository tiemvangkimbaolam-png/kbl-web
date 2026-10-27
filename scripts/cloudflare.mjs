import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkConfig } from '../cloudflare/config-check.mjs';
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
    const readiness = checkConfig(config, { publicStaging: true });
    if (!readiness.adminReady) console.log('Triển khai lên Worker thử; Admin vẫn bị khóa vì chưa có AUD. Chưa nghiệm thu và chưa chuyển miền.');
    const output = JSON.parse(fs.readFileSync('dist/server/wrangler.json', 'utf8'));
    if (output.name !== config.name || output.d1_databases?.[0]?.database_id !== config.d1_databases[0].database_id || output.r2_buckets?.[0]?.bucket_name !== config.r2_buckets[0].bucket_name || JSON.stringify(output.vars) !== JSON.stringify(config.vars) || !fs.readFileSync('dist/server/index.js', 'utf8').includes('cf-access-jwt-assertion')) throw Error('Build chưa đúng cấu hình Cloudflare hiện tại. Chạy build:cloudflare lại.');
    // Always target the new database. No migrations/backups touch kbl-backup.
    wrangler('d1', 'migrations', 'apply', 'DB', '--remote', '--config', configPath);
    wrangler('deploy', '--config', 'dist/server/wrangler.json');
} else throw Error('Dùng: node scripts/cloudflare.mjs login|check|build|deploy');

function check() {
    checkConfig(config);
    console.log('Cấu hình tài nguyên mới hợp lệ; chưa thay DNS hay Worker cũ.');
}
