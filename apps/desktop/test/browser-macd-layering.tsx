import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MarketPriceChart } from '../src/features/market-detail/MarketDetailCharts.js';
import { defaultPreference, preferenceKey } from '../src/features/market-detail/market-chart-preferences.js';
import type { MarketChartBar, MarketChartIndicator } from '../src/features/market-detail/market-chart-types.js';
import '../src/ui/styles.css';

// 仅为原生图层遮挡验收提供可比较的正负柱样本，不进入业务数据或查询。
localStorage.setItem(preferenceKey, JSON.stringify({ ...defaultPreference, visibleIndicators: ['MA', 'MACD', 'RSI'] }));
const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
function Fixture() {
  const [revision, setRevision] = useState(0);
  const { bars, indicators } = useMemo(() => {
    const inputFingerprint = `macd-layering-${revision}`;
    const bars: MarketChartBar[] = Array.from({ length: 30 }, (_, index) => ({
      symbol: '510300.SH', timeframe: '1d', adjustment: 'none', provider: 'fixture', inputFingerprint,
      timestamp: new Date(Date.UTC(2026, 9, 8 + index, 7)).toISOString(),
      open: 10 + index / 100, close: 10.05 + index / 100, high: 10.1 + index / 100, low: 9.9 + index / 100,
      volume: 100 + index, amount: 1000,
    }));
    const indicators: MarketChartIndicator[] = (['MA', 'MACD', 'RSI'] as const).map((name) => ({
      name, parameters: {}, symbol: '510300.SH', timeframe: '1d', provider: 'fixture', inputFingerprint,
      inputProvenance: { timeframe: '1d', provider: 'fixture', adjustment: 'none', inputFingerprint,
        inputDateRange: { start: bars[0]!.timestamp, end: bars.at(-1)!.timestamp } },
      calculationAnchor: { timestamp: bars.at(-1)!.timestamp, inputFingerprint },
      points: bars.map((bar, index) => {
        const sign = index < 15 ? 1 : -1;
        const dif = sign * (0.12 + revision / 1000), dea = sign * 0.04;
        let values: Record<string, number>;
        if (name === 'MA') values = { ma5: bar.close, ma20: bar.close - 0.02, ma60: bar.close - 0.04 };
        else if (name === 'MACD') values = { dif, dea, hist: 2 * (dif - dea) };
        else values = { rsi12: 50 + sign * 10 };
        return { timestamp: bar.timestamp, inputFingerprint, values };
      }),
    }));
    return { bars, indicators };
  }, [revision]);
  return <QueryClientProvider client={client}>
    <main className="mx-auto min-w-0 max-w-6xl p-4">
      <button type="button" onClick={() => setRevision((current) => current + 1)}>刷新绘图样本</button>
      <output aria-label="样本版本">{revision}</output>
      <MarketPriceChart bars={bars} indicators={indicators} />
    </main>
  </QueryClientProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
