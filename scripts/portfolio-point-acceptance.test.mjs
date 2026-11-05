import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPointPreparation } from './portfolio-point-acceptance.mjs';

test('只恢复精确登记且现金/持仓/点位均为空的停用验收账户', () => {
  const preflight = {
    account: {
      id: '8cbb048e-9c15-480d-be49-6865679d76c7',
      name: '风险与正式校准验收-20261017-0b3235a5',
      active: false,
    },
    ownPointCount: 0,
    positions: [{ quantity: '0' }],
    cash: { CNY: '0' },
    nonOwnedPointsHash: '0'.repeat(64),
  };
  assert.doesNotThrow(() => assertPointPreparation(preflight));
  for (const change of [
    { account: { ...preflight.account, id: 'foreign' } },
    { account: { ...preflight.account, active: true } },
    { ownPointCount: 1 },
    { positions: [{ quantity: '1' }] },
    { cash: { CNY: '1' } },
  ]) {
    assert.throws(() => assertPointPreparation({ ...preflight, ...change }));
  }
});
