import assert from 'node:assert/strict';

/** 验收只记录用户已保存的选择，忽略查询生成的requestId及动态资格。 */
export function policySelection(policy) {
  return structuredClone({ revision: policy.revision, enabled: policy.enabled,
    routes: policy.routes, dsaRevision: policy.dsaRevision, syncState: policy.syncState });
}

export function assertExistingCashRoutes(policy, required) {
  assert.equal(policy.enabled, true, '原政策必须已启用');
  assert.equal(policy.syncState, 'applied', '原政策必须已同步');
  const key = value => JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  for (const route of required) {
    const matches = policy.routes.filter(item => key(item.key) === key(route.key));
    assert.equal(matches.length, 1, '保留政策模式不新增缺失路线');
    if (route.key.capability === 'CASH_DISTRIBUTION') {
      assert(matches[0].targets.some(target => target.providerId === 'official-dividends' && target.upstreamSource === 'cn-etf-cash-notices'), '原现金主备缺少公告来源');
    } else {
      assert.deepEqual(matches[0].targets, route.targets, '原价格选择与本案例不兼容');
    }
  }
}
