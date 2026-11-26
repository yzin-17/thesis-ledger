import { expect, it } from 'vitest';
import { arenaSellAvailability, ArenaSellAvailabilityError } from '../src/arena-live-sell-availability.js';
import { arenaSubmitDecision } from '../src/arena-live-submit.js';
import type { ArenaPaperAccount, ArenaPaperContext, ArenaPaperDecision } from '../src/arena-live-types.js';

const book = (): ArenaPaperAccount => ({ revision: 0, cash: '100000', cashSettlements: [], orders: [], wakeups: [], watchedSymbols: [], fills: [],
  positions: [{ symbol: '510300.SH', quantity: '5000', acquiredOn: '2026-11-02', availableOn: '2026-11-03', entryOrderId: 'entry' }] });
const decision: ArenaPaperDecision = { summary: '卖出', cancelOrderIds: [], watchedSymbols: ['510300.SH'],
  wakeups: [{ kind: 'time', at: '2026-11-04T01:31:00Z' }], orders: [{ clientId: 'sell', symbol: '510300.SH',
    side: 'sell', kind: 'market', quantity: '5000', price: null, expiresOn: null, exitGroup: null }] };
const context = (day = '2026-11-02'): ArenaPaperContext => ({ at: day + 'T02:30:00Z', tradingDate: day,
  maxPositionBps: 10000, maxActiveSymbols: 50, allowedSymbols: new Set(['510300.SH']),
  fees: { buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 }, newId: () => 'sell-id', expiresAt: () => day + 'T03:30:00Z',
  quotes: [{ symbol: '510300.SH', price: '4.091', marketTime: day + 'T02:30:00Z', observedAt: day + 'T02:30:00Z', sourceRef: 'fixture',
    tradingDate: day, positionAvailableOn: '2026-11-03', cashAvailableOn: day, lot: '100', tick: '0.001',
    buyBlocked: null, sellBlocked: null, statutoryBuyFee: () => '0', statutorySellFee: () => '0', evidence: {} }] });

it('T+1 拒绝保留旧错误码并提供实际可卖日，原账户与预约不变', () => {
  const original = book(), frozen = structuredClone(original);
  let failure: unknown;
  try { arenaSubmitDecision(original, 0, decision, context()); } catch (e) { failure = e; }
  expect(failure).toBeInstanceOf(ArenaSellAvailabilityError);
  expect(failure).toMatchObject({ message: 'insufficient_position', reason: 'position_not_settled', requestedQuantity: '5000',
    availability: { totalQuantity: '5000', settledQuantity: '0', unsettledQuantity: '5000', availableQuantity: '0', reservedQuantity: '0',
      settlements: [{ availableOn: '2026-11-03', quantity: '5000' }] } });
  expect(original).toEqual(frozen);
  expect(arenaSubmitDecision(original, 0, decision, context('2026-11-03')).orders).toHaveLength(1);
});
it('实际可卖日支持 T+0、跨周末、分批解锁，超持仓和占用不同于未结算', () => {
  const original = book();
  original.positions.push({ symbol: '510300.SH', quantity: '3000', acquiredOn: '2026-10-30', availableOn: '2026-11-02' });
  expect(arenaSellAvailability(original, '510300.SH', '2026-11-02')).toMatchObject({ totalQuantity: '8000', settledQuantity: '3000', availableQuantity: '3000' });
  expect(new ArenaSellAvailabilityError(arenaSellAvailability(original, '510300.SH', '2026-11-02'), '9000').reason).toBe('insufficient_holding');
  original.positions[0]!.availableOn = '2026-11-02';
  expect(arenaSellAvailability(original, '510300.SH', '2026-11-02').availableQuantity).toBe('8000');
});
it('OCO 占用不双算，取消委托释放占用但不提前解锁 T+1；拒绝撤单同样原子回滚', () => {
  const original = book(); original.positions[0]!.availableOn = '2026-11-02';
  const pair: ArenaPaperDecision = { ...decision, orders: [
    { ...decision.orders[0]!, clientId: 'stop', kind: 'stop_loss', price: '4', exitGroup: 'g' },
    { ...decision.orders[0]!, clientId: 'take', kind: 'take_profit', price: '5', exitGroup: 'g' },
  ] };
  let n = 0; const active = arenaSubmitDecision(original, 0, pair, { ...context(), newId: () => 'order-' + ++n });
  const available = arenaSellAvailability(active, '510300.SH', '2026-11-02');
  expect(available).toMatchObject({ reservedQuantity: '5000', availableQuantity: '0' });
  expect(new ArenaSellAvailabilityError(available, '5000').reason).toBe('sell_orders_reserved');
  const cancel = { ...decision, cancelOrderIds: active.orders.map(o => o.id) };
  expect(arenaSubmitDecision(active, active.revision, cancel, context()).orders.at(-1)!.clientId).toBe('sell');
  active.positions[0]!.availableOn = '2026-11-03'; const before = structuredClone(active);
  expect(() => arenaSubmitDecision(active, active.revision, cancel, context())).toThrow('insufficient_position');
  expect(active).toEqual(before);
});
