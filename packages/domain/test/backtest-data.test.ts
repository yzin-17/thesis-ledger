import { describe, expect, it } from 'vitest';
import { aggregateMinuteBars } from '../src/backtest-data.js';

const bar = (
  occurredAt: string,
  overrides: Partial<{
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    availableAt: string;
    quality: 'complete' | 'partial' | 'suspended' | 'stale' | 'unknown';
  }> = {},
) => ({
  symbol: '600000.SH',
  market: 'CN' as const,
  timeframe: '1m' as const,
  occurredAt,
  availableAt: overrides.availableAt ?? occurredAt,
  open: String(overrides.open ?? 10),
  high: String(overrides.high ?? 11),
  low: String(overrides.low ?? 9),
  close: String(overrides.close ?? 10),
  volume: String(overrides.volume ?? 100),
  amount: String((overrides.close ?? 10) * (overrides.volume ?? 100)),
  provider: 'fixture',
  providerRevision: 'fixture-1',
  quality: overrides.quality ?? ('complete' as const),
});

describe('aggregateMinuteBars', () => {
  it('aggregates OHLCV and propagates the latest availability without crossing sessions', () => {
    const bars = [
      bar('2026-09-08T01:30:00.000Z', { open: 10, high: 12, low: 9, close: 11, volume: 100 }),
      bar('2026-09-08T01:31:00.000Z', { open: 11, high: 13, low: 10, close: 12, volume: 200 }),
      bar('2026-09-08T01:32:00.000Z', { open: 12, high: 14, low: 11, close: 13, volume: 300 }),
      bar('2026-09-08T01:33:00.000Z', { open: 13, high: 15, low: 12, close: 14, volume: 400 }),
      bar('2026-09-08T01:34:00.000Z', {
        open: 14,
        high: 16,
        low: 13,
        close: 15,
        volume: 500,
        availableAt: '2026-09-08T01:36:00.000Z',
      }),
      bar('2026-09-08T05:00:00.000Z'),
    ];
    const result = aggregateMinuteBars(bars, '5m');
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      timeframe: '5m',
      occurredAt: '2026-09-08T01:35:00.000Z',
      open: '10',
      high: '16',
      low: '9',
      close: '15',
      volume: '1500',
      amount: '20500',
      observedMinutes: 5,
      missingMinutes: 0,
      quality: 'complete',
      completeness: 'complete',
      isTail: false,
      availableAt: '2026-09-08T01:36:00.000Z',
    });
    expect(result[1]).toMatchObject({
      occurredAt: '2026-09-08T05:05:00.000Z',
      quality: 'partial',
      completeness: 'partial',
      isTail: true,
      missingMinutes: 4,
    });
  });

  it('propagates stale source quality into derived bars', () => {
    const result = aggregateMinuteBars(
      [
        bar('2026-09-08T01:30:00.000Z', { quality: 'stale' }),
        bar('2026-09-08T01:31:00.000Z'),
        bar('2026-09-08T01:32:00.000Z'),
        bar('2026-09-08T01:33:00.000Z'),
        bar('2026-09-08T01:34:00.000Z'),
      ],
      '5m',
    );
    expect(result[0]).toMatchObject({ quality: 'stale', completeness: 'partial' });
  });

  it('does not merge CN morning and afternoon windows', () => {
    const result = aggregateMinuteBars(
      [bar('2026-09-08T03:29:00.000Z'), bar('2026-09-08T05:00:00.000Z')],
      '60m',
    );
    expect(result.map((item) => item.occurredAt)).toEqual([
      '2026-09-08T03:30:00.000Z',
      '2026-09-08T06:00:00.000Z',
    ]);
    expect(result.every((item) => item.timeframe === '60m')).toBe(true);
  });

  it('uses market-local sessions for HK and US instead of CN rules', () => {
    const hk = aggregateMinuteBars(
      [
        { ...bar('2026-09-08T01:30:00.000Z'), symbol: '00005.HK', market: 'HK' as const },
        { ...bar('2026-09-08T05:30:00.000Z'), symbol: '00005.HK', market: 'HK' as const },
      ],
      '30m',
    );
    const us = aggregateMinuteBars(
      [
        {
          ...bar('2026-09-08T13:30:00.000Z'),
          symbol: 'AAPL.US',
          market: 'US' as const,
        },
      ],
      '60m',
    );
    expect(hk).toHaveLength(2);
    expect(us[0]?.occurredAt).toBe('2026-09-08T14:30:00.000Z');
  });

  it('rejects duplicate minutes and future availability before the occurred time', () => {
    const first = bar('2026-09-08T01:30:00.000Z');
    expect(() => aggregateMinuteBars([first, first], '5m')).toThrow('重复');
    expect(() =>
      aggregateMinuteBars(
        [bar('2026-09-08T01:30:00.000Z', { availableAt: '2026-09-08T01:29:00.000Z' })],
        '5m',
      ),
    ).toThrow('availableAt');
  });

  it('keeps decimal OHLCV and amount exact without JavaScript floating point', () => {
    const first = {
      ...bar('2026-09-08T01:30:00.000Z'),
      open: '0.1',
      high: '0.2',
      low: '0.1',
      close: '0.1',
      volume: '3',
      amount: '0.3',
    };
    const second = {
      ...first,
      occurredAt: '2026-09-08T01:31:00.000Z',
      availableAt: '2026-09-08T01:31:00.000Z',
    };
    const result = aggregateMinuteBars([first, second], '5m');
    expect(result[0]).toMatchObject({ volume: '6', amount: '0.6', high: '0.2' });
  });
});
