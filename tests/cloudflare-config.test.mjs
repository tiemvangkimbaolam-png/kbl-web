import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkConfig } from '../cloudflare/config-check.mjs';
import { createAccessGate } from '../lib/kbl/cloudflare-access.mjs';
const config = () => JSON.parse(fs.readFileSync('wrangler.cloudflare.json', 'utf8'));
test('missing AUD permits only a new workers.dev staging deploy; the runtime Admin still fails closed', async () => {
    const c = config(); c.vars.CF_ACCESS_AUD = '';
    assert.throws(() => checkConfig(c), /AUD/);
    assert.equal(checkConfig(c, { publicStaging: true }).adminReady, false);
    const gate = createAccessGate();
    assert.equal((await gate(new Request('https://kbl.test/admin'), c.vars)).status, 503);
    assert.equal((await gate(new Request('https://kbl.test/api/admin/state', { headers: { 'oai-authenticated-user-id': 'forged', 'oai-authenticated-user-email': c.vars.OWNER_EMAIL } }), c.vars)).status, 503);
    assert.ok(await gate(new Request('https://kbl.test/'), c.vars) instanceof Request);
});
test('staging cannot target the old worker, absent database, domain routes or malformed audience', () => {
    const variants = [c => { c.name = 'kbl-backup'; }, c => { c.d1_databases[0].database_id = '00000000-0000-4000-8000-000000000000'; }, c => { c.routes = []; }, c => { c.route = 'tiemvangkimbaolam.id.vn/*'; }, c => { c.workers_dev = false; c.vars.CF_ACCESS_AUD = ''; }, c => { c.vars.CF_ACCESS_AUD = 'invented'; }];
    for (const mutate of variants) { const c = config(); mutate(c); assert.throws(() => checkConfig(c, { publicStaging: true })); }
    const c = config(); c.vars.CF_ACCESS_AUD = 'a'.repeat(64);
    assert.equal(checkConfig(c).adminReady, true);
});
