import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mobileBoundaryViolation } from './mobile-boundaries.mjs';
test('手机和共享合同拒绝应用/平台反向依赖', () => {
  assert.ok(mobileBoundaryViolation('apps/mobile/src/features/a.ts', '@thesis-ledger/desktop'));
  for (const file of [
    'packages/api-client/src/a.ts',
    'packages/schemas/src/a.ts',
    'packages/domain/src/a.ts',
  ]) {
    for (const module of [
      'react-native',
      'react-dom/client',
      '@react-navigation/native',
      'expo-file-system',
      '@thesis-ledger/mobile',
    ])
      assert.ok(mobileBoundaryViolation(file, module));
  }
  assert.ok(mobileBoundaryViolation('packages/api-client/src/a.ts', 'node:fs'));
});
test('保留合法的合同与原生适配消费', () => {
  assert.equal(mobileBoundaryViolation('apps/mobile/src/platform/a.ts', 'expo-file-system'), null);
  assert.equal(
    mobileBoundaryViolation('packages/api-client/src/a.ts', '@thesis-ledger/schemas'),
    null,
  );
  assert.equal(mobileBoundaryViolation('packages/schemas/src/a.ts', 'zod'), null);
  assert.equal(mobileBoundaryViolation('apps/desktop/src/a.tsx', 'react-dom/client'), null);
});
test('策略共享客户端与手机拒绝相对路径绕过应用边界', () => {
  assert.ok(
    mobileBoundaryViolation(
      'packages/api-client/src/strategy-definition-client.ts',
      '../../../apps/desktop/src/features/strategy/strategy.types.js',
    ),
  );
  assert.ok(
    mobileBoundaryViolation(
      'packages/schemas/src/strategy-definition-wire.ts',
      '../../../apps/server/src/backtest/backtest.service.js',
    ),
  );
  assert.ok(
    mobileBoundaryViolation(
      'apps/mobile/src/features/strategy-library/a.ts',
      '../../../../desktop/src/features/strategy/strategy.api.js',
    ),
  );
  assert.equal(
    mobileBoundaryViolation(
      'packages/api-client/src/strategy-clients.ts',
      './strategy-definition-client.js',
    ),
    null,
  );
});
