import { describe, expect, it } from 'vitest';
import {
  applyCorporateActions,
  alignSeriesAt,
  buildSeriesVariantsAt,
  evaluateIndicator,
  evaluateIndicatorWithWarmup,
  requiredLookback,
} from '../src/index.js';

const point = (date: string, value: string, availableAt = `${date}T00:00:00Z`) => ({
  occurredAt: `${date}T00:00:00Z`,
  availableAt,
  value,
  close: value,
  high: value,
  low: value,
  volume: '10',
  status: 'available' as const,
});

const series = (points: ReturnType<typeof point>[]) => ({
  sourceId: '600519.SH',
  symbol: '600519.SH',
  market: 'CN' as const,
  assetType: 'stock' as const,
  field: 'close' as const,
  timeframe: '1d' as const,
  adjusted: false,
  points,
});

describe('backtest Series and Indicator domain', () => {
  it('calculates exact MA, EMA, RSI, Highest and Lowest golden values', () => {
    const input = [
      point('2025-01-01', '1'),
      point('2025-01-02', '2'),
      point('2025-01-03', '3'),
      point('2025-01-04', '4'),
    ];
    expect(evaluateIndicator('MA', input, { period: 2 }).points.map((item) => item.value)).toEqual([
      undefined,
      '1.5',
      '2.5',
      '3.5',
    ]);
    expect(evaluateIndicator('EMA', input, { period: 2 }).points.map((item) => item.value)).toEqual(
      [undefined, '1.5', '2.5', '3.5'],
    );
    expect(evaluateIndicator('RSI', input, { period: 2 }).points.at(-1)?.value).toBe('100');
    expect(evaluateIndicator('Highest', input, { period: 2 }).points.at(-1)?.value).toBe('4');
    expect(evaluateIndicator('Lowest', input, { period: 2 }).points.at(-1)?.value).toBe('3');
  });

  it('calculates MACD, ATR and VWAP with tracked availability', () => {
    const input = [
      { ...point('2025-01-01', '10', '2025-01-01T01:00:00Z'), high: '11', low: '9' },
      { ...point('2025-01-02', '11', '2025-01-02T02:00:00Z'), high: '12', low: '10' },
      { ...point('2025-01-03', '12', '2025-01-03T03:00:00Z'), high: '13', low: '11' },
      { ...point('2025-01-04', '13', '2025-01-04T04:00:00Z'), high: '14', low: '12' },
    ];
    const atr = evaluateIndicator('ATR', input, { period: 2 });
    expect(atr.points.at(-1)).toMatchObject({ value: '2', status: 'available' });
    expect(atr.points.at(-1)?.availableAt).toBe('2025-01-04T04:00:00Z');
    expect(evaluateIndicator('VWAP', input, { period: 2 }).points.at(-1)?.value).toBe('12.5');
    expect(
      evaluateIndicator(
        'MACD',
        input,
        { fastPeriod: 2, slowPeriod: 3, signalPeriod: 2 },
        { output: 'histogram' },
      ).requiredLookback,
    ).toBe(4);
  });

  it('uses absolute true-range gaps for ATR', () => {
    const input = [
      { ...point('2025-01-01', '10'), high: '11', low: '9' },
      { ...point('2025-01-02', '8'), high: '9', low: '8' },
    ];
    expect(evaluateIndicator('ATR', input, { period: 1 }).points[1]).toMatchObject({
      value: '2',
      status: 'available',
    });
  });

  it('derives lookback and keeps insufficient warmup explicitly unavailable', () => {
    const expression = {
      type: 'indicator' as const,
      name: 'RSI' as const,
      input: {
        type: 'indicator' as const,
        name: 'MA' as const,
        input: { type: 'series' as const, sourceId: 's', field: 'close' as const },
        params: { period: 3 },
      },
      params: { period: 2 },
    };
    expect(requiredLookback(expression)).toBe(5);
    const result = evaluateIndicatorWithWarmup(
      'MA',
      series([point('2025-01-01', '1'), point('2025-01-02', '2')]),
      { period: 3 },
      '2025-01-02T00:00:00Z',
    );
    expect(result.status).toBe('unavailable');
    expect(result.indicator.points[0]?.status).toBe('unavailable');
    const interrupted = evaluateIndicatorWithWarmup(
      'MA',
      series([
        point('2025-01-01', '1'),
        {
          occurredAt: '2025-01-02T00:00:00Z',
          availableAt: '2025-01-02T00:00:00Z',
          status: 'unavailable',
        },
        point('2025-01-03', '3'),
      ]),
      { period: 3 },
      '2025-01-03T00:00:00Z',
    );
    expect(interrupted.status).toBe('unavailable');
  });

  it('aligns by absolute occurredAt and availableAt without looking ahead', () => {
    const input = series([
      point('2025-01-01', '10', '2025-01-01T04:00:00Z'),
      point('2025-01-02', '11', '2025-01-03T04:00:00Z'),
      point('2025-01-03', '12', '2025-01-03T05:00:00Z'),
    ]);
    expect(alignSeriesAt(input, ['2025-01-02T12:00:00Z'])[0]?.point?.value).toBe('10');
    expect(alignSeriesAt(input, ['2025-01-03T06:00:00Z'])[0]?.point?.value).toBe('12');
    const intraday = {
      ...series([
        {
          ...point('2025-01-02', '20', '2025-01-02T01:00:00Z'),
          occurredAt: '2025-01-02T01:00:00Z',
        },
        {
          ...point('2025-01-02', '21', '2025-01-02T02:00:00Z'),
          occurredAt: '2025-01-02T02:00:00Z',
        },
      ]),
      sourceId: 'benchmark',
      timeframe: '5m' as const,
    };
    expect(alignSeriesAt(input, ['2025-01-02T02:30:00Z'])[0]?.point?.value).toBe('10');
    expect(alignSeriesAt(intraday, ['2025-01-02T02:30:00Z'])[0]?.point?.value).toBe('21');
  });

  it('adjusts only indicator series for available corporate actions', () => {
    const input = series([
      point('2025-01-01', '100', '2025-01-04T00:00:00Z'),
      point('2025-01-02', '50', '2025-01-04T00:00:00Z'),
      point('2025-01-03', '55', '2025-01-04T00:00:00Z'),
    ]);
    const action = {
      symbol: '600519.SH',
      market: 'CN' as const,
      assetType: 'stock' as const,
      occurredAt: '2025-01-02T00:00:00Z',
      availableAt: '2025-01-03T00:00:00Z',
      type: 'SPLIT' as const,
      ratio: '2',
    };
    const variants = buildSeriesVariantsAt(input, [action], '2025-01-04T00:00:00Z');
    expect(variants.raw.points.map((item) => item.value)).toEqual(['100', '50', '55']);
    expect(variants.adjusted.points.map((item) => item.value)).toEqual(['50', '50', '55']);
    expect(applyCorporateActions(input, [action], '2025-01-04T00:00:00Z').adjusted.adjusted).toBe(
      true,
    );
  });

  it('does not let a future available action change an earlier point', () => {
    const input = series([point('2025-01-01', '100'), point('2025-01-02', '110')]);
    const action = {
      symbol: '600519.SH',
      market: 'CN' as const,
      assetType: 'stock' as const,
      occurredAt: '2025-01-02T00:00:00Z',
      availableAt: '2025-01-03T00:00:00Z',
      type: 'SPLIT' as const,
      ratio: '2',
    };
    const atJan2 = buildSeriesVariantsAt(input, [action], '2025-01-02T00:00:00Z');
    const atJan3 = buildSeriesVariantsAt(input, [action], '2025-01-03T00:00:00Z');
    expect(atJan2.adjusted.points[0]?.value).toBe('100');
    expect(atJan3.adjusted.points[0]?.value).toBe('50');
    expect(evaluateIndicator('MA', atJan2.adjusted.points, { period: 2 }).points[1]?.value).toBe(
      '105',
    );
    expect(evaluateIndicator('MA', atJan3.adjusted.points, { period: 2 }).points[1]?.value).toBe(
      '80',
    );
  });

  it('does not adjust history before an announced corporate action becomes effective', () => {
    const input = series([point('2025-01-01', '100'), point('2025-01-02', '100')]);
    const action = {
      symbol: '600519.SH',
      market: 'CN' as const,
      assetType: 'stock' as const,
      occurredAt: '2025-01-03T00:00:00Z',
      availableAt: '2025-01-01T00:00:00Z',
      type: 'CASH_DIVIDEND' as const,
      cashAmount: '10',
    };

    expect(buildSeriesVariantsAt(input, [action], '2025-01-02T00:00:00Z').adjusted.points).toEqual(
      input.points,
    );
    expect(
      buildSeriesVariantsAt(input, [action], '2025-01-03T00:00:00Z').adjusted.points.map(
        (item) => item.value,
      ),
    ).toEqual(['90', '90']);
  });

  it('uses close prices as the cash-dividend adjustment reference for other price fields', () => {
    const openSeries = {
      ...series([point('2025-01-01', '80'), point('2025-01-02', '90')]),
      field: 'open' as const,
    };
    const closePoints = [point('2025-01-01', '100'), point('2025-01-02', '90')];
    const action = {
      symbol: '600519.SH',
      market: 'CN' as const,
      assetType: 'stock' as const,
      occurredAt: '2025-01-02T00:00:00Z',
      availableAt: '2025-01-02T00:00:00Z',
      type: 'CASH_DIVIDEND' as const,
      cashAmount: '10',
    };

    expect(
      buildSeriesVariantsAt(openSeries, [action], '2025-01-02T00:00:00Z', {
        cashDividendReferencePoints: closePoints,
      }).adjusted.points.map((item) => item.value),
    ).toEqual(['72', '90']);
  });

  it('only applies corporate actions with the same market and asset type', () => {
    const input = series([point('2025-01-01', '100'), point('2025-01-02', '50')]);
    const action = {
      symbol: '600519.SH',
      market: 'HK' as const,
      assetType: 'stock' as const,
      occurredAt: '2025-01-02T00:00:00Z',
      availableAt: '2025-01-02T00:00:00Z',
      type: 'SPLIT' as const,
      ratio: '2',
    };
    expect(
      buildSeriesVariantsAt(input, [action], '2025-01-03T00:00:00Z').adjusted.points.map(
        (item) => item.value,
      ),
    ).toEqual(['100', '50']);
  });

  it('keeps earlier indicator output invariant when future data is appended', () => {
    const initial = [point('2025-01-01', '1'), point('2025-01-02', '2'), point('2025-01-03', '3')];
    const extended = [...initial, point('2025-01-04', '1000')];
    const before = evaluateIndicator('MA', initial, { period: 2 }).points;
    const after = evaluateIndicator('MA', extended, { period: 2 }).points;
    expect(after.slice(0, before.length).map((item) => item.value)).toEqual(
      before.map((item) => item.value),
    );
  });
});
