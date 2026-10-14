import { describe, expect, it, vi } from 'vitest';
import { aggregateMarketDailyBars } from '@thesis-ledger/domain';
import type { BacktestCalendarResponse } from '@thesis-ledger/schemas';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { MarketPeriodCalendarReader } from '../../src/market/market-period-calendar-reader.js';
import {
  projectPeriodCalendar,
  type MarketPeriodCalendarRequest,
} from '../../src/market/market-period-calendar-projection.js';

const request: MarketPeriodCalendarRequest = {
  market: 'CN',
  start: '2026-09-21',
  end: '2026-09-27',
  evaluationAsOf: '2026-09-28T00:00:00Z',
};
function responseFixture(): BacktestCalendarResponse {
  return {
    version: 3,
    status: 'supported',
    provider: 'exchange-calendars',
    providerRevision: 'controlled-revision',
    coverage: { start: request.start, end: request.end, complete: true },
    reason: null,
    facts: [
      {
        market: 'CN',
        timezone: 'Asia/Shanghai',
        provider: 'exchange-calendars',
        providerRevision: 'controlled-revision',
        availableAt: '2026-03-10T00:00:00Z',
        range: { start: request.start, end: request.end },
        sessions: [
          { startMinute: 570, endMinute: 690 },
          { startMinute: 780, endMinute: 900 },
        ],
        holidays: ['2026-09-25'],
        sessionOverrides: [
          { date: '2026-09-23', sessions: [] },
          { date: '2026-09-24', sessions: [{ startMinute: 570, endMinute: 690 }] },
        ],
      },
    ],
  };
}
function requireReady(response = responseFixture()) {
  const result = projectPeriodCalendar(response, request);
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error(result.reason);
  return result.calendar;
}

describe('周期日历事实投影', () => {
  it('使用明确事实保留假日、闭市覆盖和半日 Session，固定输入可回放', () => {
    const calendar = requireReady();
    expect(calendar).toEqual(requireReady());
    expect(calendar.sessions.map((s) => s.tradingDate)).toEqual([
      '2026-09-21',
      '2026-09-21',
      '2026-09-22',
      '2026-09-22',
      '2026-09-24',
    ]);
    expect(calendar.sessions.at(-1)?.endAt).toBe('2026-09-24T03:30:00.000Z');
    expect(calendar.coverageStart).toBe(request.start);
    expect(calendar.coverageEnd).toBe(request.end);
  });
  it('投影后的完整日历被真实聚合器消费，桶结束使用最后计划 Session', () => {
    const calendar = requireReady();
    const fingerprint = 'a'.repeat(64);
    const bars = ['2026-09-21', '2026-09-22', '2026-09-24'].map((tradingDate) => {
      const timestamp = calendar.sessions
        .filter((s) => s.tradingDate === tradingDate)
        .at(-1)!.endAt;
      return {
        symbol: '510300.SH',
        tradingDate,
        timestamp,
        adjustment: 'none' as const,
        priceBasisFingerprint: fingerprint,
        open: 10,
        high: 11,
        low: 9,
        close: 10,
        volume: 100,
        amount: 1000,
        completionStatus: 'complete' as const,
        availableAt: timestamp,
      };
    });
    const aggregate = aggregateMarketDailyBars({
      symbol: '510300.SH',
      timeframe: '1w',
      adjustment: 'none',
      priceBasisFingerprint: fingerprint,
      baseInputFingerprint: fingerprint,
      evaluationAsOf: request.evaluationAsOf,
      ruleVersion: 'market-period-aggregation-v1',
      calendar,
      bars,
      noTradingEvidence: [],
    });
    expect(aggregate.points).toHaveLength(1);
    expect(aggregate.points[0]).toMatchObject({
      completionStatus: 'complete',
      bucketEndAt: '2026-09-24T03:30:00.000Z',
      expectedTradingDates: ['2026-09-21', '2026-09-22', '2026-09-24'],
    });
  });
  it.each(['provider', 'availability', 'holiday', 'override', 'session', 'range'])(
    '完整 %s 变化会改变 revision',
    (kind) => {
      const response = responseFixture();
      const fact = response.facts[0]!;
      if (kind === 'provider') response.providerRevision = fact.providerRevision = 'next-revision';
      if (kind === 'availability') fact.availableAt = '2026-03-11T00:00:00Z';
      if (kind === 'holiday') fact.holidays = ['2026-09-22', '2026-09-25'];
      if (kind === 'override') fact.sessionOverrides[1]!.sessions[0]!.endMinute = 680;
      if (kind === 'session') fact.sessions[1]!.endMinute = 899;
      if (kind === 'range') fact.range.start = '2026-09-20';
      expect(requireReady(response).revision).not.toBe(requireReady().revision);
    },
  );
  it.each([
    ['status', 'calendar_unavailable'],
    ['coverage', 'calendar_incomplete'],
    ['range', 'calendar_incomplete'],
    ['empty', 'calendar_invalid'],
    ['conflict', 'calendar_invalid'],
    ['provider', 'calendar_invalid'],
    ['market', 'calendar_model_unsupported'],
    ['timezone', 'calendar_model_unsupported'],
    ['future', 'calendar_future'],
    ['overlap', 'calendar_invalid'],
    ['reverse', 'calendar_invalid'],
    ['holiday-duplicate', 'calendar_invalid'],
    ['override-duplicate', 'calendar_invalid'],
    ['outside', 'calendar_invalid'],
    ['weekend-open', 'calendar_invalid'],
    ['invalid-date', 'calendar_invalid'],
  ])('拒绝 %s 并保留原因', (kind, reason) => {
    const response = responseFixture();
    const fact = response.facts[0]!;
    if (kind === 'status') response.status = 'unavailable';
    if (kind === 'coverage') response.coverage.complete = false;
    if (kind === 'range') fact.range.start = '2026-09-22';
    if (kind === 'empty') response.facts = [];
    if (kind === 'conflict') response.facts.push(structuredClone(fact));
    if (kind === 'provider') fact.providerRevision = 'different';
    if (kind === 'market') fact.market = 'HK';
    if (kind === 'timezone') fact.timezone = 'Asia/Hong_Kong';
    if (kind === 'future') fact.availableAt = '2026-09-28T00:00:00.000001Z';
    if (kind === 'overlap') fact.sessions[1]!.startMinute = 680;
    if (kind === 'reverse') fact.sessions[0]!.endMinute = 569;
    if (kind === 'holiday-duplicate') fact.holidays.push(fact.holidays[0]!);
    if (kind === 'override-duplicate')
      fact.sessionOverrides.push(structuredClone(fact.sessionOverrides[0]!));
    if (kind === 'outside') fact.holidays.push('2026-09-28');
    if (kind === 'weekend-open')
      fact.sessionOverrides.push({ date: '2026-09-26', sessions: fact.sessions });
    if (kind === 'invalid-date') fact.holidays.push('2026-02-30');
    expect(projectPeriodCalendar(response, request)).toEqual({ status: 'unavailable', reason });
  });
});

