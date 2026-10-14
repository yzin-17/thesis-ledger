import test from 'node:test';
import assert from 'node:assert/strict';
import { assertExistingCashRoutes, policySelection } from './cash-dividend-target-policy.mjs';
const price = { key: { kind: 'bar', capability: 'DAILY_BAR' }, targets: [{ providerId: 'tencent', upstreamSource: 'tencent' }] };
const cash = { key: { kind: 'data', capability: 'CASH_DISTRIBUTION' }, targets: [{ providerId: 'official-dividends', upstreamSource: 'cn-etf-cash-notices' }] };
const policy = () => ({ revision: 111, dsaRevision: 111, syncState: 'applied', enabled: true,
  routes: [price, { ...cash, targets: [{ providerId: 'hithink', upstreamSource: 'fund-corporate-actions-dividends' }, ...cash.targets] }] });
test('原公告备用位置保持，守卫不修改政策', () => {
  const value = policy(), before = structuredClone(value);
  assertExistingCashRoutes(value, [price, cash]); assert.deepEqual(value, before);
});
test('缺路线、缺公告、价格不同或关闭时拒绝，不补写选择', () => {
  for (const value of [{ ...policy(), routes: [price] }, { ...policy(), routes: [price, { ...cash, targets: [] }] },
    { ...policy(), routes: [{ ...price, targets: cash.targets }, cash] }, { ...policy(), enabled: false }]) {
    const before = structuredClone(value); assert.throws(() => assertExistingCashRoutes(value, [price, cash])); assert.deepEqual(value, before);
  }
});
test('动态查询字段不伪造政策变更，实际主备变化仍被识别', () => {
  const value = policy(), before = policySelection(value);
  assert.deepEqual(before, policySelection({ ...value, requestId: 'new', catalogAudit: {}, effectiveProjection: {} }));
  value.routes = [price, cash]; assert.notDeepEqual(before, policySelection(value));
});
