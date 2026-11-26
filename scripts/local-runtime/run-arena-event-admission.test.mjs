import assert from 'node:assert/strict';
import test from 'node:test';
import { appendEventRoutes } from './run-arena-event-admission.mjs';

const baseline = () => ({ revision: 201, enabled: true, syncState: 'applied', effectiveStale: false,
  routes: Array.from({ length: 147 }, (_, index) => ({ key: { kind: 'data', market: 'CN', assetType: 'STOCK', capability: 'existing-' + index },
    targets: [{ providerId: 'existing', upstreamSource: 'existing' }] })) });

test('保留全部原路由身份，只追加两个精确事件能力', () => {
  const policy = baseline();
  const original = structuredClone(policy);
  const routes = appendEventRoutes(policy);
  assert.deepEqual(routes.slice(0, 147), original.routes);
  assert.deepEqual(routes.slice(147).map(x => x.key.capability), ['CASH_DISTRIBUTION', 'SPLIT_EVENT']);
  assert(routes.slice(147).every(x => x.enabled && x.targets[0].providerId === 'official-event-archive'));
  assert.deepEqual(policy, original);
});

test('已有精确事件路由、错误修订及未同步政策均拒绝', () => {
  for (const change of [{ revision: 202 }, { syncState: 'pending' }, { effectiveStale: true }])
    assert.throws(() => appendEventRoutes({ ...baseline(), ...change }));
  const policy = baseline();
  policy.routes[0].key = { capability: 'SPLIT_EVENT', assetType: 'ETF', market: 'CN', kind: 'data' };
  assert.throws(() => appendEventRoutes(policy), /已有精确事件路由/);
});
