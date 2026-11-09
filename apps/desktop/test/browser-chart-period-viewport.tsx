import { MemoryRouter } from 'react-router';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { marketDisplayDetailResponseSchema } from '@thesis-ledger/schemas';
import { MarketDetailDialog } from '../src/features/market-detail/MarketDetailDialog.js';
import type { MarketDetailRequest } from '../src/features/market-detail/market-detail.coordinator.js';
import '../src/ui/styles.css';

// 仅替换读取边界；保留真实详情、查询生命周期、选择控件和原生画布。
localStorage.clear();
const symbol = '600036.SH';
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
for (const limit of [90, 2]) client.setQueryData(['desktop', 'market-period-options', symbol, 'qfq', limit], {
  options: ['5d', '1w', '1mo', '1y'].map((timeframe) => ({ timeframe, available: true })),
});
client.setQueryData(['desktop', 'market-minute-options', symbol, '1m'], {
  symbol, timeframe: '1m', options: [{ adjustment: 'none', available: true }],
});
client.setQueryData(['desktop', 'market-derived-minute-options', symbol, 90], {
  version: 'market-minute-options-v1', symbol, options: [],
});
function response(request: MarketDetailRequest) {
  const timeframe = request.timeframe ?? '1d';
  const derived = ['1w', '1mo', '1y'].includes(timeframe);
  const count = timeframe === '1y' ? 2 : 90;
  const stride = timeframe === '1w' ? 7 : timeframe === '1mo' ? 30 : timeframe === '1y' ? 365 : 1;
  const points = Array.from({ length: count }, (_, index) => {
    const timestamp = new Date(Date.UTC(2026, 10, 6 - (count - 1 - index) * stride, 7)).toISOString();
    const date = timestamp.slice(0, 10);
    const close = 10 + index / 100 + Math.sin(index) / 20;
    return { timestamp, open: close - 0.01, close, high: close + 0.1, low: close - 0.1,
      volume: 100 + index, amount: 1000, completionStatus: 'complete', availableAt: timestamp,
      ...(derived ? { tradingDate: date, bucketStartDate: date, bucketEndDate: date, bucketEndAt: timestamp,
        expectedTradingDates: [date], observedTradingDates: [date], explainedTradingDates: [], missingTradingDates: [] } : {}),
    };
  });
  const fingerprint = 'a'.repeat(64);
  const rule = 'market-period-aggregation-v1';
  const nativeProvenance = { providerId: 'fixture', upstreamSource: 'fixture', routeIndex: 0, effectivePolicyRevision: 1,
    providerRevision: 'fixture', fetchedAt: '2026-11-08T00:00:00Z', freshUntil: '2099-01-01T00:00:00Z', servedFromCache: false, cacheStatus: 'miss' };
  const series = { contractVersion: 3, identity: { symbol, assetType: 'STOCK', timeframe, adjustment: request.adjustment ?? 'qfq' }, points,
    coverage: { actualStart: points[0]!.timestamp, actualEnd: points.at(-1)!.timestamp, hasMoreBefore: false, latestCompleteTradingDate: '2026-11-06' },
    inputFingerprint: fingerprint,
    provenance: derived ? { kind: 'derived', provider: 'thesis-ledger-server', providerRevision: rule,
      baseSources: [{ providerId: 'fixture', upstreamSource: 'fixture', providerRevision: 'fixture', inputFingerprint: fingerprint, priceBasisFingerprint: fingerprint }] } : nativeProvenance,
    ...(derived ? { derivation: { ruleVersion: rule, calendarRevision: 'fixture', baseInputFingerprint: fingerprint,
      priceBasisFingerprint: fingerprint, evaluationAsOf: '2026-11-08T00:00:00Z', coverageEvidence: [] } } : {}),
  };
  const quote = { version: 3, symbol, open: 10, high: 12, low: 9, price: 11.23, previousClose: 11,
    volume: 100, amount: 1000, stale: false, provider: 'fixture', fetchedAt: '2026-11-08T00:00:00Z',
    freshness: 'delayed', marketTime: '2026-11-06T07:00:00Z', units: { priceCurrency: 'CNY', volume: 'share', turnoverCurrency: 'CNY' } };
  const requested = request.include ?? ['quote', 'bars', 'indicator:MA', 'indicator:MACD', 'indicator:RSI'];
  return marketDisplayDetailResponseSchema.parse({ contractVersion: 3, symbol, assetType: 'STOCK',
    identity: { source: 'asset', status: 'confirmed' }, requested,
    capabilities: { supported: requested, unsupported: ['chip'] }, limits: { bars: request.barsLimit, nav: 90 },
    sections: { ...Object.fromEntries(requested.filter((capability) => capability.startsWith('indicator:')).map((capability) => [capability, { capability, status: 'empty' }])), bars: { capability: 'bars', status: 'ready', data: series },
      ...(!request.include ? { quote: { capability: 'quote', status: 'ready', data: quote } } : {}) },
    dependencies: { DAILY_BAR: { status: 'ready' } }, barSeries: series,
    requestId: crypto.randomUUID(), generatedAt: '2026-11-08T00:00:00Z',
  });
}
Object.assign(window, { periodFixtureRead: async (request: MarketDetailRequest) => {
  // 忽略取消，专门验证迟到结果也不能覆盖当前周期。
  await fetch(`/test/period-read?${new URLSearchParams({ timeframe: request.timeframe ?? '1d', limit: String(request.barsLimit),
    anchor: request.calculationAnchor ?? '', include: request.include?.join(',') ?? 'all' })}`);
  return response(request);
} });
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}>
  <MemoryRouter><MarketDetailDialog adjustment="qfq" position={{ symbol, asset: { name: '周期切换验证', assetType: 'stock' } }} onClose={() => {}} /></MemoryRouter>
</QueryClientProvider>);
