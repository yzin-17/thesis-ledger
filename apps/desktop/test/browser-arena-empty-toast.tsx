import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogTitle } from '../src/components/ui/dialog.js';
import { Button } from '../src/components/ui/button.js';
import { MarketPriceChart } from '../src/features/market-detail/MarketDetailCharts.js';
import { useMarketTradingOverlays } from '../src/features/market-detail/useMarketTradingOverlays.js';
import type { MarketChartBar } from '../src/features/market-detail/market-chart-types.js';
import '../src/ui/styles.css';
const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
Object.assign(window, { arenaToastApi: { modelArenas: { list: async () => {
  // 保留迟到返回，验证关闭和作用域变化后不会弹出通知。
  const response = await fetch('/test/arena-empty-read');
  if (!response.ok) throw new Error('受控读取失败');
  return response.json() as Promise<[]>;
} } } });
function Fixture() {
  const [period, setPeriod] = useState<'1d' | '1w'>('1d');
  const bars = useMemo(() => Array.from({ length: 90 }, (_, index): MarketChartBar => ({ symbol: '600036.SH', timeframe: period, adjustment: 'none',
    timestamp: new Date(Date.UTC(2026, 10, 6 - (89 - index) * (period === '1w' ? 7 : 1), 7)).toISOString(),
    open: 10 + index / 100, close: 10.02 + index / 100, high: 10.1 + index / 100, low: 9.9 + index / 100, volume: 100, amount: 1000 })), [period]);
  const overlay = useMarketTradingOverlays(bars, { symbol: '600036.SH', currency: 'CNY', costPrice: 10, asset: { name: '验证股票', assetType: 'stock' } });
  return <Dialog open><DialogContent className="h-[80dvh] max-h-[80dvh] overflow-y-auto sm:max-w-4xl">
    <DialogTitle>模型 Toast 验证</DialogTitle>
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => void client.invalidateQueries({ queryKey: ['desktop'] })}>刷新比赛</Button>
      <Button onClick={() => setPeriod((value) => value === '1d' ? '1w' : '1d')}>切换周期</Button>
    </div>
    <MarketPriceChart bars={bars} tradingOverlay={overlay} />
  </DialogContent></Dialog>;
}
createRoot(document.getElementById('root')!).render(<MemoryRouter><QueryClientProvider client={client}><Fixture /></QueryClientProvider></MemoryRouter>);
