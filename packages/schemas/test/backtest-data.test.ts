import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  backtestCalendarResponseSchema,
  backtestCapabilitiesSchema,
  backtestCorporateActionsResponseSchema,
  backtestDailyBarSchema,
  backtestInstrumentFactsResponseSchema,
  backtestMinuteBarSchema,
  corporateActionFactSchema,
} from '../src/backtest-data.js';

describe('backtest data contracts', () => {
  it('accepts the three-market DSA capability fixture with point-in-time facts', () => {
    const fixture = JSON.parse(
      readFileSync(new URL('../fixtures/backtest-v2.capabilities.json', import.meta.url), 'utf8'),
    );
    const parsed = backtestCapabilitiesSchema.parse(fixture);
    expect(
      parsed.calendars.find((calendar) => calendar.market === 'HK')?.sessionOverrides,
    ).toHaveLength(1);
    expect(
      parsed.calendars.find((calendar) => calendar.market === 'US')?.sessionOverrides,
    ).toHaveLength(1);
    expect(parsed.corporateActions.facts[0]).toMatchObject({
      market: 'CN',
      instrumentType: 'STOCK',
    });
    expect(parsed.nav.facts[0]?.availableAt).toBe('2026-09-09T01:00:00Z');
  });

  it('requires explicit status, provenance, range, and base/derived kind', () => {
    const capability = {
      market: 'HK',
      instrumentType: 'NAV_FUND',
      timeframe: '1d',
      kind: 'base',
      status: 'unsupported',
      provider: 'dsa',
      providerRevision: 'r1',
      range: { start: null, end: null },
      freshness: 'unknown',
      quality: 'unknown',
      completeness: 'unavailable',
      timezone: 'Asia/Hong_Kong',
      reason: 'V2 仅支持中国内地 NAV Fund',
    };
    expect(() =>
      backtestCapabilitiesSchema.parse({
        version: 2,
        provider: 'dsa',
        generatedAt: '2026-09-09T00:00:00Z',
        capabilities: [capability],
        calendars: [],
        instrumentFacts: [],
        fx: { status: 'unavailable', facts: [], reason: 'provider unavailable' },
        corporateActions: { status: 'unavailable', facts: [], reason: 'provider unavailable' },
        nav: { status: 'unsupported', facts: [] },
      }),
    ).not.toThrow();
  });

  it('requires Calendar knowledge time and preserves date-specific sessions', () => {
    const parsed = backtestCapabilitiesSchema.parse({
      version: 2,
      provider: 'dsa-fixture',
      generatedAt: '2026-09-09T00:00:00Z',
      capabilities: [
        {
          market: 'HK',
          instrumentType: 'STOCK',
          timeframe: '1d',
          kind: 'base',
          status: 'supported',
          provider: 'dsa-fixture',
          providerRevision: 'hk-2026-1',
          range: { start: '2026-01-01', end: '2026-12-31' },
          freshness: 'live',
          quality: 'complete',
          completeness: 'complete',
          timezone: 'Asia/Hong_Kong',
        },
      ],
      calendars: [
        {
          market: 'HK',
          timezone: 'Asia/Hong_Kong',
          provider: 'dsa-fixture',
          providerRevision: 'hk-2026-1',
          availableAt: '2026-01-02T00:00:00Z',
          sessions: [
            { startMinute: 570, endMinute: 720 },
            { startMinute: 780, endMinute: 960 },
          ],
          sessionOverrides: [
            {
              date: '2026-12-24',
              sessions: [{ startMinute: 570, endMinute: 780 }],
            },
          ],
          holidays: ['2026-10-01'],
          range: { start: '2026-01-01', end: '2026-12-31' },
        },
      ],
      instrumentFacts: [],
      fx: { status: 'unavailable', facts: [], reason: 'provider unavailable' },
      corporateActions: { status: 'unavailable', facts: [], reason: 'provider unavailable' },
      nav: { status: 'unsupported', facts: [] },
    });
    expect(parsed.calendars[0]?.sessionOverrides[0]?.sessions[0]?.endMinute).toBe(780);
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

  it('validates dependency-scoped responses and preserves trusted empty coverage', () => {
    const coverage = { start: '2024-01-01', end: '2024-03-31', complete: true };
    expect(
      backtestCorporateActionsResponseSchema.parse({
        version: 2,
        status: 'supported',
        provider: 'akshare',
        providerRevision: 'akshare-corporate-actions-v1',
        coverage,
        facts: [],
        reason: null,
      }).coverage.complete,
    ).toBe(true);
    expect(() =>
      backtestCalendarResponseSchema.parse({
        version: 2,
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
        version: 2,
        status: 'supported',
        provider: 'market-rules',
        providerRevision: 'cn-stock-v1',
        coverage: { start: null, end: null, complete: true },
        facts: [{ symbol: '600519.SH' }],
      }),
    ).toThrow();
  });

  it('requires NAV knowledge time', () => {
    const nav = {
      symbol: '110011.OF',
      market: 'CN' as const,
      instrumentType: 'NAV_FUND' as const,
      nav: '1.25',
      valuationDate: '2026-09-08',
      occurredAt: '2026-09-08T07:00:00Z',
      provider: 'dsa-fixture',
      providerRevision: 'nav-2026-1',
      freshness: 'delayed' as const,
      quality: 'complete' as const,
      status: 'supported' as const,
    };
    expect(() =>
      backtestCapabilitiesSchema.parse({
        version: 2,
        provider: 'dsa-fixture',
        generatedAt: '2026-09-09T00:00:00Z',
        capabilities: [
          {
            market: 'CN',
            instrumentType: 'NAV_FUND',
            timeframe: '1d',
            kind: 'base',
            status: 'supported',
            provider: 'dsa-fixture',
            providerRevision: 'nav-2026-1',
            range: { start: '2026-01-01', end: '2026-12-31' },
            freshness: 'delayed',
            quality: 'complete',
            completeness: 'complete',
            timezone: 'Asia/Shanghai',
          },
        ],
        calendars: [],
        instrumentFacts: [],
        fx: { status: 'unavailable', facts: [] },
        corporateActions: { status: 'unavailable', facts: [] },
        nav: { status: 'supported', facts: [nav] },
      }),
    ).toThrow();
    expect(
      backtestCapabilitiesSchema.parse({
        version: 2,
        provider: 'dsa-fixture',
        generatedAt: '2026-09-09T00:00:00Z',
        capabilities: [
          {
            market: 'CN',
            instrumentType: 'NAV_FUND',
            timeframe: '1d',
            kind: 'base',
            status: 'supported',
            provider: 'dsa-fixture',
            providerRevision: 'nav-2026-1',
            range: { start: '2026-01-01', end: '2026-12-31' },
            freshness: 'delayed',
            quality: 'complete',
            completeness: 'complete',
            timezone: 'Asia/Shanghai',
          },
        ],
        calendars: [],
        instrumentFacts: [],
        fx: { status: 'unavailable', facts: [] },
        corporateActions: { status: 'unavailable', facts: [] },
        nav: { status: 'supported', facts: [{ ...nav, availableAt: '2026-09-09T01:00:00Z' }] },
      }).nav.facts[0]?.availableAt,
    ).toBe('2026-09-09T01:00:00Z');
  });
});
