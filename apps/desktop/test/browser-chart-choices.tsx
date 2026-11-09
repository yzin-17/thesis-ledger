import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MarketPeriodSelection } from '../src/features/market-detail/MarketPeriodSelection.js';
import { MarketPriceChart } from '../src/features/market-detail/MarketDetailCharts.js';
import { FundNavHistoryChart } from '../src/features/market-detail/MarketNavChart.js';
import type { MarketChartBar } from '../src/features/market-detail/market-chart-types.js';
import '../src/ui/styles.css';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const staged = new URLSearchParams(location.search).has('staged');
function seedCapabilities(symbol: string, phase: 'partial' | 'full' | 'daily') {
  for (const limit of [90, 2]) client.setQueryData(['desktop', 'market-period-options', symbol, 'qfq', limit], {
    options: ['5d', '1w', '1mo', '1y'].map((timeframe) => ({ timeframe,
      available: phase === 'full' || (phase === 'partial' && timeframe !== '1w') })),
  });
  client.setQueryData(['desktop', 'market-minute-options', symbol, '1m'], {
    symbol, timeframe: '1m', options: [{ adjustment: 'none', available: phase !== 'daily' }],
  });
  client.setQueryData(['desktop', 'market-derived-minute-options', symbol, 90], {
    version: 'market-minute-options-v1', symbol,
    options: ['5m', '15m', '30m', '60m'].map((timeframe) => ({ timeframe, available: phase !== 'daily' })),
  });
}
for (const symbol of ['600036.SH', '510300.SH']) seedCapabilities(symbol, staged ? 'partial' : 'full');
const dates = Array.from({ length: 90 }, (_, index) => new Date(Date.UTC(2026, 7, 9 + index)).toISOString().slice(0, 10));
const history = dates.map((navDate, index) => ({ version: 3 as const, symbol: '000001.OF', navDate,
  unitNav: 1 + index / 1000, provider: 'fixture', fetchedAt: '2026-11-08T00:00:00Z', freshness: 'delayed' as const }));
function Fixture() {
  const [symbol, setSymbol] = useState('600036.SH');
  return <QueryClientProvider client={client}>
    <main className="mx-auto flex min-w-0 max-w-6xl flex-col gap-6 p-4">
      <section aria-label="行情选项验证" className="min-w-0">
        <button type="button" onClick={() => setSymbol((current) => current === '600036.SH' ? '510300.SH' : '600036.SH')}>切换股票与 ETF</button>
        {staged && <div>
          <button type="button" onClick={() => seedCapabilities(symbol, 'full')}>补齐周线能力</button>
          <button type="button" onClick={() => seedCapabilities(symbol, 'daily')}>仅保留日线能力</button>
        </div>}
        <MarketPeriodSelection symbol={symbol} enabled>{(period) => {
          const bars: MarketChartBar[] = dates.map((date, index) => ({ symbol, timestamp: `${date}T07:00:00Z`,
            open: 10 + index / 100, close: 10.05 + index / 100, low: 9.9 + index / 100, high: 10.1 + index / 100,
            volume: 100, amount: 1000, timeframe: period, adjustment: 'qfq', provider: 'fixture' }));
          return <MarketPriceChart bars={bars} />;
        }}</MarketPeriodSelection>
      </section>
      <section aria-label="基金选项验证" className="min-w-0"><FundNavHistoryChart history={history} /></section>
    </main>
  </QueryClientProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
