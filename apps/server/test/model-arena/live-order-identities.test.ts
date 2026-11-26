import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { arenaLiveDecisionSchema, arenaLiveAccountSchema } from '@thesis-ledger/schemas';
import { arenaSubmitDecision } from '@thesis-ledger/domain';
import { liveOrderCommand } from '../../src/model-arena/live/live-order-identities.js';

it('最长合法引用经命名空间后仍可持久化，顺序引用与嵌套OCO身份保持一致', () => {
  const label = '买'.repeat(200), group = '组'.repeat(200), id = randomUUID();
  const parent = { clientId: label, symbol: 'AAPL.US', side: 'buy', kind: 'limit', quantity: '10', price: '10', expiresOn: null, exitGroup: null,
    onFill: { activation: 'on_full_fill', activateOrders: ['stop_loss', 'take_profit'].map((kind, i) => ({ clientId: String(i).repeat(200), side: 'sell', kind, price: i ? '12' : '9',
      exitGroup: group, quantity: { basis: 'parent_open_quantity' }, reduceOnly: true, validUntil: { kind: 'activation_session_close' } })) } };
  const d = arenaLiveDecisionSchema.parse({ summary: '最长引用', orders: [parent, { ...parent, clientId: 'second', onFill: null, entryAfter: { clientId: label, activation: 'on_full_fill' } }],
    cancelOrderIds: [], watchedSymbols: [], wakeups: [{ kind: 'fill', symbol: null }] });
  const command = liveOrderCommand(id, d);
  expect(command.orders[1]!.entryAfter!.clientId).toBe(command.orders[0]!.clientId);
  expect(command.orders[0]!.onFill!.activateOrders[0]!.exitGroup).toBe(command.orders[0]!.onFill!.activateOrders[1]!.exitGroup);
  const at = '2026-11-13T15:00:00Z', day = '2026-11-13';
  const book = arenaSubmitDecision({ revision: 0, cash: '10000', orders: [], positions: [], fills: [], cashSettlements: [], watchedSymbols: [], wakeups: [] }, 0, command,
    { at, tradingDate: day, fees: { buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 }, maxPositionBps: 10000, maxActiveSymbols: 50,
      newId: randomUUID, expiresAt: () => day + 'T21:00:00Z', allowedSymbols: new Set(['AAPL.US']), quotes: [{ symbol: 'AAPL.US', price: '10', marketTime: at, observedAt: at,
        tradingDate: day, positionAvailableOn: day, cashAvailableOn: day, sourceRef: 'fixture', evidence: {}, lot: '1', tick: '0.01',
        buyBlocked: null, sellBlocked: null, statutoryBuyFee: () => '0', statutorySellFee: () => '0' }] });
  expect(arenaLiveAccountSchema.parse(JSON.parse(JSON.stringify(book)))).toEqual(JSON.parse(JSON.stringify(book)));
});
