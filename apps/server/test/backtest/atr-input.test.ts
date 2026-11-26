import { expect, it } from 'vitest';
import { evaluateIndicator, type BacktestSeries } from '@thesis-ledger/domain';
import { atrInputSeries } from '../../src/backtest/backtest-atr-input.js';
import { buildPointInTimeIndicatorSeries } from '../../src/backtest/backtest-adjusted-indicators.js';

const source = (field: BacktestSeries['field'], values: string[]): BacktestSeries => ({
  sourceId: 'main',
  symbol: '159516.SZ',
  market: 'CN',
  assetType: 'etf',
  timeframe: '1d',
  field,
  adjusted: true,
  points: values.map((value, i) => ({
    occurredAt: `2026-05-${18 + i}T07:00:00Z`,
    availableAt: `2026-05-${18 + i}T07:00:00Z`,
    value,
  })),
});
it('ATR在不变收盘时仍读取真实高低范围；缺high或low不能用收盘幅度兜底', () => {
  const close = source('close', ['10', '10', '10']);
  const high = source('high', ['12', '12', '12']),
    low = source('low', ['8', '8', '8']);
  const values = new Map([
    ['main:high', high],
    ['main:low', low],
  ]);
  const input = atrInputSeries(close, values, 'main');
  expect(evaluateIndicator('ATR', input.points, { period: 2 }).points.at(-1)!.value).toBe('4');
  expect(
    atrInputSeries(close, new Map(), 'main').points.every((p) => p.status === 'unavailable'),
  ).toBe(true);
  const delayed = structuredClone(high);
  delayed.points[2]!.availableAt = '2026-05-21T07:00:00Z';
  expect(
    atrInputSeries(
      close,
      new Map([
        ['main:high', delayed],
        ['main:low', low],
      ]),
      'main',
    ).points[2]!.availableAt,
  ).toBe('2026-05-21T07:00:00Z');
});

it('逐决策时点对齐保留ATR原始周期，不把上一期可见值冒充本期', () => {
  const close = source('close', ['10', '10', '10', '10']);
  const high = source('high', ['12', '12', '12', '12']);
  const low = source('low', ['8', '8', '8', '8']);
  high.points[3]!.availableAt = '2026-05-22T07:00:00Z';
  const output = buildPointInTimeIndicatorSeries({
    expressions: [
      {
        type: 'indicator',
        name: 'ATR',
        params: { period: 2 },
        input: { type: 'series', sourceId: 'main', field: 'close' },
      },
    ],
    sourceSeries: new Map([
      ['main:close', close],
      ['main:high', high],
      ['main:low', low],
    ]),
    corporateActions: [],
    ticks: close.points.map((p) => ({ occurredAt: p.occurredAt, availableAt: p.availableAt })),
  });
  const last = [...output.values()][0]!.points.at(-1)!;
  expect(last.occurredAt).toBe('2026-05-21T07:00:00Z');
  expect(last.valueOccurredAt).toBe('2026-05-20T07:00:00Z');
  expect(last.value).toBe('4');
});
