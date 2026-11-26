import { expect, it } from 'vitest';
import { BacktestTradeVolatility } from '../src/backtest-trade-volatility.js';
import { DecimalValue as D } from '../src/decimal.js';
import { tradingCalendarFromFact } from '../src/execution-rules.js';
import type { BacktestSeries } from '../src/backtest-series.js';
import type { BacktestTradePlan } from '../src/backtest-trade-plan-contract.js';
import { strategyRequiredLookback } from '../src/backtest-indicators.js';

const config: NonNullable<BacktestTradePlan['volatilityTarget']> = {
  returnPeriods: 20,
  targetAnnualVolatility: '0.1',
  maxEquityFraction: '0.5',
  annualizationPeriods: 252,
  returnKind: 'simple',
  variance: 'sample',
  update: 'dailyClose',
};
const dates = [
  '01',
  '02',
  '03',
  '04',
  '07',
  '08',
  '09',
  '10',
  '11',
  '14',
  '15',
  '16',
  '17',
  '18',
  '21',
  '22',
  '23',
  '24',
  '25',
  '28',
  '29',
  '30',
].map((day) => '2026-09-' + day + 'T07:00:00.000Z');
const source = {
  calendar: tradingCalendarFromFact({
    market: 'CN',
    timezone: 'Asia/Shanghai',
    provider: 'fixture',
    providerRevision: '1',
    availableAt: '2026-08-01T00:00:00Z',
    range: { start: '2026-09-01', end: '2026-10-01' },
    holidays: [],
    sessions: [{ startMinute: 570, endMinute: 900 }],
    sessionOverrides: [],
  }),
  availableAt: '2026-08-01T00:00:00Z',
};
function prices(amplitude = '0.01', count = 21): BacktestSeries {
  let price = D.from('100');
  return {
    sourceId: 'execution',
    symbol: '159516.SZ',
    market: 'CN',
    assetType: 'etf',
    field: 'close',
    timeframe: '1d',
    adjusted: true,
    points: dates.slice(0, count).map((at, n) => {
      if (n) price = price.times(D.from('1').plus(n % 2 ? amplitude : '-' + amplitude));
      return {
        occurredAt: at,
        availableAt: at,
        value: price.toString(),
        status: 'available' as const,
      };
    }),
  };
}
const result = (series: BacktestSeries, patch = {}) =>
  new BacktestTradeVolatility({ ...config, ...patch }, series, source).at(dates[20]!);

