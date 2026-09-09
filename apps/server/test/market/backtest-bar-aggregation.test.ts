import { describe, expect, it } from 'vitest';
import {
  BacktestBarAggregationService,
  composeEffectiveBacktestCapabilities,
} from '../../src/market/backtest-bar-aggregation.service.js';

const makeBar = (occurredAt: string) => ({
  symbol: '600000.SH',
  market: 'CN',
  timeframe: '1m',
  occurredAt,
  availableAt: occurredAt,
  open: '10',
  high: '11',
  low: '9',
  close: '10',
  volume: '100',
  provider: 'fixture',
  providerRevision: 'r1',
  quality: 'complete',
});

describe('BacktestBarAggregationService', () => {
  it('composes derived capability from the 1m base status', () => {
    const payload = {
      version: 2 as const,
      provider: 'dsa',
      generatedAt: '2026-09-08T00:00:00Z',
      capabilities: [
        {
          market: 'CN' as const,
          instrumentType: 'STOCK' as const,
          timeframe: '1m' as const,
          kind: 'base' as const,
          status: 'supported' as const,
          provider: 'dsa',
          providerRevision: 'r1',
          range: { start: '2026-01-01', end: '2026-09-08' },
          freshness: 'delayed' as const,
          quality: 'complete' as const,
          completeness: 'complete' as const,
          timezone: 'Asia/Shanghai',
        },
        {
          market: 'US' as const,
          instrumentType: 'STOCK' as const,
          timeframe: '1m' as const,
          kind: 'base' as const,
          status: 'supported' as const,
          provider: 'dsa',
          providerRevision: 'r1',
          range: { start: '2026-01-01', end: '2026-09-08' },
          freshness: 'delayed' as const,
          quality: 'complete' as const,
          completeness: 'complete' as const,
          timezone: 'America/New_York',
        },
        {
          market: 'HK' as const,
          instrumentType: 'ETF' as const,
          timeframe: '1m' as const,
          kind: 'base' as const,
          status: 'unavailable' as const,
          provider: 'dsa',
          providerRevision: 'r1',
          range: { start: null, end: null },
          freshness: 'unknown' as const,
          quality: 'unknown' as const,
          completeness: 'unavailable' as const,
          timezone: 'Asia/Hong_Kong',
          reason: 'provider unavailable',
        },
      ],
      calendars: [
        {
          market: 'CN' as const,
          timezone: 'Asia/Shanghai',
          provider: 'fixture',
          providerRevision: 'calendar-r1',
          availableAt: '2026-01-02T00:00:00Z',
          sessions: [
            { startMinute: 570, endMinute: 690 },
            { startMinute: 780, endMinute: 900 },
          ],
          sessionOverrides: [],
          holidays: [],
          range: { start: '2026-01-01', end: '2026-09-08' },
        },
      ],
      instrumentFacts: [],
      fx: { status: 'unavailable' as const, facts: [] },
      corporateActions: { status: 'unavailable' as const, facts: [] },
      nav: { status: 'unsupported' as const, facts: [] },
    };
    const result = composeEffectiveBacktestCapabilities(payload);
    const cn = result.capabilities.find(
      (item) => item.market === 'CN' && item.instrumentType === 'STOCK' && item.timeframe === '5m',
    );
    const hk = result.capabilities.find(
      (item) => item.market === 'HK' && item.instrumentType === 'ETF' && item.timeframe === '5m',
    );
    expect(cn).toMatchObject({ status: 'supported', provider: 'thesis-ledger-server' });
    expect(hk).toMatchObject({ status: 'unavailable', reason: 'provider unavailable' });
    expect(
      result.capabilities.find(
        (item) =>
          item.market === 'US' && item.instrumentType === 'STOCK' && item.timeframe === '5m',
      ),
    ).toMatchObject({
      status: 'unavailable',
      reason: 'US Calendar fact unavailable',
    });
    expect(
      result.capabilities.some((item) => item.kind === 'derived' && item.provider === 'dsa'),
    ).toBe(false);
  });

  it('delegates derived bars to the deterministic domain aggregation', () => {
    const service = new BacktestBarAggregationService();
    const output = service.aggregate({
      timeframe: '5m',
      bars: [
        makeBar('2026-09-08T01:30:00Z'),
        makeBar('2026-09-08T01:31:00Z'),
        makeBar('2026-09-08T01:32:00Z'),
        makeBar('2026-09-08T01:33:00Z'),
        makeBar('2026-09-08T01:34:00Z'),
      ],
    }) as Array<{ occurredAt: string; timeframe: string; missingMinutes: number }>;
    expect(output).toEqual([
      expect.objectContaining({
        occurredAt: '2026-09-08T01:35:00.000Z',
        timeframe: '5m',
        missingMinutes: 0,
      }),
    ]);
  });

  it('does not rebuild 1d facts from minute data', () => {
    const service = new BacktestBarAggregationService();
    const input = [
      {
        symbol: '600000.SH',
        market: 'CN',
        timeframe: '1d',
        occurredAt: '2026-09-08T07:00:00Z',
        availableAt: '2026-09-08T08:00:00Z',
        open: '10',
        high: '11',
        low: '9',
        close: '10',
        volume: '100',
        provider: 'dsa',
        providerRevision: 'r1',
        quality: 'complete',
      },
    ];
    expect(service.aggregate({ timeframe: '1d', bars: input })).toEqual(input);
    expect(() =>
      service.aggregate({ timeframe: '1d', bars: [{ ...input[0], close: 10 }] }),
    ).toThrow();
  });
});
