import assert from 'node:assert/strict';
import test from 'node:test';
import { cacheTarget, cacheVerificationPlan, verifyCache } from './verify-market-bar-cache.mjs';

test('默认只展示计划并拒绝未知模式或重复执行参数', async () => {
  const result = await verifyCache(cacheVerificationPlan(['--output=/tmp/cache-plan']));
  assert.equal(result.providerPriceCalls, 0); assert.equal(result.businessWrites, 0);
  assert.throws(() => cacheVerificationPlan(['--output=/tmp/cache-plan', '--mode=unsafe']));
  assert.throws(() => cacheVerificationPlan(['--output=/tmp/cache-plan', '--execute', '--execute']));
});
test('容器身份必须为当前项目运行中的主应用', () => {
  const value = { Id: 'fixture', Image: 'image', State: { Running: true, StartedAt: 'at' }, Config: {
    Labels: { 'com.docker.compose.project': 'thesis-ledger-dev', 'com.docker.compose.service': 'thesis-ledger' } } };
  assert.equal(cacheTarget(value).id, 'fixture');
  assert.throws(() => cacheTarget({ ...value, State: { Running: false } }));
  assert.throws(() => cacheTarget({ ...value, Config: { Labels: { 'com.docker.compose.project': 'other' } } }));
});
