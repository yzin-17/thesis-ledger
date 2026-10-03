import { describe, expect, it } from 'vitest';
import { alignBacktestBenchmarkClosesV3 } from '../../src/backtest/backtest-v3-benchmark-alignment.js';

const close = (date: string) => ({
  tradingDate: date,
  occurredAt: `${date}T07:00:00Z`,
  decisionAt: `${date}T07:00:00Z`,
});
const equity = ['2026-05-18', '2026-05-19', '2026-05-20'].map((date) => ({
  occurredAt: `${date}T07:00:00Z`,
}));
const align = (closes: ReturnType<typeof close>[], skippedTradingDates: string[]) =>
  alignBacktestBenchmarkClosesV3({
    closes,
    equity,
    skippedTradingDates,
    dateFor: (instant) => instant.slice(0, 10),
  });
describe('缺日基准估值', () => {
  it('中间或尾部缺日沿用原价格时间，未认证缺日拒绝对齐', () => {
    const first = close('2026-05-18');
    expect(align([first, close('2026-05-20')], ['2026-05-19']).aligned).toEqual([
      first,
      first,
      close('2026-05-20'),
    ]);
    expect(align([first, close('2026-05-19')], ['2026-05-20']).aligned.at(-1)).toEqual(
      close('2026-05-19'),
    );
    expect(align([first, close('2026-05-20')], []).aligned).toHaveLength(1);
  });
  it('首日缺日从首个实际价格开始，不使用未来可用价格', () => {
    expect(align([close('2026-05-19'), close('2026-05-20')], ['2026-05-18']).expectedCount).toBe(2);
    const future = { ...close('2026-05-18'), decisionAt: '2026-05-20T07:00:00Z' };
    expect(align([future, close('2026-05-20')], ['2026-05-19']).aligned).toHaveLength(0);
  });
});
