import { describe, expect, it } from 'vitest';
import {
  evaluateBooleanExpression,
  evaluateIndicator,
  numericExpressionKey,
  splitWarmup,
  strategyRequiredLookback,
  type BacktestSeries,
  type BacktestSeriesPoint,
  type BooleanExpression,
} from '@thesis-ledger/domain';
import { strategySchema, type BacktestStrategy } from '@thesis-ledger/schemas';
import { buildPointInTimeIndicatorSeries } from '../../src/backtest/backtest-adjusted-indicators.js';
import { planBacktestPriceInputs } from '../../src/backtest/backtest-dependency-price.js';

// 独立模拟的已完成日线观测；周末无点，不代表真实来源或日历验收。
const dates = [
  '02',
  '03',
  '04',
  '05',
  '06',
  '09',
  '10',
  '11',
  '12',
  '13',
  '16',
  '17',
  '18',
  '19',
  '20',
  '23',
  '24',
  '25',
  '26',
  '27',
  '30',
].map((day) => `2026-03-${day}T07:00:00Z`);
const highest = {
  type: 'indicator' as const,
  name: 'Highest' as const,
  input: { type: 'series' as const, sourceId: 'price', field: 'high' as const },
  params: { period: 20 },
};
const entry: BooleanExpression = {
  type: 'compare',
  operator: 'gt',
  left: { type: 'series', sourceId: 'price', field: 'close' },
  right: highest,
};
const strategy = strategySchema.parse({
  schemaVersion: 'strategy-definition-v1',
  name: '含当根最高价窗口对照',
  signalSources: [
    {
      id: 'price',
      priceCoordinate: 'actual',
      asset: { symbol: '600000.SH', market: 'CN', assetType: 'stock' },
      timeframe: '1d',
      series: ['high', 'close'],
    },
  ],
  executionInstrument: { symbol: '600000.SH', market: 'CN', assetType: 'stock' },
  primaryTimeframe: '1d',
  entry,
  exit: {
    type: 'compare',
    operator: 'lt',
    left: entry.left,
    right: { type: 'constant', value: '0' },
  },
  sizing: { type: 'fixedQuantity', quantity: '100' },
  risk: [],
  execution: {
    mode: 'exchange',
    orderType: 'market',
    timeInForce: 'DAY',
    timing: 'nextEligibleBarOpen',
  },
  cost: { commissionRate: '0', slippageRate: '0' },
}) as BacktestStrategy;

const points = (count: number, lastHigh = '100'): BacktestSeriesPoint[] =>
  dates.slice(0, count).map((at, index) => ({
    occurredAt: at,
    availableAt: at,
    status: 'available',
    value: index === count - 1 ? lastHigh : '100',
  }));

function context(highPoints: BacktestSeriesPoint[], close: string) {
  const at = highPoints.at(-1)!.occurredAt;
  const highSeries: BacktestSeries = {
    sourceId: 'price',
    symbol: '600000.SH',
    market: 'CN',
    assetType: 'stock',
    field: 'high',
    timeframe: '1d',
    adjusted: false,
    points: highPoints,
  };
  const sourceSeries = new Map<string, BacktestSeries>([
    ['price:high', highSeries],
    [
      'price:close',
      {
        ...highSeries,
        field: 'close',
        points: [{ occurredAt: at, availableAt: at, value: close, status: 'available' }],
      },
    ],
  ]);
  return {
    tick: { occurredAt: at },
    sourceSeries,
    indicatorSeries: buildPointInTimeIndicatorSeries({
      expressions: [strategy.entry],
      sourceSeries,
      corporateActions: [],
      ticks: [{ occurredAt: at, availableAt: at }],
    }),
  };
}

describe('R11 的已有窗口行为与独立预期对照', () => {
  it('Highest(20) 包含当根，以当前值和此前 19 个值完成预热', () => {
    const input = points(20);
    expect(strategyRequiredLookback(strategy).entry).toBe(20);
    expect(splitWarmup(input, dates[19]!, 20).status).toBe('available');
    const result = context(input, '100').indicatorSeries.get(numericExpressionKey(highest));
    expect(result?.points.at(-1)).toMatchObject({ status: 'available', value: '100' });
  });

  it('正式准备规划沿用 20 期需求，并拒绝小于需求的冻结预算', () => {
    const config = { startDate: '2026-03-30', endDate: '2026-03-31', baseCurrency: 'CNY' as const };
    const planned = planBacktestPriceInputs(strategy, {
      ...config,
      frozenWarmupBudgetSessions: 20,
    });
    expect(planned.warmup.lookbackPeriods).toBe(20);
    expect(planned.blockingIssues).toEqual([]);
    expect(
      planBacktestPriceInputs(strategy, { ...config, frozenWarmupBudgetSessions: 19 })
        .blockingIssues,
    ).toEqual([expect.objectContaining({ code: 'INVALID_WARMUP_RANGE', path: ['warmup'] })]);
  });

  it.each([
    { close: '105', expectedBreakout: true },
    { close: '100', expectedBreakout: false },
  ])('此前 20 根最高 100、当根最高 110、收盘 $close', ({ close, expectedBreakout }) => {
    const input = points(21, '110');
    // 只用既定的此前 20 根校验独立预期，不将常量替换宣称为历史引用能力。
    expect(
      evaluateIndicator('Highest', input.slice(0, -1), { period: 20 }).points.at(-1)?.value,
    ).toBe('100');
    const evaluation = context(input, close);
    expect(
      evaluation.indicatorSeries.get(numericExpressionKey(highest))?.points.at(-1)?.value,
    ).toBe('110');
    expect(evaluateBooleanExpression(entry, evaluation)).toMatchObject({
      status: 'available',
      value: false,
    });
    expect(
      evaluateBooleanExpression(
        { ...entry, right: { type: 'constant', value: '100' } },
        evaluation,
      ),
    ).toMatchObject({ status: 'available', value: expectedBreakout });
  });

  it('相同阈值的严格大于拒绝等值，并接受比阈值大的高精度值', () => {
    for (const [close, value] of [
      ['100', false],
      ['100.00000000000000000001', true],
    ] as const) {
      expect(
        evaluateBooleanExpression(
          { ...entry, right: { type: 'constant', value: '100' } },
          context(points(20, '110'), close),
        ),
      ).toMatchObject({ status: 'available', value });
    }
  });

  it('总样本不足 20 根时保留不可用，不产生突破信号', () => {
    const input = points(19);
    expect(splitWarmup(input, dates[18]!, 20).status).toBe('unavailable');
    expect(evaluateIndicator('Highest', input, { period: 20 }).points.at(-1)?.status).toBe(
      'unavailable',
    );
    expect(evaluateBooleanExpression(entry, context(input, '105')).status).toBe('unavailable');
  });

  it('首个完整窗口含缺值时不可用，不跳过缺值凑满窗口', () => {
    const input = points(20);
    input[5] = { occurredAt: dates[5]!, availableAt: dates[5]!, status: 'unavailable' };
    expect(evaluateIndicator('Highest', input, { period: 20 }).points.at(-1)?.status).toBe(
      'unavailable',
    );
    expect(evaluateBooleanExpression(entry, context(input, '105')).status).toBe('unavailable');
  });

  it('首个完整窗口的延迟观测不会因整段预计算而提前可见', () => {
    const input = points(20);
    input[5] = { ...input[5]!, availableAt: dates[20]! };
    expect(evaluateIndicator('Highest', input, { period: 20 }).points.at(-1)?.availableAt).toBe(
      dates[20],
    );
    expect(evaluateBooleanExpression(entry, context(input, '105')).status).toBe('unavailable');
  });
});
