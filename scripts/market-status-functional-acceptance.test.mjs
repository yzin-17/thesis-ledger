import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createFunctionalCase, functionalRequests } from './market-status-functional-case.mjs';
import { executeFunctionalCase, localOrigin } from './market-status-functional-acceptance.mjs';

function fixture() {
  const state = { ...JSON.parse(fs.readFileSync(new URL('../packages/schemas/fixtures/market-route-v3.etf-qfq.json', import.meta.url))),
    syncState: 'applied', effectiveStale: false, dsaRevision: 1 };
  state.revision = 1;
  const specs = [['DAILY_TRADING_STATUS', 'official-states', 'cn-stock-daily-suspension'], ['RISK_WARNING', 'official-states', 'cn-stock-risk-price-limits'],
    ['DAILY_PRICE_RULE', 'official-states', 'cn-stock-risk-price-limits'], ['SECURITY_BASIC_DATES', 'baostock', 'baostock'], ['LISTING_PHASE', 'official-states', 'cn-stock-delisting-period']];
  const catalog = { status: 'complete', entries: specs.map(([capability, providerId, upstreamSource]) => ({
    key: { kind: 'data', market: 'CN', assetType: 'STOCK', capability }, target: { providerId, upstreamSource }, state: 'ready' })) };
  const providers = [{ providerId: 'official-states', enabled: true }, { providerId: 'baostock', enabled: true }];
  return { state, providers, catalog };
}
test('仅预览五个精确功能，不更改旧路线或输入', () => {
  const { state, providers, catalog } = fixture();
  const before = structuredClone(state);
  const plan = createFunctionalCase(state, providers, catalog);
  assert.deepEqual(state, before);
  assert.deepEqual(plan.temporary.routes.slice(0, state.routes.length), state.routes);
  assert.equal(plan.temporary.routes.length, state.routes.length + 5);
  assert.equal(functionalRequests(plan).length, 5);
  assert.equal(functionalRequests(plan)[3].range, undefined);
});
test('已有功能选择、目录缺项或未启用来源时拒绝覆盖', () => {
  const { state, providers, catalog } = fixture();
  const plan = createFunctionalCase(state, providers, catalog);
  const selected = { ...state, routes: plan.temporary.routes };
  assert.throws(() => createFunctionalCase(selected, providers, catalog));
  assert.throws(() => createFunctionalCase(state, providers, { ...catalog, entries: catalog.entries.slice(1) }));
  assert.throws(() => createFunctionalCase(state, [{ ...providers[0], enabled: false }, providers[1]], catalog));
});
test('原 Reader 查询失败也用 expectedRevision 恢复原政策', async () => {
  const { state, providers, catalog } = fixture();
  const plan = createFunctionalCase(state, providers, catalog);
  let current = state;
  const changes = [], records = [];
  const api = { get: async () => current, put: async (endpoint, payload) => {
    assert.equal(payload.expectedRevision, current.revision);
    changes.push(structuredClone(payload));
    const { expectedRevision, ...next } = payload;
    current = { ...next, syncState: 'applied', effectiveStale: false, dsaRevision: next.revision };
    return current;
  } };
  await assert.rejects(executeFunctionalCase(api, plan, async (record) => records.push(record), async () => { throw new Error('fixture SDK failure'); }));
  assert.equal(changes.length, 2);
  assert.deepEqual(current.routes, state.routes);
  assert.equal(current.revision, 3);
  assert.equal(records.at(-1).phase, 'restored');
});
test('并行政策修改或提交不明时不覆盖，并保留准备记录', async () => {
  const { state, providers, catalog } = fixture();
  const plan = createFunctionalCase(state, providers, catalog);
  let current = state, writes = 0;
  const records = [];
  const api = { get: async () => current, put: async (endpoint, payload) => {
    writes++;
    const { expectedRevision, ...next } = payload;
    current = { ...next, syncState: 'applied', effectiveStale: false, dsaRevision: next.revision };
    return current;
  } };
  await assert.rejects(executeFunctionalCase(api, plan, async (record) => records.push(record), async () => {
    current = { ...current, revision: current.revision + 1 };
    throw new Error('parallel update');
  }));
  assert.equal(writes, 1);
  assert.equal(records.at(-1).phase, 'temporary_confirmed');
  writes = 0;
  await assert.rejects(executeFunctionalCase({ ...api, put: async () => { writes++; throw new Error('unknown commit'); } }, plan,
    async () => {}, async () => []));
  assert.equal(writes, 1);
});
test('拒绝远程地址与 URL 中的凭据', () => {
  assert.equal(localOrigin('http://127.0.0.1:3000'), 'http://127.0.0.1:3000');
  assert.throws(() => localOrigin('https://example.com'));
  assert.throws(() => localOrigin('http://user:secret@127.0.0.1:3000'));
});
