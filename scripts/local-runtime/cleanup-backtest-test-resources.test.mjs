import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyAbandonedBacktestResource } from './cleanup-backtest-test-resources.mjs';
test('只清理已退出进程的无持久挂载隔离测试资源', () => {
  const name = 'tl-nav-n2-6-123-12345678';
  const resource = {
    Id: 'owned',
    Name: `/${name}`,
    Config: { Labels: { 'thesis-ledger.n2-6': '12345678-1111-4111-8111-111111111111' } },
    Mounts: [{ Type: 'tmpfs' }],
    HostConfig: {},
  };
  assert.equal(
    verifyAbandonedBacktestResource(name, resource, () => false),
    'owned',
  );
  assert.throws(() => verifyAbandonedBacktestResource(name, resource, () => true));
  assert.throws(() =>
    verifyAbandonedBacktestResource('thesis-ledger-postgres', resource, () => false),
  );
  assert.throws(() =>
    verifyAbandonedBacktestResource(
      name,
      { ...resource, Mounts: [{ Type: 'volume' }] },
      () => false,
    ),
  );
  assert.throws(() =>
    verifyAbandonedBacktestResource(name, { ...resource, Config: { Labels: {} } }, () => false),
  );
});
