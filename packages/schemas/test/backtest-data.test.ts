import { describe, expect, it } from 'vitest';
import {
  backtestCalendarResponseSchema,
  backtestCorporateActionsResponseSchema,
  backtestDailyBarSchema,
  backtestInstrumentFactsResponseSchema,
  backtestMinuteBarSchema,
  backtestNavFactSchema,
  tradingCalendarFactSchema,
  corporateActionFactSchema,
} from '../src/backtest-data.js';

describe('backtest data contracts', () => {
  it('requires an explicit supported or unavailable execution-rule snapshot', () => {
    const fact = {
      symbol: '600519.SH',
      market: 'CN',
      instrumentType: 'STOCK',
      currency: 'CNY',
      lotSize: '100',
      tickSize: '0.01',
      tradable: true,
      provider: 'fixture',
      providerRevision: 'instrument-v1',
      occurredAt: '2026-01-01T00:00:00Z',
      availableAt: '2026-01-01T00:00:00Z',
    };
    const response = {
      version: 3,
      status: 'supported',
      provider: 'fixture',
      providerRevision: 'instrument-v1',
      coverage: { start: null, end: null, complete: true },
      facts: [fact],
    };

    expect(() => backtestInstrumentFactsResponseSchema.parse(response)).toThrow();
    expect(() =>
      backtestInstrumentFactsResponseSchema.parse({
        ...response,
        facts: [
          {
            ...fact,
            executionRules: {
              status: 'unavailable',
              reason: '历史规则覆盖不完整',
            },
          },
        ],
      }),
    ).not.toThrow();
  });

  it('要求 Calendar 可见时间并保留逐日会话', () => {
    const calendar = tradingCalendarFactSchema.parse({
      market: 'HK',
      timezone: 'Asia/Hong_Kong',
      provider: 'dsa-fixture',
      providerRevision: 'hk-2026-1',
      availableAt: '2026-01-02T00:00:00Z',
      sessions: [
        { startMinute: 570, endMinute: 720 },
        { startMinute: 780, endMinute: 960 },
      ],
      sessionOverrides: [{ date: '2026-12-24', sessions: [{ startMinute: 570, endMinute: 780 }] }],
      holidays: ['2026-10-01'],
      range: { start: '2026-01-01', end: '2026-12-31' },
    });
    expect(calendar.sessionOverrides[0]?.sessions[0]?.endMinute).toBe(780);
  });

  it('keeps occurredAt and availableAt in the minute bar contract', () => {
    const parsed = backtestMinuteBarSchema.parse({
      symbol: '600000.SH',
      market: 'CN',
      timeframe: '1m',
      occurredAt: '2026-09-09T01:30:00Z',
      availableAt: '2026-09-09T01:31:00Z',
      open: '10',
      high: '11',
      low: '9',
      close: '10.5',
      volume: '100',
      provider: 'dsa',
      providerRevision: 'r1',
      quality: 'complete',
    });
    expect(parsed.availableAt).toBe('2026-09-09T01:31:00Z');
  });

  it('保留日线开盘时点与开盘可用时点', () => {
    const parsed = backtestDailyBarSchema.parse({
      symbol: '600000.SH',
      market: 'CN',
      timeframe: '1d',
      occurredAt: '2026-09-09T00:00:00Z',
      availableAt: '2026-09-09T07:00:00Z',
      openedAt: '2026-09-09T01:30:00Z',
      openAvailableAt: '2026-09-09T01:30:00Z',
      open: '10',
      high: '11',
      low: '9',
      close: '10.5',
      volume: '100',
      provider: 'dsa',
      providerRevision: 'raw-1',
      quality: 'complete',
    });

    expect(parsed.openedAt).toBe('2026-09-09T01:30:00Z');
    expect(parsed.openAvailableAt).toBe(parsed.openedAt);
  });

  it('requires the payload owned by each corporate-action type', () => {
    const base = {
      symbol: '600000.SH',
      market: 'CN' as const,
      instrumentType: 'STOCK' as const,
      occurredAt: '2026-09-08T00:00:00Z',
      availableAt: '2026-09-08T01:00:00Z',
      provider: 'dsa',
      providerRevision: 'r1',
    };
    expect(() =>
      corporateActionFactSchema.parse({ ...base, type: 'CASH_DIVIDEND', currency: 'CNY' }),
    ).toThrow();
    expect(() => corporateActionFactSchema.parse({ ...base, type: 'SPLIT' })).toThrow();
    expect(corporateActionFactSchema.parse({ ...base, type: 'SPLIT', ratio: '2' })).toMatchObject({
      ratio: '2',
      market: 'CN',
      instrumentType: 'STOCK',
    });
  });

  it('separates legacy fact timestamps, economic impact dates, and signal visibility', () => {
    const base = {
      symbol: '600000.SH',
      market: 'CN' as const,
      instrumentType: 'STOCK' as const,
      type: 'SPLIT' as const,
      ratio: '2',
      occurredAt: '2026-09-08T00:00:00Z',
      availableAt: '2026-09-08T01:00:00Z',
      provider: 'dsa',
      providerRevision: 'r1',
    };

    const legacy = corporateActionFactSchema.parse(base);
    expect(legacy).toMatchObject({ occurredAt: base.occurredAt, availableAt: base.availableAt });
    expect(legacy.effectiveDate).toBeUndefined();
    expect(legacy.strategyVisibility).toBeUndefined();

    const accountingOnly = corporateActionFactSchema.parse({
      ...base,
      effectiveDate: '2026-09-10',
    });
    expect(accountingOnly.effectiveDate).toBe('2026-09-10');
    expect(accountingOnly.strategyVisibility).toBeUndefined();

    const announced = corporateActionFactSchema.parse({
      ...base,
      effectiveDate: '2026-09-10',
      strategyVisibility: {
        kind: 'announcement',
        announcedAt: '2026-09-05T08:30:00Z',
      },
    });
    expect(announced.strategyVisibility).toEqual({
      kind: 'announcement',
      announcedAt: '2026-09-05T08:30:00Z',
    });

    const conservativeDay = corporateActionFactSchema.parse({
      ...base,
      effectiveDate: '2026-09-10',
      strategyVisibility: { kind: 'conservative-day', visibleDate: '2026-09-05' },
    });
    expect(conservativeDay.strategyVisibility).toEqual({
      kind: 'conservative-day',
      visibleDate: '2026-09-05',
    });

    expect(() =>
      corporateActionFactSchema.parse({
        ...base,
        strategyVisibility: {
          kind: 'announcement',
          announcedAt: '2026-09-05T08:30:00Z',
        },
      }),
    ).toThrow();
    expect(() =>
      corporateActionFactSchema.parse({
        ...base,
        strategyVisibility: { kind: 'announcement' },
      }),
    ).toThrow();
    expect(() =>
      corporateActionFactSchema.parse({
        ...base,
        strategyVisibility: { kind: 'conservative-day' },
      }),
    ).toThrow();
  });

  it('validates dependency-scoped responses and preserves trusted empty coverage', () => {
    const coverage = { start: '2024-01-01', end: '2024-03-31', complete: true };
    expect(
      backtestCorporateActionsResponseSchema.parse({
        version: 3,
        status: 'supported',
        provider: 'akshare',
        providerRevision: 'akshare-corporate-actions-v1',
        coverage,
        facts: [],
        reason: null,
      }).coverage.complete,
    ).toBe(true);
    expect(() =>
      backtestCorporateActionsResponseSchema.parse({
        version: 2,
        status: 'supported',
        provider: 'akshare',
        providerRevision: 'akshare-corporate-actions-v1',
        coverage,
        facts: [],
      }),
    ).toThrow();
    expect(() =>
      backtestCalendarResponseSchema.parse({
        version: 3,
        status: 'supported',
        provider: 'exchange-calendars',
        providerRevision: 'exchange-calendars-4',
        coverage,
        facts: [],
        unexpected: true,
      }),
    ).toThrow();
    expect(() =>
      backtestInstrumentFactsResponseSchema.parse({
        version: 3,
        status: 'supported',
        provider: 'market-rules',
        providerRevision: 'cn-stock-v1',
        coverage: { start: null, end: null, complete: true },
        facts: [{ symbol: '600519.SH' }],
      }),
    ).toThrow();
  });

  it('要求 NAV 事实提供可见时间', () => {
    const nav = {
      symbol: '110011.OF',
      market: 'CN',
      instrumentType: 'NAV_FUND',
      nav: '1.25',
      valuationDate: '2026-09-08',
      occurredAt: '2026-09-08T07:00:00Z',
      provider: 'dsa-fixture',
      providerRevision: 'nav-2026-1',
      freshness: 'delayed',
      quality: 'complete',
      status: 'supported',
    };
    expect(backtestNavFactSchema.safeParse(nav).success).toBe(false);
    expect(
      backtestNavFactSchema.parse({
        ...nav,
        availableAt: '2026-09-09T01:00:00Z',
      }).availableAt,
    ).toBe('2026-09-09T01:00:00Z');
  });
});
