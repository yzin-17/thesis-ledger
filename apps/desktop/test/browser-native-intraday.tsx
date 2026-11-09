import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MarketPeriodSelection } from '../src/features/market-detail/MarketPeriodSelection';
import { MarketPriceChart } from '../src/features/market-detail/MarketDetailCharts';
import type { MarketChartBar } from '../src/features/market-detail/market-chart-types';
import '../src/ui/styles.css';
const symbol = '510300.SH';
localStorage.setItem('thesis-ledger:market-period-preference', '60m');
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
for (const limit of [90, 2]) client.setQueryData(['desktop', 'market-period-options', symbol, 'none', limit], { options: [] });
client.setQueryData(['desktop', 'market-minute-options', symbol, '1m'], { symbol, timeframe: '1m', options: [] });
client.setQueryData(['desktop', 'market-derived-minute-options', symbol, 90], {
  version: 'market-minute-options-v1', symbol, options: [{ timeframe: '60m', kind: 'native', available: true }],
});
const bars: MarketChartBar[] = Array.from({ length: 12 }, (_, i) => ({
  symbol, timeframe: '60m', adjustment: 'none', provider: '受控原生来源', inputFingerprint: 'a'.repeat(64),
  timestamp: `2026-11-${String(4 + Math.floor(i / 4)).padStart(2, '0')}T${['10:30', '11:30', '14:00', '15:00'][i % 4]}:00+08:00`,
  open: 4.1 + i * 0.001, high: 4.15, low: 4.09, close: 4.12 + i * 0.001,
  volume: i === 0 ? 0 : null, amount: null,
}));
function View() { return <MarketPriceChart bars={bars} />; }
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}>
  <main className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
    <h1 className="text-xl">中国 ETF 原生小时行情受控验收</h1>
    <MarketPeriodSelection symbol={symbol} enabled adjustment="none">{period => <><output data-period>{period}</output><View /></>}</MarketPeriodSelection>
  </main>
</QueryClientProvider>);
