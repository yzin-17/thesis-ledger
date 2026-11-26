import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  canonicalBarSeriesEncoding,
  marketPeriodIndicatorRequestSchema,
} from '@thesis-ledger/schemas';
import { marketCivilInstant, type MarketPeriodCalendarFact } from '@thesis-ledger/domain';
import { planMinuteWindow, minuteWindowBudget } from '../../src/market/market-minute-window.js';
import { buildMinuteView } from '../../src/market/market-minute-view.js';
import { MarketMinuteDisplayService } from '../../src/market/market-minute-display.service.js';
import { periodContentFingerprint as hash } from '../../src/market/market-period-source.js';

const asOf = '2026-10-08T22:00:00.000Z';
function fixture(market: 'HK' | 'US' = 'US') {
  const timezone = market === 'HK' ? 'Asia/Hong_Kong' : 'America/New_York';
  const at = (minute: number) => marketCivilInstant('2026-10-08', minute, timezone);
  const ranges =
    market === 'HK'
      ? [
          [570, 720],
          [780, 960],
        ]
      : [[570, 960]];
  const calendar: MarketPeriodCalendarFact = {
    market,
    timezone,
    revision: 'controlled-calendar',
    availableAt: '2026-10-01T00:00:00Z',
    coverageStart: '2026-10-08',
    coverageEnd: '2026-10-08',
    sessions: ranges.map(([start, end]) => ({
      tradingDate: '2026-10-08',
      startAt: at(start!),
      endAt: at(end!),
    })),
  };
  const make = (minute: number) => ({
    timestamp: at(minute),
    availableAt: asOf,
    open: 10,
    high: 12,
    low: 9,
    close: 11,
    volume: 100,
    amount: 1100,
    completionStatus: 'complete' as const,
  });
  const points = market === 'HK' ? [make(570)] : [];
  for (const [start, end] of ranges)
    for (let minute = start! + 1; minute <= end!; minute++) points.push(make(minute));
  const original = JSON.parse(
    readFileSync(
      new URL(
        '../../../../packages/schemas/fixtures/market-data-v3.response.etf-qfq.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const identity = {
    symbol: market === 'US' ? 'SPY.US' : '02800.HK',
    assetType: 'ETF' as const,
    timeframe: '1m' as const,
    adjustment: 'none' as const,
  };
  const source = {
    contractVersion: 1,
    identity,
    points,
    coverage: {
      actualStart: points[0]!.timestamp,
      actualEnd: points.at(-1)!.timestamp,
      hasMoreBefore: true,
      latestCompleteTradingDate: '2026-10-08',
    },
    provenance: {
      ...original.provenance,
      providerId: 'futu',
      upstreamSource: 'futu',
      providerRevision: 'controlled-minute-input',
      fetchedAt: asOf,
      freshUntil: asOf,
      servedFromCache: false,
      cacheStatus: 'miss',
    },
    chartContextV3: {
      purpose: 'interactive-chart',
      session: 'regular',
      requestedStart: '2026-10-08',
      requestedEnd: '2026-10-08',
      acquisitionFingerprint: 'controlled-acquisition',
      sourcePriceBasis: { ...original.sourcePriceBasis, adjustment: 'none', observedAt: asOf },
    },
    inputFingerprint: hash(canonicalBarSeriesEncoding(identity, points)),
  };
  return { calendar, source };
}

describe('分钟展示完整窗口', () => {
  it.each(['5m', '15m', '30m', '60m'] as const)(
    '%s保留分钟身份、计算指纹及独立可见窗口',
    (timeframe) => {
      const { calendar, source } = fixture();
      const plan = planMinuteWindow({
        calendar,
        timeframe,
        limit: 3,
        requests: [],
        evaluationAsOf: asOf,
      })!;
      const view = buildMinuteView(source, timeframe, plan, asOf);
      expect(view.visible.series.points).toHaveLength(3);
      expect(view.visible.series.identity).toMatchObject({
        timeframe,
        symbol: 'SPY.US',
        adjustment: 'none',
      });
      expect(view.visible.series.derivation).toMatchObject({
        baseTimeframe: '1m',
        basePointCount: 390,
        timestampConvention: 'interval-end',
        session: 'regular',
      });
      expect(view.visible.series.coverage.hasMoreBefore).toBe(true);
      expect(
        marketPeriodIndicatorRequestSchema.parse({
          contractVersion: 1,
          identity: view.calculation.series.identity,
          points: view.calculation.series.points,
          inputFingerprint: view.calculation.series.inputFingerprint,
          periodContext: view.calculation.periodContext,
          requests: [{ name: 'MA', parameters: { period: 5 } }],
        }).identity.timeframe,
      ).toBe(timeframe);
    },
  );

  it('预热保留59个桶，显示起点不截断计算，午休不拼接', () => {
    const { calendar, source } = fixture('HK');
    const requests = [{ name: 'MA' as const, parameters: { period: 5 } }];
    const plan = planMinuteWindow({
      calendar,
      timeframe: '5m',
      limit: 3,
      requests,
      evaluationAsOf: asOf,
      start: '2026-10-08',
    })!;
    const view = buildMinuteView(source, '5m', plan, asOf);
    expect(view.calculation.series.points).toHaveLength(62);
    expect(view.visible.series.points).toHaveLength(3);
    expect(view.visible.series.inputFingerprint).not.toBe(view.calculation.series.inputFingerprint);
    expect(
      view.calculation.series.points.some(
        (point) => point.timestamp === '2026-10-08T05:00:00.000Z',
      ),
    ).toBe(true);
  });

  it('预算、非法口径在任何日历或来源读取前拒绝', async () => {
    const calendars = { read: vi.fn() },
      bars = { readChartV3: vi.fn() };
    const service = new MarketMinuteDisplayService(calendars as never, bars as never, {} as never);
    expect(() => minuteWindowBudget(3000, '60m', [])).toThrow('预算');
    await expect(
      service.read('SPY.US', '60m', { assetType: 'ETF', limit: '3000' }),
    ).rejects.toThrow('预算');
    await expect(
      service.read('SPY.US', '5m', { assetType: 'ETF', adjustment: 'qfq' }),
    ).rejects.toThrow();
    expect(calendars.read).not.toHaveBeenCalled();
    expect(bars.readChartV3).not.toHaveBeenCalled();
  });

  it('来源窗口、Session及价格口径错误不能冒充聚合就绪', () => {
    const { calendar, source } = fixture();
    const plan = planMinuteWindow({
      calendar,
      timeframe: '5m',
      limit: 3,
      requests: [],
      evaluationAsOf: asOf,
    })!;
    for (const changed of [
      { ...source, chartContextV3: { ...source.chartContextV3, session: undefined } },
      { ...source, chartContextV3: { ...source.chartContextV3, requestedEnd: '2026-10-09' } },
      { ...source, provenance: { ...source.provenance, upstreamSource: 'unknown' } },
      { ...source, inputFingerprint: '0'.repeat(64) },
    ])
      expect(() => buildMinuteView(changed, '5m', plan, asOf)).toThrow();
  });

  it('开市中的尾部延迟按真实末分钟截止，不补分钟；收市后缺尾部仍拒绝', () => {
    const { calendar, source } = fixture();
    const observedAt = '2026-10-08T13:32:30.000Z';
    const points = source.points
      .slice(0, 1)
      .map((point) => ({ ...point, availableAt: observedAt }));
    const delayed = {
      ...source,
      points,
      provenance: { ...source.provenance, fetchedAt: observedAt, freshUntil: observedAt },
      chartContextV3: {
        ...source.chartContextV3,
        sourcePriceBasis: {
          ...source.chartContextV3.sourcePriceBasis,
          observedAt,
        },
      },
      inputFingerprint: hash(canonicalBarSeriesEncoding(source.identity, points)),
    };
    const plan = planMinuteWindow({
      calendar,
      timeframe: '5m',
      limit: 1,
      requests: [],
      evaluationAsOf: observedAt,
    })!;
    expect(buildMinuteView(delayed, '5m', plan, observedAt).visible.series.points).toEqual([
      expect.objectContaining({
        observedEndAt: '2026-10-08T13:31:00.000Z',
        observedMinutes: 1,
        completionStatus: 'incomplete',
        bucketEndAt: '2026-10-08T13:35:00.000Z',
      }),
    ]);
    expect(() => buildMinuteView(delayed, '5m', plan, asOf)).toThrow('minute_coverage_incomplete');
  });

  it('观察时间跨交易日或日历修订变化不复用旧计划', async () => {
    const { calendar, source } = fixture();
    const calendars = {
      read: vi
        .fn()
        .mockResolvedValueOnce({ status: 'ready', calendar })
        .mockResolvedValueOnce({ status: 'ready', calendar: { ...calendar, revision: 'changed' } }),
    };
    const bars = { readChartV3: vi.fn<(input: unknown) => Promise<typeof source>>(() => Promise.resolve(source)) };
    const service = new MarketMinuteDisplayService(calendars as never, bars as never, {} as never);
    await expect(
      service.read(
        'SPY.US',
        '5m',
        { assetType: 'ETF', limit: '3', end: '2026-10-08' },
        [],
        () => asOf,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ details: { reason: 'window_changed' } }),
    });
    expect(bars.readChartV3).toHaveBeenCalledTimes(1);
    expect(bars.readChartV3.mock.calls[0]?.[0]).toMatchObject({
      window: { start: '2026-10-08', end: '2026-10-08' },
    });
  });
});
