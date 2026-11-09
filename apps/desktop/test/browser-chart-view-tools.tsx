import type { FundNavTrades } from '../src/features/market-detail/useFundNavTrades.js';
import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { arenaDetailSchema, arenaPointSchema, fundValuationTodaySchema } from '@thesis-ledger/schemas';
import { MarketPriceChart } from '../src/features/market-detail/MarketDetailCharts.js';
import { FundNavHistoryChart } from '../src/features/market-detail/MarketNavChart.js';
import { MarketPeriodSelection, type ChartPeriod } from '../src/features/market-detail/MarketPeriodSelection.js';
import { useMarketTradingOverlays } from '../src/features/market-detail/useMarketTradingOverlays.js';
import type { MarketChartBar } from '../src/features/market-detail/market-chart-types.js';
import { marketPercentSample } from './market-percent-unit-samples.js';
import { getDesktopApiClient } from '../src/shared/api/client.js';
import '../src/ui/styles.css';

const directDemo = new URLSearchParams(location.search).get('demo') === '1';
if (!directDemo) { localStorage.clear(); sessionStorage.clear(); }
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const symbol = '600036.SH';
for (const limit of [90, 2]) client.setQueryData(['desktop', 'market-period-options', symbol, 'none', limit], {
  options: ['5d', '1w', '1mo', '1y'].map((timeframe) => ({ timeframe, available: true })),
});
client.setQueryData(['desktop', 'market-minute-options', symbol, '1m'], { symbol, timeframe: '1m', options: [{ adjustment: 'none', available: true }] });
client.setQueryData(['desktop', 'market-derived-minute-options', symbol, 90], { version: 'market-minute-options-v1', symbol, options: [] });
const fundSymbol = '000001.OF';
const history = Array.from({ length: 90 }, (_, index) => ({ version: 3 as const, symbol: fundSymbol,
  navDate: new Date(Date.UTC(2026, 10, 6 - 89 + index)).toISOString(), unitNav: 1 + index / 1000,
  provider: 'fixture', fetchedAt: '2026-11-08T00:00:00Z', freshness: 'delayed' as const }));
const sample = marketPercentSample('ordinary');
const todayDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const today = fundValuationTodaySchema.parse({ ...sample.today, date: todayDate, points: Array.from({ length: 60 }, (_, index) => {
  const at = new Date(Date.parse(todayDate + 'T01:30:00Z') + index * 60000).toISOString();
  return { at, valuation: { ...sample.valuation, estimatedNav: 1.1 + index / 10000, estimatedAt: at, oldestPriceAt: at } };
}) });
client.setQueryData(['market', 'fund-valuation-today', fundSymbol, todayDate], today);
const ids = Array.from({ length: 6 }, (_, index) => `00000000-0000-4000-8000-00000000000${index + 1}`);
const budget = { requests: 10, tokens: 10000, costMicros: 1000 };
const arena = arenaDetailSchema.parse({ id: ids[0], state: 'running', createdAt: '2026-11-01T00:00:00Z', remaining: budget,
  protocol: { version: 1, title: '视图验证比赛', market: 'CN', currency: 'CNY', calendarId: 'fixture', calendarVersion: 'fixture', timeZone: 'Asia/Shanghai',
    startsOn: '2026-01-01', endsOn: '2026-11-06', instruments: [{ instrumentId: ids[1], symbol, assetType: 'STOCK' }],
    entrants: ['验证模型', '对照模型'].map((model) => ({ model, providerId: 'fixture', budget, maxInputTokens: 1000, maxOutputTokens: 100 })),
    initialCash: '10000', maxPositionBps: 10000, fees: { version: 'fixture', buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 },
    benchmarks: ['cash', 'equal_weight_buy_hold'], decisionDeadlineMinutes: 10, maxInfrastructureAttempts: 1, budgetCurrency: 'CNY', budget },
  entrants: [{ id: ids[2], providerId: 'fixture', model: '验证模型', cash: '10000', remaining: budget }], rounds: [],
});
const arenaPoints = [arenaPointSchema.parse({ id: ids[3], arenaId: ids[0], roundId: ids[4], entrantId: ids[2], model: '验证模型', symbol,
  day: '2026-11-04', executedAt: '2026-11-04T07:00:00Z', side: 'buy', price: '10.123456', quantity: '100' }), arenaPointSchema.parse({ id: ids[5], arenaId: ids[0], roundId: ids[4], entrantId: ids[2], model: '验证模型', symbol,
  day: '2026-10-28', executedAt: '2026-10-28T07:00:00Z', side: 'sell', price: '10.456789', quantity: '50' })];
