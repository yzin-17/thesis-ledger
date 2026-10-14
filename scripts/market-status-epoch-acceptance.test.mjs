import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createEpochCase, epochRequests, verifyEpochStage, executeEpochCase, resumeEpochCase } from './market-status-epoch-case.mjs';

function fixture() {
  const state = { ...JSON.parse(fs.readFileSync(new URL('../packages/schemas/fixtures/market-route-v3.etf-qfq.json', import.meta.url))),
    revision: 1, syncState: 'applied', effectiveStale: false, dsaRevision: 1 };
  const providers = [{ providerId: 'baostock', enabled: true }, { providerId: 'official-states', enabled: true }];
  const catalog = { status: 'complete', entries: [
    ['DAILY_TRADING_STATUS', 'baostock', 'baostock', {}],
    ['DAILY_TRADING_STATUS', 'official-states', 'cn-stock-daily-suspension', {}],
    ['RISK_WARNING', 'baostock', 'baostock', { detailKinds: ['coarseST'] }],
  ].map(([capability, providerId, upstreamSource, querySupport]) => ({
    key: { kind: 'data', market: 'CN', assetType: 'STOCK', capability }, target: { providerId, upstreamSource }, state: 'ready', querySupport,
  })) };
  return { state, plan: createEpochCase(state, providers, catalog), providers, catalog };
}
function targetProof(plan, stage) {
  const value = (capability, providerId = 'baostock', requestId = 'first') => ({ result: {
    policyRevision: plan.policies[stage].revision, symbol: plan.symbol, routeKey: { capability },
    routeTarget: { providerId, upstreamSource: providerId === 'baostock' ? 'baostock' : 'cn-stock-daily-suspension', routeIndex: providerId === 'baostock' ? 0 : 1 },
    requestId, coverage: { complete: true }, clock: { observedAt: `2026-10-11T00:00:0${stage}Z` }, days: [{ state: 'suspended' }],
  } });
  const proof = { risk: value('RISK_WARNING') };
  if (stage === 1) return { ...proof, statusError: 'control-rejected', statusDataCalls: 0, riskDataCalls: 1 };
  proof.status = value('DAILY_TRADING_STATUS');
  proof.repeated = value('DAILY_TRADING_STATUS', 'baostock', 'repeat');
  if (stage === 0) Object.assign(proof, { injected: 1, fallbackDataCalls: 2,
    fallback: { ...value('DAILY_TRADING_STATUS', 'official-states'), attempts: [{ error: 'unavailable' }, { error: null }] } });
  return proof;
}
function fakeApi(state) {
  let current = state;
  const writes = [];
  return { writes, current: () => current, change: (next) => { current = next; },
    get: async () => current, put: async (endpoint, body) => {
      assert.equal(body.expectedRevision, current.revision);
      writes.push(structuredClone(body));
      const { expectedRevision, ...next } = body;
      current = { ...next, syncState: 'applied', effectiveStale: false, dsaRevision: next.revision };
      return current;
    } };
}
test('只追加两项功能，关闭状态保留原主备及独立风险', () => {
  const { state, plan } = fixture();
  assert.equal(plan.policies[0].routes.length, state.routes.length + 2);
  for (const policy of plan.policies) assert.deepEqual(policy.routes.slice(0, state.routes.length), state.routes);
  assert.deepEqual(plan.policies[0].routes.at(-2).targets, plan.policies[1].routes.at(-2).targets);
  assert.equal(plan.policies[1].routes.at(-2).enabled, false);
  assert.equal(plan.policies[1].routes.at(-1).enabled, true);
  assert.deepEqual(epochRequests(plan)[1].detail, { kind: 'coarseST' });
});
test('已有选择、来源未启用或参数不支持时停止', () => {
  const { state, plan, providers, catalog } = fixture();
  assert.throws(() => createEpochCase({ ...state, routes: plan.policies[0].routes }, providers, catalog));
  assert.throws(() => createEpochCase(state, providers.map((provider) => ({ ...provider, enabled: false })), catalog));
  catalog.entries.at(-1).querySupport.detailKinds = ['riskCategories'];
  assert.throws(() => createEpochCase(state, providers, catalog));
});
test('继续未完成授权案例只接受已恢复的原范围和选择，且限制一次', () => {
  const { plan } = fixture();
  const record = { phase: 'restored', restoredRevision: plan.baseline.revision, plan, attempt: 1 };
  assert.equal(resumeEpochCase(plan, record).caseId, plan.caseId);
  assert.throws(() => resumeEpochCase(plan, { ...record, phase: 'verified' }));
  assert.throws(() => resumeEpochCase(plan, { ...record, attempt: 2 }));
  assert.throws(() => resumeEpochCase(plan, { ...record, plan: { ...plan, symbol: '600000.SH' } }));
  assert.throws(() => resumeEpochCase(plan, { ...record, restoredRevision: 99 }));
});
test('证明拒绝缓存身份复用、关闭调用和旧时钟', () => {
  const { plan } = fixture();
  const first = targetProof(plan, 0);
  verifyEpochStage(plan, 0, first);
  const wrong = structuredClone(first);
  wrong.repeated.result.requestId = wrong.status.result.requestId;
  assert.throws(() => verifyEpochStage(plan, 0, wrong));
  assert.throws(() => verifyEpochStage(plan, 1, { ...targetProof(plan, 1), statusDataCalls: 1 }));
  const next = targetProof(plan, 2);
  for (const field of ['status', 'risk', 'repeated']) next[field].result.clock = first.status.result.clock;
  assert.throws(() => verifyEpochStage(plan, 2, next, first));
});
test('完整三阶段后 CAS 恢复原选择，保留证明记录', async () => {
  const { plan, state } = fixture();
  const api = fakeApi(state), records = [];
  const result = await executeEpochCase(api, plan, async (record) => records.push(record), async (stage) => targetProof(plan, stage));
  assert.equal(result.stages, 3);
  assert.equal(api.writes.length, 4);
  assert.deepEqual(api.current().routes, state.routes);
  assert.equal(api.current().revision, 5);
  assert.equal(records.at(-1).phase, 'verified');
});
test('读取失败恢复，提交结果不明或并行修改不覆盖', async () => {
  const { plan, state } = fixture();
  const api = fakeApi(state), records = [];
  await assert.rejects(executeEpochCase(api, plan, async (record) => records.push(record), async () => { throw new Error('fixture failure'); }));
  assert.equal(api.writes.length, 2);
  assert.deepEqual(api.current().routes, state.routes);
  const parallel = fakeApi(state);
  await assert.rejects(executeEpochCase(parallel, plan, async () => {}, async () => {
    parallel.change({ ...parallel.current(), revision: 9 });
    throw new Error('parallel');
  }));
  assert.equal(parallel.writes.length, 1);
  const uncertain = fakeApi(state);
  await assert.rejects(executeEpochCase({ ...uncertain, put: async () => { throw new Error('unknown commit'); } }, plan, async () => {}, async () => {}));
  assert.equal(uncertain.writes.length, 0);
});
