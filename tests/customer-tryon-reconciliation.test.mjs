import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const worker=readFileSync(new URL('../worker/cloudflare.ts',import.meta.url),'utf8');
const customer=readFileSync(new URL('../lib/kbl/customer-maintenance.ts',import.meta.url),'utf8');
test('try-on timeout reconciliation is scheduled on each minute tick independently', () => {
  const minute=worker.split('tick:async()=>')[1]?.split('cleanup:async()=>')[0] || '';
  const hourly=worker.split('cleanup:async()=>')[1] || '';
  assert.match(minute, /reconcileCustomerTryOn\(at\)/);
  assert.doesNotMatch(hourly, /reconcileCustomerTryOn/);
  assert.match(hourly, /customerMaintenance/);
});
test('reconciliation preserves ambiguous provider result without retrying', () => {
  const body=customer.split('export async function reconcileCustomerTryOn')[1] || '';
  assert.match(body, /'unknown'/);
  assert.match(body, /'running'/);
  assert.match(body, /at-5\*60000/);
  assert.doesNotMatch(body, /fetch\(/);
});
