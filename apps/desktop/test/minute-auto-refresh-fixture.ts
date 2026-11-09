import type { MarketDisplayDetailResponse, MarketDetailRequest } from '@thesis-ledger/api-client';
import type { MarketSession } from '@thesis-ledger/schemas';

export const fixture = {
  state: 'open' as MarketSession['state'],
  delay: 0,
  fail: false,
  requests: [] as MarketDetailRequest[],
  chartSequence: 0,
};
Object.assign(window, { minuteFixture: fixture });

export async function requestMarketDetail(
  input: MarketDetailRequest,
  signal?: AbortSignal,
): Promise<MarketDisplayDetailResponse> {
  fixture.requests.push(input);
  const quoteOnly = input.include?.join(',') === 'quote';
  if (!quoteOnly && fixture.delay)
    await new Promise<void>((resolve) => setTimeout(resolve, fixture.delay));
  signal?.throwIfAborted();
  if (!quoteOnly && fixture.fail) throw new Error('受控分钟行情失败');
  if (!quoteOnly) fixture.chartSequence += 1;
  const at = new Date().toISOString();
  const price = 43 + fixture.chartSequence / 100;
  const marketSession: MarketSession = {
    state: fixture.state,
    tradingDayState: fixture.state === 'unknown' ? 'unknown' : 'open',
    evaluatedAt: at,
    nextBoundaryAt: new Date(Date.now() + 3600_000).toISOString(),
    market: 'CN',
    timezone: 'Asia/Shanghai',
    calendarRevision: 'controlled',
    sessions: [
      { tradingDate: '2026-11-09', startAt: '2026-11-09T01:30:00Z', endAt: '2026-11-09T03:30:00Z' },
      { tradingDate: '2026-11-09', startAt: '2026-11-09T05:00:00Z', endAt: '2026-11-09T07:00:00Z' },
    ],
  };
  const series = {
    contractVersion: 3 as const,
    identity: {
      symbol: input.symbol,
      assetType: 'STOCK' as const,
      timeframe: input.timeframe ?? '1m',
      adjustment: input.adjustment ?? 'none',
    },
    points: Array.from({ length: 60 }, (_, index) => ({
      timestamp: new Date(
        Date.now() - (59 - index) * (input.timeframe === '1d' ? 86_400_000 : 60_000),
      ).toISOString(),
      open: price - 0.01,
      close: price + Math.sin(index / 4) / 20,
      high: price + 0.1,
      low: price - 0.1,
      volume: 100 + index,
      amount: 4300,
      completionStatus: 'complete' as const,
      availableAt: at,
    })),
    coverage: {
      actualStart: new Date(Date.now() - 59 * 60_000).toISOString(),
      actualEnd: at,
      hasMoreBefore: false,
      latestCompleteTradingDate: null,
    },
    provenance: {
      providerId: 'controlled',
      upstreamSource: 'controlled',
      routeIndex: 0,
      effectivePolicyRevision: 1,
      providerRevision: 'controlled',
      fetchedAt: at,
      freshUntil: new Date(Date.now() + 60_000).toISOString(),
      servedFromCache: false,
      cacheStatus: 'miss' as const,
    },
    inputFingerprint: `controlled-${fixture.chartSequence}`,
  };
  return {
    contractVersion: 3,
    symbol: input.symbol,
    assetType: 'STOCK',
    identity: { source: 'asset', status: 'confirmed' },
    requested: ['quote', 'bars'],
    capabilities: { supported: ['quote', 'bars'], unsupported: [] },
    limits: { bars: 90, nav: 90 },
    dependencies: {},
    requestId: `controlled-${fixture.requests.length}`,
    generatedAt: at,
    sections: {
      quote: {
        capability: 'quote',
        status: 'ready',
        data: {
          version: 3,
          symbol: input.symbol,
          price,
          open: 43,
          high: 44,
          low: 42,
          previousClose: 42.88,
          volume: 100,
          amount: 4300,
          stale: false,
          provider: 'controlled',
          marketTime: at,
          fetchedAt: at,
          freshness: 'live',
          units: { priceCurrency: 'CNY', volume: 'share', turnoverCurrency: 'CNY' },
          sessionContext: {
            session: fixture.state === 'open' ? 'trading' : 'unknown',
            evaluatedAt: at,
            marketSession,
          },
        },
      },
      bars: { capability: 'bars', status: 'ready', data: series },
    },
    barSeries: series,
  } as MarketDisplayDetailResponse;
}
