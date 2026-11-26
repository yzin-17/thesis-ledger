import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planMarketPolicyHistory, retiredStatus } from './market-policy-history-plan.mjs';

const provider = (id) => ({ providerId: id, upstreamSource: id });
const a = provider('primary');
const b = provider('backup');
const dataKey = (capability) => ({ kind: 'data', market: 'CN', assetType: 'STOCK', capability });
const daily = dataKey('DAILY_TRADING_STATUS');
const risk = dataKey('RISK_WARNING');
const old = dataKey(retiredStatus);
const bar = { ...dataKey('DAILY_BAR'), kind: 'bar', timeframe: '1d', adjustment: 'qfq' };
const binding = (key, target) => ({ key, target });
const entry = (key, targets, enabled) => ({
  key, targets, ...(enabled === undefined ? {} : { enabled }),
});
const revision = (...routes) => ({
  revision: 202, consumer: 'thesis-ledger', enabled: true,
  routes: { storageVersion: 'market-routing-policy-v1', routes },
});
const catalog = (...entries) => ({ integrity: 'complete', entries });

test('按精确能力展开旧状态，保持适用的主备和显式停用', () => {
  const row = revision(entry(old, [a, b], false));
  const result = planMarketPolicyHistory([row], catalog(
    binding(daily, b), binding(risk, a), binding(daily, a),
  ))[0];
  assert.deepEqual(result.nextRoutes, [entry(risk, [a], false), entry(daily, [a, b], false)]);
  assert.equal(result.before, row);
  assert.deepEqual(row.routes.routes, [entry(old, [a, b], false)]);
});

test('保留后来已选定的独立路由，补齐其余能力和已证实的 TickFlow 别名', () => {
  const explicit = entry(daily, [b], true);
  const row = revision(entry(old, [a]), explicit,
    entry(bar, [{ providerId: 'tickflow-free', upstreamSource: 'tickflow-free-history' }]));
  const result = planMarketPolicyHistory([row], catalog(
    binding(daily, a), binding(risk, a), binding(daily, b), binding(bar, provider('tickflow')),
  ))[0];
  assert.deepEqual(result.nextRoutes, [entry(risk, [a], true), explicit, entry(bar, [provider('tickflow')])]);
});

test('旧目标缺少现行绑定时整版不可恢复', () => {
  const row = revision(entry(old, [a, b]));
  const result = planMarketPolicyHistory([row], catalog(binding(daily, a)))[0];
  assert.equal(result.nextRoutes, null);
  assert.deepEqual(result.blockers, [{ key: old, target: b, reason: 'missing_status_binding' }]);
});

test('整版通过当前保存校验，其他退役目标也会阻断', () => {
  const row = revision(entry(old, [a]), entry(bar, [b]));
  const result = planMarketPolicyHistory([row], catalog(binding(daily, a)))[0];
  assert.equal(result.nextRoutes, null);
  assert.deepEqual(result.blockers, [{ key: bar, target: b, reason: 'not_adapted' }]);
  assert.throws(() => planMarketPolicyHistory([row], { integrity: 'partial', entries: [] }), /目录不完整/);
});
