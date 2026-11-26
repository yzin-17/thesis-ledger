import { expect, it } from 'vitest';
import {
  assertBacktestTradabilityBars,
  type BacktestTradabilityDay,
} from '../src/backtest-tradability.js';

const days: BacktestTradabilityDay[] = [
  { date: '2026-05-18', state: 'observed-traded' },
  { date: '2026-05-19', state: 'assumed-untradable-no-bar' },
  { date: '2026-05-20', state: 'observed-traded' },
];
const range = { startDate: '2026-05-18', endDate: '2026-05-20' };
it('只保留真实交易日期，返回执行范围的缺日且不修改 Bar 日期', () => {
  const barDates = ['2026-05-18', '2026-05-20'];
  expect(assertBacktestTradabilityBars({ days, barDates, range })).toEqual(['2026-05-19']);
  expect(barDates).toEqual(['2026-05-18', '2026-05-20']);
});
it.each([
  ['2026-05-18', '2026-05-19', '2026-05-20'],
  ['2026-05-18'],
  ['2026-05-18', '2026-05-18', '2026-05-20'],
])('拒绝伪造缺日 Bar、遗漏已交易 Bar 或重复 Bar %j', (...barDates) => {
  expect(() => assertBacktestTradabilityBars({ days, barDates, range })).toThrow();
});
it('多窗允许相同的重叠状态，拒绝矛盾分类', () => {
  expect(
    assertBacktestTradabilityBars({
      days: [...days, days[1]!],
      barDates: ['2026-05-18', '2026-05-20'],
      range,
    }),
  ).toEqual(['2026-05-19']);
  expect(() =>
    assertBacktestTradabilityBars({
      days: [...days, { date: '2026-05-19', state: 'observed-traded' }],
      barDates: ['2026-05-18', '2026-05-20'],
      range,
    }),
  ).toThrow(/冲突/);
});

it('价格观察仅对明确研究开放，不授予默认真实执行资格', () => {
  const priceOnly: BacktestTradabilityDay[] = [{ date: '2026-05-18', state: 'observed-price-only' }];
  const input = { days: priceOnly, barDates: ['2026-05-18'], range };
  expect(() => assertBacktestTradabilityBars(input)).toThrow('真实份额执行资格');
  expect(assertBacktestTradabilityBars({ ...input, allowPriceOnly: true })).toEqual([]);
});
