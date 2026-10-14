import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertCompositionExecutionArgs, runCompositionBusiness, resumeCompositionInput, verifyTwoSessionAnalytics } from './market-composition-target-acceptance.mjs';
import { createCompositionTargetInput } from './market-composition-target-input.mjs';

test('旧功能/缓存授权flag不能执行新组合或陈旧政策', () => {
  assert.throws(() => assertCompositionExecutionArgs(['--execute', '--authorized-four-cache-case', '--expected-policy=95'], 95));
  assert.throws(() => assertCompositionExecutionArgs(['--execute', '--authorized-composition-case', '--expected-policy=94'], 95));
  assert.doesNotThrow(() => assertCompositionExecutionArgs(['--execute', '--authorized-composition-case', '--expected-policy=95'], 95));
});

test('两会话指标partial须精确原原因，数据缺失/额外不可用/伪造指标仍拒绝', () => {
  const result = { completeness: 'partial', equityCurve: [{}, {}], trades: [], metrics: {
    totalReturn: { status: 'available', value: '0' },
    volatility: { status: 'unavailable', reason: 'VOLATILITY_UNAVAILABLE' },
    sharpe: { status: 'unavailable', reason: 'SHARPE_UNAVAILABLE' },
    winRate: { status: 'unavailable', reason: 'NO_CLOSED_TRADES' },
    profitFactor: { status: 'unavailable', reason: 'NO_CLOSED_TRADES' },
  } };
  const manifest = { status: 'finalized', quality: { completeness: 'complete' } };
  assert.doesNotThrow(() => verifyTwoSessionAnalytics(result, manifest));
  for (const mutate of [
    (r, m) => { m.quality.completeness = 'partial'; },
    (r) => { r.metrics.totalReturn = { status: 'unavailable', reason: 'PRICE_MISSING' }; },
    (r) => { r.metrics.volatility.reason = 'PRICE_MISSING'; },
    (r) => { r.metrics.sharpe = { status: 'available', value: '0' }; },
    (r) => { r.completeness = 'complete'; },
    (r) => { r.equityCurve.pop(); },
  ]) { const r = structuredClone(result), m = structuredClone(manifest); mutate(r, m);
    assert.throws(() => verifyTwoSessionAnalytics(r, m)); }
});

test('准备中任务接续复用原验收版本，不允许未知Run/配置或策略变化', async () => {
  const input = await createCompositionTargetInput('2026-10-11T00:00:00Z');
  const record = { phase: 'restored', owned: false, restoredRevision: 97,
    plan: { caseVersion: 1, baselineFingerprint: 'original', configVersions: { baostock: 0 } },
    preparation: { status: 'preparing' }, strategyId: 'same', strategyVersionId: 'same-version', input };
  const plan = { baseline: { revision: 97 }, baselineFingerprint: 'original', configVersions: { baostock: 0 } };
  const strategies = [{ id: 'same', versions: [{ id: 'same-version', schema: input.strategy }] }];
  const resumed = await resumeCompositionInput(record, plan, strategies);
  assert.deepEqual(resumed.intent, input.intent);
  assert.equal(resumed.existingStrategy.versionId, 'same-version');
  for (const mutation of [
    (r) => { r.idempotencyKey = 'unknown-submit'; },
    (r) => { r.runId = 'existing-run'; },
    (r) => { r.owned = true; },
    (r) => { r.plan.configVersions.baostock = 1; },
    (r) => { r.input.strategy.name = 'changed'; },
    (r) => { r.input.intent.runConfig.initialCash.CNY = '999999'; },
  ]) { const changed = structuredClone(record); mutation(changed);
    await assert.rejects(resumeCompositionInput(changed, plan, strategies)); }
});
test('原prepare拒绝不创建Run，保留已新建策略身份，不重试或注入冻结', async () => {
  const input = await createCompositionTargetInput('2026-10-11T00:00:00Z'), calls = [], records = [];
  const versionId = '127f9d2a-e30f-4e34-b112-d5c5ea818e5f';
  const post = async (p) => { calls.push(p); if (p.endsWith('/strategies')) return { id: 'new', versions: [{ id: versionId }] };
    throw new Error('准备拒绝'); };
  await assert.rejects(runCompositionBusiness({}, post, input, async (r) => records.push(r)));
  assert.deepEqual(calls, ['/api/v1/backtests/strategies', '/api/v1/backtests/run-config/prepare']);
  assert(records.some((r) => r.strategyId === 'new' && r.strategyVersionId === versionId));
});
