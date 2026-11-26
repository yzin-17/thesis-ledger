import { expect, it } from 'vitest';
import {
  evaluateNumericExpression,
  numericExpressionKey,
  type BacktestSeries,
  type NumericExpression,
} from '@thesis-ledger/domain';
import { buildPointInTimeIndicatorSeries } from '../../src/backtest/backtest-adjusted-indicators.js';
import { planBacktestPriceInputs } from '../../src/backtest/backtest-dependency-price.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';

it('小时决策只使用已完成且可见的日线历史，不借未来日线或尚未公布的取值', () => {
  const expression: NumericExpression = {
    type: 'lag',
    periods: 1,
    input: { type: 'series', sourceId: 'daily', field: 'close' },
  };
  const source: BacktestSeries = {
    sourceId: 'daily',
    field: 'close',
    symbol: '159516.SZ',
    market: 'CN',
    assetType: 'etf',
    timeframe: '1d',
    adjusted: false,
    points: [
      {
        occurredAt: '2026-05-14T07:00:00Z',
        availableAt: '2026-05-14T07:00:00Z',
        value: '90',
        status: 'available',
      },
      {
        occurredAt: '2026-05-15T07:00:00Z',
        availableAt: '2026-05-18T08:00:00Z',
        value: '95',
        status: 'available',
      },
      {
        occurredAt: '2026-05-18T07:00:00Z',
        availableAt: '2026-05-18T07:00:00Z',
        value: '100',
        status: 'available',
      },
    ],
  };
  const ticks = ['2026-05-18T03:00:00Z', '2026-05-18T07:00:00Z', '2026-05-18T08:00:00Z'].map(
    (occurredAt) => ({ occurredAt, availableAt: occurredAt }),
  );
  const sourceSeries = new Map([['daily:close', source]]);
  const indicatorSeries = buildPointInTimeIndicatorSeries({
    expressions: [expression],
    sourceSeries,
    corporateActions: [],
    ticks,
  });
  const read = (index: number) =>
    evaluateNumericExpression(expression, { sourceSeries, indicatorSeries, tick: ticks[index]! });
  expect(read(0)).toMatchObject({ status: 'available', value: '90' });
  expect(read(1).status).toBe('unavailable');
  expect(read(2)).toMatchObject({ status: 'available', value: '95' });
  expect(indicatorSeries.get(numericExpressionKey(expression))?.strictObservations).toBe(true);
});

it('累计锚点扩大正式准备范围，已冻结预算拒绝静默扩大', async () => {
  const f = await completeSnapshotFixture();
  f.input.strategy.entry = {
    type: 'compare',
    operator: 'gt',
    left: {
      type: 'cumulative',
      statistic: 'sum',
      anchorAt: '2025-01-02T07:00:00Z',
      input: { type: 'series', sourceId: 'execution', field: 'close' },
    },
    right: { type: 'constant', value: '0' },
  };
  const plan = planBacktestPriceInputs(f.input.strategy, f.input.runConfig);
  expect(plan.warmup.startDate).toBe('2025-01-02');
  const frozen = planBacktestPriceInputs(f.input.strategy, {
    ...f.input.runConfig,
    frozenWarmupBudgetSessions: 30,
  });
  expect(frozen.blockingIssues).toContainEqual(
    expect.objectContaining({
      code: 'INVALID_WARMUP_RANGE',
      message: expect.stringContaining('累计锚点'),
    }),
  );
});