const chartToolsApi = { market: {
  getFundValuationToday: async () => today,
  getPeriodOptions: async (_symbol: string, input: { barsLimit: number }) => client.getQueryData(['desktop', 'market-period-options', symbol, 'none', input.barsLimit]),
  getChartOptions: async () => client.getQueryData(['desktop', 'market-minute-options', symbol, '1m']),
  getMinuteOptions: async () => client.getQueryData(['desktop', 'market-derived-minute-options', symbol, 90]),
}, modelArenas: {
  list: async () => { if (!directDemo) await fetch('/test/arena-read/list'); return [arena]; },
  get: async () => { if (!directDemo) await fetch('/test/arena-read/detail'); return arena; },
  points: async (_id: string, input: Record<string, string>) => { if (!directDemo) await fetch('/test/arena-read/points?' + new URLSearchParams(input)); return arenaPoints; },
} };
Object.assign(window, { chartToolsApi });
if (directDemo) Object.assign(getDesktopApiClient(), chartToolsApi);
function Stock({ period }: { period: ChartPeriod }) {
  const bars = useMemo(() => Array.from({ length: 90 }, (_, index): MarketChartBar => {
    const date = new Date(Date.UTC(2026, 10, 6 - (89 - index) * (period === '1w' ? 7 : 1))).toISOString().slice(0, 10);
    const timestamp = period === '1m' ? new Date(Date.UTC(2026, 10, 6, 1, 30 + index)).toISOString() : date + 'T07:00:00Z';
    return { symbol, timeframe: period, adjustment: 'none', timestamp, open: 10 + index / 100, high: 10.2 + index / 100,
      low: 9.8 + index / 100, close: 10.05 + index / 100, volume: 100, amount: 1000,
      ...(period === '1w' ? { bucketStartDate: new Date(Date.parse(date) - 4 * 86400000).toISOString().slice(0, 10), bucketEndDate: date } : {}) };
  }), [period]);
  const overlays = useMarketTradingOverlays(bars, { symbol, currency: 'CNY', costPrice: 10, asset: { name: '股票验证', assetType: 'stock' } });
  return <MarketPriceChart bars={bars} tradingOverlay={overlays} />;
}
const fundTrades: FundNavTrades = {
  enabled: true, scope: 'fixture', loading: false, error: false, unavailable: false, notice: '', retry: () => {},
  position: { symbol: fundSymbol, accountId: 'fixture', mode: 'actual', currency: 'CNY', asset: { name: '基金验证', assetType: 'fund' } },
  groups: [{ id: 'fund-trade:2026-10-28:buy', date: '2026-10-28', side: 'buy', trades: [{ id: 't1', eventId: 'e1', factId: 'f1', side: 'buy',
    tradingDate: '2026-10-28', occurredAt: '2026-10-28T07:00:00Z', timePrecision: 'DATE', currency: 'CNY', quantity: '10', price: '1.08' }] }],
};
function Fund() {
  const [extended, setExtended] = useState(false);
  const pnl = useMemo(() => {
    const dates = extended ? ['2026-08-07T00:00:00Z', ...history.map((point) => point.navDate)] : history.map((point) => point.navDate);
    return dates.map((at, index) => ({ at, value: -10 + index / 10, unrealizedPnl: -10 + index / 10, realizedPnl: 0, current: false, reason: null }));
  }, [extended]);
  return <><button type="button" onClick={() => setExtended(true)}>补充盈亏记录</button><FundNavHistoryChart history={history} trades={fundTrades} pnl={{ points: pnl, currency: 'CNY' }}
    position={{ symbol: fundSymbol, accountId: 'fixture', mode: 'actual', currency: 'CNY', quantity: 90, costPrice: 1.2, asset: { name: '基金验证', assetType: 'fund' } }} /></>;
}
createRoot(document.getElementById('root')!).render(<MemoryRouter><QueryClientProvider client={client}>
  <main className="mx-auto grid min-w-0 max-w-6xl gap-6 p-4">
    {directDemo && <p className="text-sm">受控演示：招商银行 600036.SH，价格与模拟买卖点均为测试数据。选择日线，点击“模型模拟买卖点”，再选择“视图验证比赛”。</p>}
    <section aria-label="股票视图验证" className="min-w-0"><MarketPeriodSelection symbol={symbol} enabled adjustment="none">{(period) => <Stock period={period} />}</MarketPeriodSelection></section>
    <section aria-label="基金视图验证" className="min-w-0"><Fund /></section>
  </main>
</QueryClientProvider></MemoryRouter>);
