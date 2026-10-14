import { describe, expect, it } from 'vitest';
import { backtestDailyTradabilityEvidenceV3Schema } from '../src/backtest-daily-tradability.js';
import {
  backtestInstrumentFactsRequestSchema,
  backtestInstrumentFactsResponseSchema,
} from '../src/backtest-data.js';

const evidence = {
  contractVersion: 1,
  symbol: '159515.SZ',
  market: 'CN',
  instrumentType: 'ETF',
  range: { start: '2026-07-29', end: '2026-07-31' },
  listing: {
    listedOn: '2023-01-01',
    source: { provider: 'identity-fixture', revision: 'r1', availableAt: '2026-07-29T00:00:00Z' },
  },
  calendar: {
    source: { provider: 'calendar-fixture', revision: 'r1', availableAt: '2026-07-29T00:00:00Z' },
    expectedSessions: ['2026-07-29', '2026-07-30', '2026-07-31'],
  },
  barSource: {
    routeKey: {
      kind: 'bar',
      market: 'CN',
      assetType: 'ETF',
      capability: 'DAILY_BAR',
      timeframe: '1d',
      adjustment: 'qfq',
    },
    routeTarget: { providerId: 'hithink', upstreamSource: 'hithink-etf-history' },
    providerRevision: 'r1',
    responseSha256: 'a'.repeat(64),
    observedAt: '2026-09-29T19:30:43.425847Z',
    requestComplete: true,
    paginationComplete: true,
  },
  days: [
    { date: '2026-07-29', state: 'observed-traded' },
    { date: '2026-07-30', state: 'assumed-untradable-no-bar' },
    { date: '2026-07-31', state: 'observed-traded' },
  ],
} as const;

describe('backtest daily tradability evidence', () => {
  it('精确港股原价窗口保留零量排除，其他none来源/标的/范围拒绝', () => {
    const source = { provider: 'observed-source', revision: 'current', availableAt: '2026-10-08T09:00:00Z' };
    const zero = { open: '0.265', high: '0.265', low: '0.265', close: '0.265', volume: '0', sourceResponseSha256: 'b'.repeat(64) };
    const hk = { ...evidence, symbol: '00147.HK', market: 'HK', instrumentType: 'STOCK',
      range: { start: '2025-08-06', end: '2025-08-11' }, listing: { status: 'unknown' },
      calendar: { source, expectedSessions: ['2025-08-06', '2025-08-07', '2025-08-08', '2025-08-11'] },
      barSource: { ...evidence.barSource, routeKey: { ...evidence.barSource.routeKey, market: 'HK', assetType: 'STOCK', adjustment: 'none' },
        routeTarget: { providerId: 'yfinance', upstreamSource: 'yahoo-hk-share-window' } },
      days: [{ date: '2025-08-06', state: 'observed-traded' },
        { date: '2025-08-07', state: 'assumed-untradable-no-bar', excludedZeroVolumeObservation: zero },
        { date: '2025-08-08', state: 'observed-traded' }, { date: '2025-08-11', state: 'observed-traded' }] };
    expect(backtestDailyTradabilityEvidenceV3Schema.parse(hk).days[1]?.excludedZeroVolumeObservation).toEqual(zero);
    expect(backtestDailyTradabilityEvidenceV3Schema.safeParse({ ...hk, symbol: '00700.HK' }).success).toBe(false);
    expect(backtestDailyTradabilityEvidenceV3Schema.safeParse({ ...hk, range: { ...hk.range, start: '2025-08-05' } }).success).toBe(false);
    expect(backtestDailyTradabilityEvidenceV3Schema.safeParse({ ...hk, barSource: { ...hk.barSource,
      routeTarget: { providerId: 'yfinance', upstreamSource: 'yfinance' } } }).success).toBe(false);
  });
  it('来源参数必须完整成组，接受备用来源索引', () => {
    const request = {
      symbol: '159515.SZ',
      market: 'CN',
      instrumentType: 'ETF',
      start: '2026-07-29',
      end: '2026-07-31',
      executionStart: '2026-07-29',
      executionEnd: '2026-07-31',
      dataAsOf: '2026-09-30T00:00:00Z',
    };
    expect(
      backtestInstrumentFactsRequestSchema.safeParse({ ...request, barAdjustment: 'qfq' }).success,
    ).toBe(false);
    expect(
      backtestInstrumentFactsRequestSchema.parse({
        ...request,
        barAdjustment: 'qfq',
        barProviderId: 'hithink',
        barUpstreamSource: 'fund-market-historical',
        barRouteIndex: 1,
      }).barRouteIndex,
    ).toBe(1);
  });
  it('Instrument Facts 响应保留日级证据并拒绝非法字段', () => {
    const response = {
      version: 3,
      status: 'supported',
      provider: 'hithink',
      providerRevision: 'r1',
      coverage: { start: evidence.range.start, end: evidence.range.end, complete: true },
      facts: [],
      historicalTradability: evidence,
    };
    expect(backtestInstrumentFactsResponseSchema.parse(response).historicalTradability).toEqual(
      evidence,
    );
    expect(
      backtestInstrumentFactsResponseSchema.safeParse({
        ...response,
        historicalTradability: { ...evidence, suspended: true },
      }).success,
    ).toBe(false);
  });
  it('保留缺 Bar 假设与精确 qfq 来源绑定', () => {
    const parsed = backtestDailyTradabilityEvidenceV3Schema.parse(evidence);
    expect(parsed.days[1]?.state).toBe('assumed-untradable-no-bar');
    expect(parsed.barSource.routeKey.adjustment).toBe('qfq');
    expect(parsed.barSource.observedAt).toBe(evidence.barSource.observedAt);
  });

  it('拒绝遗漏、重复、乱序或越界的预期交易日', () => {
    const invalid = [
      { ...evidence, days: evidence.days.slice(0, 2) },
      { ...evidence, days: [evidence.days[0], evidence.days[0], evidence.days[2]] },
      {
        ...evidence,
        calendar: {
          ...evidence.calendar,
          expectedSessions: ['2026-07-30', '2026-07-29', '2026-07-31'],
        },
      },
      {
        ...evidence,
        calendar: {
          ...evidence.calendar,
          expectedSessions: ['2026-07-29', '2026-07-30', '2026-08-01'],
        },
      },
    ];
    invalid.forEach((value) =>
      expect(backtestDailyTradabilityEvidenceV3Schema.safeParse(value).success).toBe(false),
    );
  });

  it('拒绝将停牌断言、未完成来源和错误路由混入合同', () => {
    const invalid = [
      {
        ...evidence,
        days: [evidence.days[0], { date: '2026-07-30', state: 'suspended' }, evidence.days[2]],
      },
      { ...evidence, barSource: { ...evidence.barSource, paginationComplete: false } },
      {
        ...evidence,
        barSource: {
          ...evidence.barSource,
          routeKey: { ...evidence.barSource.routeKey, adjustment: 'raw' },
        },
      },
      {
        ...evidence,
        barSource: {
          ...evidence.barSource,
          routeKey: { ...evidence.barSource.routeKey, assetType: 'STOCK' },
        },
      },
      { ...evidence, barSource: { ...evidence.barSource, responseSha256: 'not-a-hash' } },
    ];
    invalid.forEach((value) =>
      expect(backtestDailyTradabilityEvidenceV3Schema.safeParse(value).success).toBe(false),
    );
  });
});
