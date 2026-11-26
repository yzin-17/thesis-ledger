import { expect, it } from 'vitest';
import { backtestTradePlanSchema } from '../src/backtest-trade-plan.js';
it('亏损暂停明确成交净收益、完整交易笔数和交易日；不要求止损或默认补计划', () => {
  const base = { version: 1, evaluation: 'barClose', stages: [] };
  const lossPause = { completedTrades: 3, tradingDays: 10, pnlBasis: 'fillsNetOfFees' };
  expect(backtestTradePlanSchema.parse(base)).toEqual(base);
  expect(backtestTradePlanSchema.parse({ ...base, lossPause }).lossPause).toEqual(lossPause);
  for (const patch of [
    { completedTrades: 0 },
    { completedTrades: 51 },
    { completedTrades: 1.5 },
    { tradingDays: 0 },
    { tradingDays: 1001 },
    { pnlBasis: 'totalReturn' },
    { extra: 1 },
  ])
    expect(
      backtestTradePlanSchema.safeParse({ ...base, lossPause: { ...lossPause, ...patch } }).success,
    ).toBe(false);
});
