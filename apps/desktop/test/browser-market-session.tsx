import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { securityStaticInfoResponseSchema, type MarketSession } from '@thesis-ledger/schemas';
import { Button } from '../src/components/ui/button.js';
import { FundCurrentValuation } from '../src/features/market-detail/FundCurrentValuation.js';
import { SecurityStaticPriceDialog } from '../src/features/market-data/SecurityStaticPriceDialog.js';
import { WatchlistTrend } from '../src/features/watchlist/WatchlistTrend.js';
import { watchlistNumberSample } from './watchlist-number-samples.js';
import '../src/ui/styles.css';

const client = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false, staleTime: Infinity } } });
const session: MarketSession = {
  state: 'closed', tradingDayState: 'closed', evaluatedAt: '2026-11-08T04:00:00Z',
  market: 'CN', date: '2026-11-08', timezone: 'Asia/Shanghai', latestTradingDate: '2026-11-06',
  latestCompletedTradingDate: '2026-11-06', calendarRevision: 'controlled', sessions: [
    { tradingDate: '2026-11-06', startAt: '2026-11-06T01:30:00Z', endAt: '2026-11-06T03:30:00Z' },
    { tradingDate: '2026-11-06', startAt: '2026-11-06T05:00:00Z', endAt: '2026-11-06T07:00:00Z' },
  ],
};
const info = securityStaticInfoResponseSchema.parse({
  contractVersion: 1, consumer: 'thesis-ledger', requestId: 'controlled', symbol: 'SPY.US', assetType: 'ETF',
  market: 'US', name: 'SPY', securityId: '9007199254740993', sharesPerLot: '1', listingDate: null,
  delisted: false, exchange: null, provider: 'futu', historicalChanges: 'unverified',
  observedAt: '2026-10-09T01:00:00Z', fetchedAt: '2026-10-09T01:01:00Z', policyRevision: 1,
  routeTarget: { providerId: 'futu', upstreamSource: 'futu', routeIndex: 0 },
});
for (const period of ['1d', '1m']) client.setQueryData(['desktop', 'security-static-price', info.symbol, info.assetType, 'plan', period], { options: [] });
client.setQueryData(['desktop', 'security-static-price', info.symbol, info.assetType, 'quote'], {
  version: 1, symbol: info.symbol, price: 600, units: { priceCurrency: 'USD' }, provider: 'futu',
  marketTime: '2026-11-06T21:00:00Z', fetchedAt: '2026-11-08T04:00:00Z', stale: false, freshness: 'delayed',
  sessionContext: { session: 'closed_snapshot', evaluatedAt: session.evaluatedAt, latestTradingDate: '2026-11-06' },
});
const sample = watchlistNumberSample('ordinary');
const root = ['market-session-browser'];
const points = Array.from({ length: 240 }, (_, index) => {
  const minute = index < 120 ? 90 + index : 300 + index - 120;
  return { at: new Date(Date.UTC(2026, 10, 6, 0, minute)).toISOString(), value: 4 + Math.sin(index / 15) * 0.03 };
});
client.setQueryData([...root, 'trends', sample.symbol, '1m'], { points, label: '分时 · 1分钟' });
function Fixture() {
  const [unknown, setUnknown] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const value = {
    version: 1, symbol: '000001.OF', marketState: unknown ? 'unknown' : 'closed', quality: unknown ? 'unavailable' : 'partial',
    estimatedNav: unknown ? null : 1.025, changePercent: unknown ? null : 2.5,
    estimatedAt: unknown ? null : '2026-11-06T06:59:00Z', reasons: [unknown ? 'calendar_unavailable' : 'market_closed'],
  };
  useEffect(() => { client.setQueryData(['market', 'fund-valuation', value.symbol], value); }, [unknown]);
  const snap = { ...sample.prices[0]!, quoteContext: { session: 'closed_snapshot' as const, evaluatedAt: session.evaluatedAt, marketSession: unknown ? undefined : session } };
  return <QueryClientProvider client={client}><main className="mx-auto grid max-w-4xl gap-4 p-4">
    <h1 className="text-xl">共享市场状态验收（受控样本）</h1>
    <div className="flex flex-wrap gap-2"><Button onClick={() => setUnknown(!unknown)}>{unknown ? '切换休市' : '切换未知'}</Button>
      <Button onClick={() => setShowSecurity(true)}>证券行情</Button></div>
    <FundCurrentValuation symbol={value.symbol} />
    <WatchlistTrend item={sample.page.items[0]!} snap={snap} period="1m" queryRoot={root} select={() => setShowSecurity(true)} />
    {showSecurity && <SecurityStaticPriceDialog info={info} onClose={() => setShowSecurity(false)} />}
  </main></QueryClientProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
