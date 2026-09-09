import { describe, expect, it } from 'vitest';
import {
  corporateActionForSeriesSchema,
  backtestSeriesSchema,
  indicatorResultSchema,
  warmupResultSchema,
} from '../src/backtest-indicators.js';

describe('backtest Series and Indicator contracts', () => {
  it('keeps DecimalString values and availability provenance at the boundary', () => {
    const series = backtestSeriesSchema.parse({
      sourceId: 'execution',
      symbol: '600519.SH',
      field: 'close',
      timeframe: '1d',
      adjusted: true,
      points: [
        {
          occurredAt: '2025-01-01T00:00:00Z',
          availableAt: '2025-01-02T00:00:00Z',
          value: '10.00000000000000000001',
          status: 'available',
        },
      ],
    });
    expect(series.points[0]?.value).toBe('10.00000000000000000001');
    expect(() =>
      backtestSeriesSchema.parse({
        ...series,
        points: [{ ...series.points[0], value: 10 }],
      }),
    ).toThrow();
  });

  it('requires an explicit indicator output and lookback contract', () => {
    expect(
      indicatorResultSchema.parse({
        name: 'MACD',
        output: 'histogram',
        period: 12,
        requiredLookback: 35,
        points: [
          {
            occurredAt: '2025-01-01T00:00:00Z',
            availableAt: '2025-01-01T00:00:00Z',
            status: 'unavailable',
            reason: 'warmup',
          },
        ],
      }),
    ).toMatchObject({ requiredLookback: 35 });
    expect(() =>
      indicatorResultSchema.parse({
        name: 'MA',
        output: 'value',
        period: 5,
        requiredLookback: 5,
        points: [
          {
            occurredAt: '2025-01-01T00:00:00Z',
            availableAt: '2025-01-01T00:00:00Z',
            status: 'available',
            value: 1,
          },
        ],
      }),
    ).toThrow();
  });

  it('represents warmup insufficiency explicitly', () => {
    expect(
      warmupResultSchema.parse({
        requiredLookback: 5,
        warmupPoints: [],
        outputPoints: [],
        status: 'unavailable',
        reason: 'warmup 不足',
      }).status,
    ).toBe('unavailable');
  });

  it('uses the frozen CorporateAction shape without parallel aliases', () => {
    expect(
      corporateActionForSeriesSchema.parse({
        symbol: '600519.SH',
        occurredAt: '2025-01-02T00:00:00Z',
        availableAt: '2025-01-03T00:00:00Z',
        type: 'SPLIT',
        ratio: '2',
      }),
    ).toMatchObject({ type: 'SPLIT', ratio: '2' });
    expect(() =>
      corporateActionForSeriesSchema.parse({
        symbol: '600519.SH',
        occurredAt: '2025-01-02T00:00:00Z',
        availableAt: '2025-01-03T00:00:00Z',
        type: 'SPLIT',
        fromUnits: '1',
        toUnits: '2',
      }),
    ).toThrow();
    expect(() =>
      corporateActionForSeriesSchema.parse({
        symbol: '600519.SH',
        occurredAt: '2025-01-02T00:00:00Z',
        availableAt: '2025-01-03T00:00:00Z',
        type: 'CASH_DIVIDEND',
      }),
    ).toThrow();
  });
});