it('相同均值而波动翻倍使目标权重减半；样本方差用 N-1，且最大投入封顶', () => {
  const low = result(prices(), { maxEquityFraction: '1' }),
    high = result(prices('0.02'), { maxEquityFraction: '1' });
  expect(low.status).toBe('available');
  expect(high.status).toBe('available');
  if (low.status !== 'available' || high.status !== 'available') throw new Error('缺统计结果');
  expect(Number(low.annualVolatility)).toBeCloseTo(Math.sqrt((0.002 / 19) * 252), 12);
  expect(Number(high.targetWeight) * 2).toBeCloseTo(Number(low.targetWeight), 12);
  expect(result(prices())).toMatchObject({ status: 'available', targetWeight: '0.5' });
  expect(result(prices('0.0000000001'))).toMatchObject({
    status: 'available',
    targetWeight: '0.5',
  });
  expect(
    strategyRequiredLookback({
      entry: { type: 'positionState', field: 'isOpen' },
      exit: { type: 'positionState', field: 'isOpen' },
      tradePlan: { version: 1, evaluation: 'barClose', stages: [], volatilityTarget: config },
    }).required,
  ).toBe(21);
});
it('20 个收益确实需要21个收盘；不读取未来收盘，也不把旧价格当本日收盘', () => {
  expect(result(prices('0.01', 20))).toMatchObject({
    reason: 'TRADE_PLAN_VOLATILITY_WINDOW_UNFILLED',
  });
  const series = prices('0.01', 22);
  expect(result(series)).toEqual(result(prices()));
  expect(
    new BacktestTradeVolatility(config, series, source).at('2026-10-01T07:00:00Z'),
  ).toMatchObject({ reason: 'TRADE_PLAN_VOLATILITY_CURRENT_CLOSE_MISSING' });
});
it('窗口内不可见或坏样本不能跳过补齐；整日缺失及重复日线有明确原因', () => {
  const original = prices();
  for (const patch of [
    { availableAt: '2026-09-30T00:00:00Z' },
    { value: undefined, status: 'unavailable' as const },
    { value: '0' },
  ]) {
    const series = {
      ...original,
      points: original.points.map((point, n) => (n === 10 ? { ...point, ...patch } : point)),
    };
    expect(result(series).status).toBe('unavailable');
  }
  const long = prices('0.01', 22);
  const missing = { ...long, points: long.points.filter((_, n) => n !== 10) };
  expect(new BacktestTradeVolatility(config, missing, source).at(dates[21]!)).toMatchObject({
    reason: 'TRADE_PLAN_VOLATILITY_MISSING_TRADING_DATE',
  });
  const duplicate = { ...original, points: [...original.points, original.points[20]!] };
  expect(result(duplicate)).toMatchObject({ reason: 'TRADE_PLAN_VOLATILITY_DUPLICATE_DATE' });
});
it('日线日期锚点与收盘决策时点不同，仍使用冻结研究时钟验证当日完整收盘', () => {
  const original = prices();
  const anchored: BacktestSeries = {
    ...original,
    points: original.points.map((point) => ({
      ...point,
      occurredAt: point.occurredAt.slice(0, 10) + 'T00:00:00+08:00',
      availableAt: '2026-10-01T00:00:00Z',
      researchClock: {
        basis: 'fixed-provider-snapshot',
        dataAsOf: '2026-10-02T00:00:00Z',
        decisionAt: point.occurredAt,
      },
    })),
  };
  const expected = result(original);
  if (expected.status !== 'available') throw new Error('缺少对照波动率');
  expect(result(anchored)).toMatchObject({
    status: 'available',
    annualVolatility: expected.annualVolatility,
    targetWeight: expected.targetWeight,
  });
  const last = anchored.points.at(-1)!;
  const futureClose = {
    ...anchored,
    points: [
      ...anchored.points.slice(0, -1),
      {
        ...last,
        researchClock: { ...last.researchClock!, decisionAt: dates[21]! },
      },
    ],
  };
  expect(result(futureClose)).toMatchObject({
    reason: 'TRADE_PLAN_VOLATILITY_CURRENT_CLOSE_MISSING',
  });
});
it('旧日线延迟到当日发布，仍不能充当本日收盘', () => {
  const series = prices();
  const next = dates[21]!;
  const late = {
    ...series,
    points: series.points.map((point, n) => (n === 20 ? { ...point, availableAt: next } : point)),
  };
  expect(new BacktestTradeVolatility(config, late, source).at(next)).toMatchObject({
    reason: 'TRADE_PLAN_VOLATILITY_CURRENT_CLOSE_MISSING',
  });
});
it('零波动、非日线、日历缺失／未来均不回退为常量权重；固定研究截点仍明确验证', () => {
  expect(result(prices('0'))).toMatchObject({
    reason: 'TRADE_PLAN_VOLATILITY_VOLATILITY_NON_POSITIVE',
  });
  expect(result({ ...prices(), timeframe: '5m' })).toMatchObject({
    reason: 'TRADE_PLAN_VOLATILITY_DAILY_CLOSE_REQUIRED',
  });
  expect(new BacktestTradeVolatility(config, prices(), undefined).at(dates[20]!)).toMatchObject({
    reason: 'TRADE_PLAN_VOLATILITY_CALENDAR_MISSING',
  });
  const future = { ...source, availableAt: '2026-09-30T00:00:00Z' };
  expect(new BacktestTradeVolatility(config, prices(), future).at(dates[20]!)).toMatchObject({
    reason: 'TRADE_PLAN_VOLATILITY_CALENDAR_NOT_VISIBLE',
  });
  expect(
    new BacktestTradeVolatility(config, prices(), {
      ...future,
      research: { basis: 'fixed-provider-snapshot', dataAsOf: '2026-10-01T00:00:00Z' },
    }).at(dates[20]!).status,
  ).toBe('available');
});
