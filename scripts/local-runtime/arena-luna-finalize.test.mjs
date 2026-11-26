import assert from 'node:assert/strict';
import { test } from 'node:test';
import { removableArenaDelivery } from './run-arena-luna-finalize.mjs';

test('仅移除本批终态周期的投递，旧待办与活动周期保持', () => {
  const rows = [{ id: 'owned', matchId: 'new', state: 'unknown_usage' },
    { id: 'old', matchId: 'old-match', state: 'succeeded' },
    { id: 'active', matchId: 'new', state: 'running' },
    { id: 'pending', matchId: 'new', state: 'pending' }];
  assert.equal(removableArenaDelivery({ data: { id: 'owned' } }, rows, ['new']), true);
  for (const id of ['old','active','pending','missing'])
    assert.equal(removableArenaDelivery({ data: { id } }, rows, ['new']), false);
});

test('缺少周期身份的投递不移除', () => {
  assert.equal(removableArenaDelivery({ data: {} }, [], ['new']), false);
});
