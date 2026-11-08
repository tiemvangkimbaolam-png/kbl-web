import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isFresh, chooseWorker, latestStage, completedStages, commandState } from '../app/components/admin-state.mjs';
import { readApiResponse } from '../app/components/api-response.mjs';
import { savedCart } from '../app/components/public-state.mjs';

test('account login selects a real fresh Windows worker, respects explicit offline selection and disabled accounts', () => {
    const now = 100000;
    const workers = [{ id: 'old', lastSeen: 1 }, { id: 'live', lastSeen: 90000 }];
    assert.equal(chooseWorker(workers, '', now).id, 'live');
    assert.equal(chooseWorker(workers, 'old', now).id, 'old');
    assert.equal(isFresh(chooseWorker(workers, 'old', now), now), false);
    assert.equal(chooseWorker(workers.slice(0, 1), '', now), null);
    assert.equal(isFresh({ lastSeen: 90000, enabled: false }, now), false);
    assert.equal(isFresh({ lastSeen: now + 100000 }, now), false);
});
test('repair/reconnect progress uses the newest stage and cannot count old completion twice', () => {
    const jobs = [{ stage: 'write', status: 'complete', updated_at: 1 }, { stage: 'write', status: 'queued', updated_at: 4 }, { stage: 'research', status: 'complete', updated_at: 2 }];
    assert.equal(latestStage(jobs, 'write').status, 'queued');
    assert.equal(completedStages(jobs, ['research', 'write', 'review']), 1);
});
test('Windows queue acceptance is distinct from execution receipt and expired commands', () => {
    assert.equal(commandState({ status: 'pending', expiresAt: 200 }, 100).status, 'pending');
    assert.equal(commandState({ status: 'pending', expiresAt: 200 }, 300).status, 'expired');
    assert.equal(commandState({ status: 'done', expiresAt: 200 }, 300).status, 'done');
    assert.match(commandState({ status: 'pending', expiresAt: 200 }, 100).text, /chờ Windows/);
});
test('authentication HTML and truncated JSON produce actionable errors without exposing HTML to users', async () => {
    await assert.rejects(readApiResponse(new Response('<html>Cloudflare Access login</html>', { headers: { 'content-type': 'text/html' } })), /đăng nhập/);
    await assert.rejects(readApiResponse(new Response('{"ok":', { headers: { 'content-type': 'application/json' } })), /chưa hoàn chỉnh/);
    await assert.rejects(readApiResponse(Response.json({ error: 'POS chỉ đọc' }, { status: 403 })), /POS chỉ đọc/);
    assert.deepEqual(await readApiResponse(Response.json({ id: 'saved' })), { id: 'saved' });
});
test('malformed browser carts cannot crash checkout or retain invalid rows before a valid duplicate', () => {
    assert.deepEqual(savedCart('{broken'), []);
    assert.deepEqual(savedCart('{"id":"not-an-array"}'), []);
    const valid = { id: 'A', name: 'Nhẫn', price: 1000000, quantity: 1 };
    assert.deepEqual(savedCart(JSON.stringify([{ ...valid, quantity: -2 }, valid, { ...valid, quantity: 5 }, { ...valid, id: 'B', price: null }])), [valid]);
    assert.equal(savedCart(JSON.stringify(Array.from({ length: 30 }, (_, i) => ({ ...valid, id: String(i) })))).length, 20);
});
