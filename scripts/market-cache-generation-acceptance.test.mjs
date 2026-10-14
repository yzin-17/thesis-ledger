import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCacheGenerationCase, executeCacheGenerationCase, assertCacheGenerationCase,
  cacheRouteKey, quotePath } from './market-cache-generation-case.mjs';
import { countQuoteDataCalls, collectQuoteDataCalls } from './market-cache-generation-acceptance.mjs';

function fixture() {
  let state = { contractVersion: 3, consumer: 'thesis-ledger', requestId: 'baseline',
    revision: 84, enabled: true, routes: [
      { key: cacheRouteKey, enabled: true, targets: [{ providerId: 'hithink', upstreamSource: 'fixture-existing' }] },
      { key: { kind: 'bar', market: 'CN', assetType: 'ETF', capability: 'DAILY_BAR', timeframe: '1d', adjustment: 'qfq' },
        targets: [{ providerId: 'hithink', upstreamSource: 'other' }] },
    ], syncState: 'applied', effectiveStale: false, dsaRevision: 84 };
  const writes = [], records = [];
  const api = { get: async () => structuredClone(state), put: async (endpoint, body) => {
    assert.equal(endpoint, '/api/market-data/policy');
    assert.equal(body.expectedRevision, state.revision);
    writes.push(structuredClone(body));
    const { expectedRevision, ...next } = body;
    state = { ...next, syncState: 'applied', effectiveStale: false, dsaRevision: next.revision };
    return structuredClone(state);
  } };
  const probe = async (phase) => phase === 'disabled' ? { rejected: true, dataCalls: 0 }
    : { firstCached: false, secondCached: true, dataCalls: 1 };
  return { api, writes, records, probe, getState: () => state,
    journal: async (record) => records.push(structuredClone(record)), plan: createCacheGenerationCase(state) };
}

test('只关闭一条功能并CAS恢复，不改变目标、顺序或其他路由', async () => {
  const h = fixture();
  await executeCacheGenerationCase(h.api, h.plan, h.journal, h.probe);
  assert.equal(h.writes.length, 2);
  assert.equal(h.writes[0].routes[0].enabled, false);
  assert.deepEqual(h.writes[0].routes[0].targets, h.plan.baseline.routes[0].targets);
  assert.deepEqual(h.writes[0].routes[1], h.plan.baseline.routes[1]);
  assert.deepEqual(h.getState().routes, h.plan.baseline.routes);
  assert.equal(h.getState().revision, 86);
  assert.equal(h.records.at(-1).phase, 'verified');
});

test('关闭后查询失败仍恢复，保留原失败', async () => {
  const h = fixture();
  const error = new Error('查询失败');
  await assert.rejects(executeCacheGenerationCase(h.api, h.plan, h.journal,
    async (phase) => { if (phase === 'disabled') throw error; return h.probe(phase); }), (value) => value === error);
  assert.equal(h.getState().revision, 86);
  assert.equal(h.records.at(-1).phase, 'restored');
});

test('提交已写但响应丢失时停止覆盖，保留未确认记录', async () => {
  const h = fixture(); const put = h.api.put;
  h.api.put = async (...args) => { await put(...args); throw new Error('响应丢失'); };
  await assert.rejects(executeCacheGenerationCase(h.api, h.plan, h.journal, h.probe));
  assert.equal(h.writes.length, 1); assert.equal(h.getState().revision, 85);
  assert.equal(h.records.at(-1).phase, 'submission_unconfirmed');
  assert.equal(h.records.at(-1).owned, false);
});

test('并行政策变化时不恢复覆盖', async () => {
  const h = fixture();
  await assert.rejects(executeCacheGenerationCase(h.api, h.plan, h.journal, async (phase) => {
    if (phase === 'disabled') h.getState().revision = 86;
    return h.probe(phase);
  }), /政策版本/);
  assert.equal(h.writes.length, 1);
  assert.equal(h.records.at(-1).owned, true);
});

test('基线未命中缓存不做任何政策写入', async () => {
  const h = fixture();
  await assert.rejects(executeCacheGenerationCase(h.api, h.plan, h.journal,
    async () => ({ secondCached: false })), /缓存基线/);
  assert.equal(h.writes.length, 0);
});

test('恢复记录不允许改变其他路由', () => {
  const h = fixture(); h.plan.temporary.routes[1].targets = [];
  assert.throws(() => assertCacheGenerationCase(h.plan));
});

test('数据调用只按本案例trace计数，缺完成日志不能算零请求', () => {
  const row = (value) => JSON.stringify({ timestamp: '2026-10-11T00:00:00Z', ...value });
  const log = [row({ traceId: 'one', operation: 'http.request', path: quotePath }),
    row({ traceId: 'one', operation: 'market.quote', stage: 'dsa-call', status: 'started' }),
    row({ traceId: 'other', operation: 'market.quote', stage: 'dsa-call', status: 'started' })].join('\n');
  assert.equal(countQuoteDataCalls(log, ['one']), 1);
  assert.throws(() => countQuoteDataCalls('', ['one']), /缺少请求完成/);
});

test('真实Nest彩色日志包装保持trace计数与完成证明', () => {
  const row = (value) => '\u001b[32m[Nest] 1 LOG\u001b[39m ' +
    '\u001b[32m' + JSON.stringify({ timestamp: '2026-10-11T00:00:00Z', ...value }) + '\u001b[39m';
  const log = [row({ traceId: 'one', operation: 'market.quote', stage: 'dsa-call', status: 'started' }),
    row({ traceId: 'one', operation: 'http.request', path: quotePath }),
    row({ traceId: 'two', operation: 'http.request', path: quotePath }),
    row({ traceId: 'other', operation: 'market.quote', stage: 'dsa-call', status: 'started' })].join('\n');
  assert.equal(countQuoteDataCalls(log, ['one', 'two']), 1);
  assert.throws(() => countQuoteDataCalls(log, ['missing']), /缺少请求完成/);
});

test('报价仅重读迟到完成日志，缺证明最多等待一秒，不重新发起消费', async () => {
  const complete = JSON.stringify({ timestamp: '2026-10-11T00:00:00Z', traceId: 'one',
    operation: 'http.request', path: quotePath });
  let reads = 0; const waits = [];
  assert.equal(await collectQuoteDataCalls(() => ++reads === 1 ? '' : complete,
    ['one'], async (ms) => waits.push(ms)), 0);
  assert.equal(reads, 2); assert.deepEqual(waits, [250]);
  reads = 0;
  await assert.rejects(collectQuoteDataCalls(() => { reads += 1; return ''; },
    ['one'], async () => {}), /缺少请求完成/);
  assert.equal(reads, 5);
});
