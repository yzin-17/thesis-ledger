import type { BacktestJob } from '../src/features/strategy/strategy.types';

export const unifiedRatioCases = [
  {
    name: 'ordinary',
    value: 0.1234,
    expected: '12.34%',
    magnitude: '12.34%',
    chart: -0.1234,
    chartExpected: '-12.34%',
  },
  {
    name: 'rounding',
    value: '0.01005000000000000000001',
    expected: '1.01%',
    magnitude: '1.01%',
    chart: -0.01005,
    chartExpected: '-1.01%',
  },
  {
    name: 'tiny',
    value: '0.' + '0'.repeat(399) + '1',
    expected: '1E-398%',
    magnitude: '1E-398%',
    chart: -1e-9,
    chartExpected: '-1E-7%',
  },
  {
    name: 'negative',
    value: -1e-9,
    expected: '-1E-7%',
    magnitude: '1E-7%',
    chart: -1e-9,
    chartExpected: '-1E-7%',
  },
  {
    name: 'maximum',
    value: Number.MAX_VALUE,
    expected: '1.797693E310%',
    magnitude: '1.797693E310%',
    chart: -1e-9,
    chartExpected: '-1E-7%',
  },
  {
    name: 'huge',
    value: '1' + '0'.repeat(400),
    expected: '1E402%',
    magnitude: '1E402%',
    chart: -1e-9,
    chartExpected: '-1E-7%',
  },
  {
    name: 'zero',
    value: '0',
    expected: '0.00%',
    magnitude: '0.00%',
    chart: 0,
    chartExpected: '0.00%',
  },
] as const;

export function unifiedRatioJob(value: unknown, chartValue = -1e-9): BacktestJob {
  const metric = (input: unknown) => ({ status: 'available', value: input });
  const time = (index: number) => new Date(Date.UTC(2026, 10, 1 + index, 7)).toISOString();
  return {
    id: 'ratio-job',
    strategyVersionId: 'ratio-version',
    status: 'succeeded',
    mode: 'V2',
    period: { start: '2026-11-01', end: '2026-11-03' },
    input: { runConfig: { baseCurrency: 'CNY', initialCash: { CNY: '100' } } },
    result: {
      schemaVersion: '3',
      completeness: 'complete',
      metrics: {
        totalReturn: metric(value),
        cagr: metric(value),
        maxDrawdown: metric(value),
        tradeWinRate: metric(value),
        sharpe: metric('1.234'),
        profitFactor: metric('2.5'),
        volatility: { status: 'unavailable', reason: '缺少有效估值' },
      },
      benchmark: { totalReturn: metric(value), excessReturn: metric(value) },
      benchmarkCompatibility: {
        status: 'compatible',
        strategyFingerprint: 'a'.repeat(16),
        benchmarkFingerprint: 'a'.repeat(16),
        missingFields: [],
        differentFields: [],
        costAssumption: {
          kind: 'execution-model',
          version: 'execution-model-cost-v1',
          fingerprint: 'b'.repeat(16),
        },
      },
      equityCurve: [100, 110, 105].map((value, index) => ({
        occurredAt: time(index),
        value: { amount: String(value), currency: 'CNY' },
      })),
      drawdownCurve: [0, 1, 2].map((index) => ({
        occurredAt: time(index),
        drawdown: String(chartValue),
      })),
      simulationFills: [],
      trades: [],
      rejectedOrders: [],
      warnings: ['冻结说明：收益 0.00%'],
    },
  } as unknown as BacktestJob;
}
