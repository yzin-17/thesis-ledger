import { expect, it } from 'vitest';
import { createBacktestDailyOrder, acceptBacktestOrderFill, updateBacktestProtection, endBacktestOrder, triggerBacktestOrder } from '../src/backtest-order-state.js';
import { backtestDailyOrderResultRows } from '../src/backtest-daily-order-result-display.js';

function orders(activation: 'eachFill' | 'fullFill') {
  const buy = createBacktestDailyOrder({ id: 'buy-1', templateId: 'buy', cycleId: 'cycle-1', side: 'buy', action: { kind: 'entry' }, quantityBasis: 'actual-units', quantity: '27', acceptedSequence: 0, validity: { kind: 'DAY' }, price: { kind: 'limit', price: '359.50' }, activatedBarIndex: 0, eligibleFrom: { barIndex: 0, phase: 'open' } });
  const stop = createBacktestDailyOrder({ id: 'stop-1', templateId: 'stop', cycleId: 'cycle-1', side: 'sell', action: { kind: 'stopLoss' }, quantityBasis: 'actual-units', quantity: '0', acceptedSequence: 1, validity: { kind: 'position' }, price: { kind: 'stopMarket', price: '355' }, parent: { orderId: buy.id, activation } });
  return { buy, stop };
}
it('部分成交后撤余单，退出4后的保护明细只显示余6，保留不同撮合阶段', () => {
  const f = orders('eachFill'), at = { barIndex: 0, phase: 'range' as const };
  const bought = endBacktestOrder(acceptBacktestOrderFill(f.buy, { fillId: 'buy-fill', quantity: '10', at }).order, 'cancelled');
  let stop = updateBacktestProtection(f.stop, bought, '0', at);
  stop = triggerBacktestOrder(stop, { barIndex: 1, phase: 'open' });
  stop = acceptBacktestOrderFill(stop, { fillId: 'sell-fill', quantity: '4', at: { barIndex: 1, phase: 'open' } }).order;
  stop = updateBacktestProtection(stop, bought, '4', { barIndex: 1, phase: 'open' });
  const input = [bought, stop], before = structuredClone(input), rows = backtestDailyOrderResultRows(input);
  expect(rows.map(r => r.id)).toEqual(['stop-1', 'buy-1']);
  expect(rows[0]!.quantity).toContain('未成交 6');
  expect(rows[0]!.terms).toContain('每次成交后按量保护');
  expect(rows[0]!.timing).toContain('最早撮合：冻结第 2 根开盘');
  expect(rows[0]!.timing).toContain('触发：冻结第 2 根开盘');
  expect(rows[1]!.quantity).toContain('未成交 17');
  expect(rows[1]!.state).toBe('已撤销');
  expect(input).toEqual(before);
});
it('父单部分成交即到期时，全成保护显示未激活与零数量，不假装已有保护', () => {
  const f = orders('fullFill'), at = { barIndex: 0, phase: 'open' as const };
  const parent = endBacktestOrder(acceptBacktestOrderFill(f.buy, { fillId: 'buy-fill', quantity: '10', at }).order, 'expired');
  const stop = updateBacktestProtection(f.stop, parent, '0', at), row = backtestDailyOrderResultRows([stop])[0]!;
  expect(row.state).toBe('已撤销');
  expect(row.quantity).toContain('目标 0');
  expect(row.timing).toContain('未激活');
  expect(row.timing).toContain('最早撮合：尚未开始');
  expect(row.terms).toContain('全部成交后才保护');
});

it.each(['eachFill', 'fullFill'] as const)('整笔模拟按实际运行政策回读保护 %s', activation => {
  const { buy, stop } = orders(activation);
  const liquidity = { kind: 'wholeOrder' } as const;
  expect(backtestDailyOrderResultRows([buy, stop], liquidity)[0]!.terms).toContain('建仓成交后保护');
  const addition = { ...buy, action: { kind: 'stage', stageId: 'add' } } as const;
  expect(backtestDailyOrderResultRows([addition, stop], liquidity)[0]!.terms).toContain('加仓成交后保护');
  expect(stop.parent?.activation).toBe(activation);
});
