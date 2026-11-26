import assert from 'node:assert/strict';
import test from 'node:test';
import { appendRoute, partitionValuations, KEY, TARGET } from './run-arena-execution-admission.mjs';

test('保留原路由顺序和取值，只追加精确 ETF 执行绑定', () => {
  const routes = [{ key: { kind: 'data', market: 'CN', assetType: 'ETF', capability: 'QUOTE' },
    enabled: true, targets: [{ providerId: 'existing', upstreamSource: 'existing' }] }];
  const policy = { contractVersion: 1, enabled: true, syncState: 'applied', effectiveStale: false, routes };
  const result = appendRoute(policy);
  assert.deepEqual(result, [...routes, { key: KEY, enabled: true, targets: [TARGET] }]);
  assert.equal(policy.routes.length, 1);
});

test('拒绝覆盖已有执行绑定以及未稳定应用的策略', () => {
  const policy = { contractVersion: 1, enabled: true, syncState: 'applied', effectiveStale: false,
    routes: [{ key: KEY, enabled: false, targets: [] }] };
  assert.throws(() => appendRoute(policy), /已有执行路由/u);
  assert.throws(() => appendRoute({ ...policy, routes: [], effectiveStale: true }));
  assert.throws(() => appendRoute({ ...policy, routes: [], enabled: false }));
});

test('原估值全部保留在摘要核验内，只单列维护后新增的后台估值', () => {
  const old = { value: JSON.stringify({ id: 'old', at: '2026-11-16T12:00:00Z', frame: { cash: 100 } }) };
  const added = { value: JSON.stringify({ id: 'new', at: '2026-11-16T12:02:00Z' }) };
  const split = partitionValuations([old, added], '2026-11-16T12:01:00Z', '2026-11-16T12:03:00Z');
  assert.deepEqual(split.historical, [old]);
  assert.deepEqual(split.appended, [added]);
  assert.throws(() => partitionValuations([added], '2026-11-16T12:01:00Z', '2026-11-16T12:01:30Z'), /未来/u);
  assert.throws(() => partitionValuations([old], 'invalid'));
});
