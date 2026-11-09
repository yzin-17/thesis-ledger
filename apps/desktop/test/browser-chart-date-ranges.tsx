import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FundNavHistory } from '@thesis-ledger/schemas';
import { MarketPriceChart } from '../src/features/market-detail/MarketDetailCharts.js';
import { FundNavPnlChart } from '../src/features/market-detail/FundNavPnlChart.js';
import type { MarketChartBar } from '../src/features/market-detail/market-chart-types.js';
import '../src/ui/styles.css';

const dates = Array.from({ length: 1771 }, (_, index) =>
  new Date(Date.UTC(2022, 0, 1 + index)).toISOString().slice(0, 10)).filter((date) => date <= '2026-11-06');
const bars: MarketChartBar[] = dates.map((date, index) => ({
  timestamp: `${date}T07:00:00Z`, open: 10 + index / 1000, close: 10.1 + index / 1000,
  low: 9.9 + index / 1000, high: 10.2 + index / 1000, volume: 100, amount: 1000,
  symbol: '510300.SH', timeframe: '1d', adjustment: 'qfq', provider: 'fixture',
}));
const history: FundNavHistory = dates.map((navDate, index) => ({
  version: 3, symbol: '000001.OF', navDate: `${navDate}T00:00:00Z`, unitNav: 1 + index / 10000,
  provider: 'fixture', fetchedAt: '2026-11-08T00:00:00Z', freshness: 'delayed',
}));
Object.assign(window, { chartRangeFixtureHistory: history });
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Fixture() {
  const [loaded, setLoaded] = useState(bars.slice(-90));
  const [loading, setLoading] = useState(false);
  return <QueryClientProvider client={client}>
    <main className="mx-auto flex min-w-0 max-w-6xl flex-col gap-6 p-4">
      <section aria-label="股票区间验证" className="min-w-0">
        <h1 className="text-xl">股票行情</h1>
        <MarketPriceChart bars={loaded} historyLoading={loading} canLoadEarlier={loaded.length < bars.length}
          onLoadEarlier={(start) => {
            if (loading) return;
            setLoading(true);
            void fetch(`/test/chart-range-history?start=${start ?? ''}`).then(() => {
              setLoaded(bars); setLoading(false);
            });
          }} />
      </section>
      <section aria-label="基金区间验证" className="min-w-0">
        <h2 className="text-xl">基金净值</h2>
        <FundNavPnlChart history={history.slice(-90)} position={{ symbol: '000001.OF', asset: { name: '验证基金', assetType: 'fund' } }} />
      </section>
    </main>
  </QueryClientProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
