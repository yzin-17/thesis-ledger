import type { MarketPeriod, MarketPeriodCalendarFact } from '@thesis-ledger/domain';
import { barSeriesSchema, canonicalBarSeriesEncoding } from '@thesis-ledger/schemas';
import { periodContentFingerprint } from '../../src/market/market-period-source.js';
import {
  planMarketPeriodWindow,
  type MarketPeriodWindowInput,
} from '../../src/market/market-period-window.js';

/** 仅用于纯装配测试的合成日历/价格，不代表真实交易所或来源。 */
export function periodViewFixture(timeframe: MarketPeriod = '1w', warmup = false) {
  const sessions: Array<MarketPeriodCalendarFact['sessions'][number]> = [];
  for (let day = Date.parse('2018-01-01'); day <= Date.parse('2027-12-31'); day += 86_400_000) {
    const date = new Date(day);
    if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
    const tradingDate = date.toISOString().slice(0, 10);
    sessions.push({
      tradingDate,
      startAt: `${tradingDate}T01:30:00Z`,
      endAt: `${tradingDate}T07:00:00Z`,
    });
  }
  const window: MarketPeriodWindowInput = {
    calendar: {
      market: 'CN',
      timezone: 'Asia/Shanghai',
      revision: 'controlled-view-calendar-v1',
      availableAt: '2018-01-01T00:00:00Z',
      coverageStart: '2018-01-01',
      coverageEnd: '2027-12-31',
      sessions,
    },
    timeframe,
    evaluationAsOf: '2026-10-04T00:00:00Z',
    limit: 2,
    ...(timeframe === '5d' ? { anchorTradingDate: '2026-10-02' } : {}),
    indicators: warmup ? [{ name: 'MA', parameters: { period: 5 } }] : [],
  };
  const plan = planMarketPeriodWindow(window);
  const identity = {
    symbol: '510300.SH',
    assetType: 'ETF' as const,
    timeframe: '1d' as const,
    adjustment: 'qfq' as const,
  };
  const points = plan.calculation
    .flatMap((bucket) => bucket.tradingDates)
    .filter((date) => date <= plan.end)
    .map((date, i) => ({
      timestamp: `${date}T07:00:00.000Z`,
      open: 10 + i,
      high: 13 + i,
      low: 9 + i,
      close: 12 + i,
      volume: 10 + i,
      amount: 1000 + i * 10,
      completionStatus: 'complete' as const,
      availableAt: `${date}T07:00:00.000Z`,
    }));
  const source = barSeriesSchema.parse({
    contractVersion: 3,
    identity,
    points,
    coverage: {
      actualStart: points[0]?.timestamp ?? null,
      actualEnd: points.at(-1)?.timestamp ?? null,
      hasMoreBefore: false,
      latestCompleteTradingDate: points.at(-1)?.timestamp.slice(0, 10) ?? null,
    },
    provenance: {
      providerId: 'controlled-provider',
      upstreamSource: 'controlled-source',
      providerRevision: 'controlled-r1',
      routeIndex: 0,
      effectivePolicyRevision: 1,
      fetchedAt: '2026-10-03T00:00:00.000321Z',
      freshUntil: '2026-10-03T00:00:00.000321Z',
      servedFromCache: false,
      cacheStatus: 'miss',
    },
    chartContextV3: {
      purpose: 'interactive-chart',
      requestedStart: plan.baseStart,
      requestedEnd: plan.baseEnd,
      acquisitionFingerprint: 'a'.repeat(64),
      sourcePriceBasis: {
        adjustment: 'qfq',
        method: 'provider-native',
        methodVersion: 'controlled-v1',
        basisScope: 'global',
        anchor: null,
        revision: { origin: 'provider', id: 'controlled-r1' },
        observedAt: '2026-10-03T00:00:00.000321Z',
        volumeBasis: 'original',
        fieldUnits: { volume: 'share', amount: 'CNY' },
        dividendMeaning: 'provider-defined',
        dividendEvidenceRef: null,
        conversionAvailable: false,
        conversionEvidenceRef: null,
        derivation: null,
      },
    },
    inputFingerprint: periodContentFingerprint(canonicalBarSeriesEncoding(identity, points)),
  });
  return { window, source };
}

export function refreshSourceFingerprint(source: ReturnType<typeof periodViewFixture>['source']) {
  source.inputFingerprint = periodContentFingerprint(
    canonicalBarSeriesEncoding(source.identity, source.points),
  );
  source.coverage.actualStart = source.points[0]?.timestamp ?? null;
  source.coverage.actualEnd = source.points.at(-1)?.timestamp ?? null;
}