describe('周期日历读取', () => {
  it('年初完整年度计划使用独立展示范围，不套用结算预算', async () => {
    const input = {
      market: 'CN' as const,
      start: '2026-01-01',
      end: '2026-12-31',
      evaluationAsOf: '2026-01-02T00:00:00Z',
    };
    const response = responseFixture();
    response.coverage = { start: input.start, end: input.end, complete: true };
    response.facts[0]!.range = { start: input.start, end: input.end };
    response.facts[0]!.availableAt = '2025-12-31T00:00:00Z';
    const dsa = { marketCalendar: vi.fn().mockResolvedValue(response) };
    const result = await new MarketPeriodCalendarReader(dsa as unknown as DsaClient).read(input);
    expect(result.status).toBe('ready');
    expect(dsa.marketCalendar).toHaveBeenCalledExactlyOnceWith({
      market: 'CN',
      start: input.start,
      end: input.end,
      dataAsOf: input.evaluationAsOf,
    });
  });
  it('向实际 DSA 适配器传递固定范围与时刻', async () => {
    const dsa = { marketCalendar: vi.fn().mockResolvedValue(responseFixture()) };
    const reader = new MarketPeriodCalendarReader(dsa as unknown as DsaClient);
    expect(await reader.read(request)).toEqual({ status: 'ready', calendar: requireReady() });
    expect(dsa.marketCalendar).toHaveBeenCalledExactlyOnceWith({
      market: 'CN',
      start: request.start,
      end: request.end,
      dataAsOf: request.evaluationAsOf,
    });
  });
  it('传输失败不使用内置日历降级', async () => {
    const dsa = { marketCalendar: vi.fn().mockRejectedValue(new Error('offline')) };
    const reader = new MarketPeriodCalendarReader(dsa as unknown as DsaClient);
    expect(await reader.read(request)).toEqual({
      status: 'unavailable',
      reason: 'calendar_unavailable',
    });
  });
  it.each([
    { start: '2026-02-30' },
    { end: '2026-09-20' },
    { start: '1900-01-01' },
    { start: '2027-01-01', end: '2027-01-02' },
    { end: '2027-09-30' },
    { evaluationAsOf: 'bad' },
  ])('非法请求不读取外部来源 %j', async (patch) => {
    const dsa = { marketCalendar: vi.fn() };
    const reader = new MarketPeriodCalendarReader(dsa as unknown as DsaClient);
    expect(await reader.read({ ...request, ...patch })).toEqual({
      status: 'unavailable',
      reason: 'calendar_invalid',
    });
    expect(dsa.marketCalendar).not.toHaveBeenCalled();
  });
});
