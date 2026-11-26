import assert from 'node:assert/strict';
import test from 'node:test';
import * as domain from '../../packages/domain/dist/index.js';
import * as protection from '../../packages/domain/dist/arena-live-protection.js';
import { driveFrozenDecision } from './arena-isolated-business.mjs';

function controlled() {
  const sdk = { ...domain, ...protection };
  const account = { revision: 65, cash: '100000', positions: [], fills: [], orders: [],
    wakeups: [], watchedSymbols: ['588000.SH'], cashSettlements: [] };
  const decision = { summary: '受控业务校验', cancelOrderIds: [], watchedSymbols: ['588000.SH'],
    wakeups: [{ kind: 'time', at: '2026-11-10T05:05:00Z' }],
    orders: [{ clientId: 'buy', symbol: '588000.SH', side: 'buy', kind: 'limit', quantity: '14800',
      price: '1.345', expiresOn: null, exitGroup: null, onFill: { activation: 'on_full_fill',
        afterExit: 'cancel_entry_remainder', exitPolicy: 'single', activateOrders: [{ clientId: 'stop',
          side: 'sell', kind: 'stop_loss', price: '1.340', quantity: { basis: 'parent_open_quantity' },
          reduceOnly: true, validUntil: { kind: 'activation_session_close' } }] } }] };
  const context = at => ({ at, tradingDate: '2026-11-10',
    fees: { version: 'fixed-v1', buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 },
    allowedSymbols: new Set(['588000.SH']), maxActiveSymbols: 50, maxPositionBps: 10000,
    expiresAt: () => '2026-11-10T07:00:00.000Z', newId: (() => { let id = 0; return () => `controlled-${++id}`; })(),
    quotes: [{ symbol: '588000.SH', price: '1.343', marketTime: at, observedAt: at, tradingDate: '2026-11-10',
      lot: '100', tick: '0.001', positionAvailableOn: '2026-11-11', cashAvailableOn: '2026-11-10',
      buyBlocked: null, sellBlocked: null, sourceRef: 'controlled:minute',
      evidence: { fact: { executionRules: { statutoryCharges: [
        { code: 'sseFundHandling', side: 'both', rate: '0.00004', minimum: null },
      ] } } }, statutoryBuyFee: amount => domain.DecimalValue.from(amount).times('0.00004').toString(),
      statutorySellFee: amount => domain.DecimalValue.from(amount).times('0.00004').toString() }],
  });
  const build = async (_books, _decision, at) => ({ context: context(at),
    session: { state: 'open', sessions: [{ startAt: '2026-11-10T05:00:00.000Z', endAt: '2026-11-10T07:00:00.000Z' }] } });
  const command = value => ({ ...value, orders: value.orders.map(order => ({ ...order, clientId: 'scope:' + order.clientId,
    onFill: { ...order.onFill, activateOrders: order.onFill.activateOrders.map(child => ({ ...child, clientId: 'scope:' + child.clientId })) } })) });
  return { sdk, account, decision, build, command };
}

test('真实 SDK 验证买入费用、账户精度、T+1 和原止损到期，不修改原决策', async () => {
  const f = controlled();
  const result = await driveFrozenDecision(f.account, f.decision, f.sdk, f.build, f.command);
  assert.equal(result.accountResult.cash, '80122.804944');
  assert.equal(result.accountResult.navAtFill, '99999.204944');
  assert.equal(result.feeAudit.charged, '0.795056');
  assert.equal(result.protection.outcome, 'expired_before_position_sellable');
  assert.equal(result.accountAfterExpiry.positions.length, 1);
  assert.equal(f.account.revision, 65);
});

test('缺少提交后行情时停止，不借旧行情成交', async () => {
  const f = controlled(), build = f.build;
  f.build = async (...args) => {
    const result = await build(...args);
    result.context.quotes[0].marketTime = '2026-11-10T05:01:00.000Z';
    return result;
  };
  await assert.rejects(driveFrozenDecision(f.account, f.decision, f.sdk, f.build, f.command), /缺少提交后/u);
});

test('实际收费回调重复收取经手费时，独立公式会拒绝验收', async () => {
  const f = controlled(), build = f.build;
  f.build = async (...args) => {
    const result = await build(...args);
    result.context.quotes[0].statutoryBuyFee = amount => domain.DecimalValue.from(amount).times('0.00008').toString();
    return result;
  };
  await assert.rejects(driveFrozenDecision(f.account, f.decision, f.sdk, f.build, f.command), assert.AssertionError);
});
