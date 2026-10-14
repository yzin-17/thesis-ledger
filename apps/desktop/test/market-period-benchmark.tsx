import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MarketPriceChart } from '../src/features/market-detail/MarketDetailCharts.js';
import { MarketPeriodSelection, type ChartPeriod } from '../src/features/market-detail/MarketPeriodSelection.js';
import type { MarketChartBar, MarketChartIndicator } from '../src/features/market-detail/market-chart-types.js';
import { readPreference } from '../src/features/market-detail/market-chart-preferences.js';
import '../src/ui/styles.css';

// 仅测量展示负载；这些点不是来源事实，也不进入业务 API、数据库或缓存。
const client = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });
const symbol = 'PERIOD_BENCHMARK.SZ';
const availableOptions = {
  options: ['5d', '1w', '1mo', '1y'].map((timeframe) => ({ timeframe, available: true })),
};
for (const barsLimit of [90, 2]) {
  // 一小时内保持夹具能力缓存新鲜，避免向真实服务请求这个虚构标的。
  client.setQueryData(['desktop', 'market-period-options', symbol, 'qfq', barsLimit], availableOptions,
    { updatedAt: Date.now() + 3_600_000 });
}
const longTasks: Array<{ start: number; duration: number }> = [];
let interactionStart = performance.now();
let sampleId = 0;
document.addEventListener('pointerdown', (event) => {
  if (!(event.target instanceof Element) || !event.target.closest('[aria-label="行情周期"]')) return;
  interactionStart = performance.now();
  sampleId += 1;
}, { capture: true });
const supported = PerformanceObserver.supportedEntryTypes.includes('longtask');
const observer = supported ? new PerformanceObserver((list) => {
  longTasks.push(...list.getEntries().map((entry) => ({ start: entry.startTime, duration: entry.duration })));
}) : null;
observer?.observe({ type: 'longtask', buffered: true });
const samples: Array<Record<string, unknown>> = [];
type BenchmarkBar = MarketChartBar & { timeframe: ChartPeriod; provider: string; inputFingerprint: string };
const loadFor = (period: ChartPeriod): BenchmarkBar[] => Array.from({ length: 500 }, (_, index) => {
  const date = new Date(Date.UTC(1500 + index, 8, 30)).toISOString();
  const close = 10 + Math.sin(index / 12);
  return { timestamp: date, open: close - 0.1, high: close + 0.2, low: close - 0.2, close,
    volume: 1000 + index, amount: close * 1000, completionStatus: 'complete', availableAt: date,
    timeframe: period, timeframeKind: 'derived', provider: 'benchmark', upstreamSource: '受控性能夹具',
    adjustment: 'qfq', symbol, inputFingerprint: `${period}-controlled-display` };
});
const indicatorsFor = (bars: BenchmarkBar[]): MarketChartIndicator[] => {
  const first = bars[0]!;
  const last = bars.at(-1)!;
  return (['MA', 'MACD', 'RSI'] as const).map((name) => ({
    name, parameters: {}, inputFingerprint: first.inputFingerprint,
    symbol, timeframe: first.timeframe, provider: first.provider,
    inputProvenance: {
      timeframe: first.timeframe, provider: first.provider, adjustment: 'qfq',
      inputDateRange: { start: first.timestamp, end: last.timestamp },
      inputFingerprint: first.inputFingerprint,
    },
    calculationAnchor: { timestamp: last.timestamp, inputFingerprint: first.inputFingerprint },
    points: bars.map((bar, index) => {
      let values: Record<string, number>;
      if (name === 'MA') values = { ma5: bar.close, ma20: bar.close - 0.1, ma60: bar.close - 0.2 };
      else if (name === 'MACD') values = { dif: Math.sin(index / 12), dea: Math.cos(index / 12), hist: Math.sin(index / 6) };
      else values = { rsi6: 50, rsi12: 50 + 20 * Math.sin(index / 12), rsi24: 50 };
      return { timestamp: bar.timestamp, inputFingerprint: bar.inputFingerprint, values };
    }),
  }));
};
function Load({ period }: { period: ChartPeriod }) {
  const bars = useMemo(() => loadFor(period), [period]);
  const indicators = useMemo(() => indicatorsFor(bars), [bars]);
  const [report, setReport] = useState('正在采样');
  useEffect(() => {
    const start = interactionStart;
    const id = sampleId;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const paintedAt = performance.now();
      // 绘制后继续观察一秒，并排空待派发条目；保留原始精度，不能四舍五入后判门禁。
      timer = setTimeout(() => {
        if (!active) return;
        longTasks.push(...(observer?.takeRecords() ?? []).map((entry) => ({ start: entry.startTime, duration: entry.duration })));
        const end = performance.now();
        samples.push({ sampleId: id, period, points: bars.length, indicatorPoints: indicators.map((item) => item.points.length),
          visibleRange: readPreference().visibleRange, supported, visibility: document.visibilityState,
          start, end, paintMs: paintedAt - start,
          longTasks: longTasks.filter((task) => task.start + task.duration >= start && task.start < end) });
        setReport(JSON.stringify({ samples }));
      }, 1000);
    }));
    return () => { active = false; clearTimeout(timer); };
  }, [bars, indicators, period]);
  return <><output className="block max-h-24 overflow-auto break-all text-xs" data-period-benchmark>{report}</output>
    <MarketPriceChart bars={bars} indicators={indicators} /></>;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}>
  <main className="p-6"><h1>行情周期性能验收（500 点受控负载）</h1>
    <output className="block break-all text-xs" data-benchmark-environment>{JSON.stringify({ userAgent: navigator.userAgent,
      viewport: [window.innerWidth, window.innerHeight], devicePixelRatio: window.devicePixelRatio,
      hardwareConcurrency: navigator.hardwareConcurrency, observationAfterPaintMs: 1000 })}</output>
    <button onClick={() => {
      for (const barsLimit of [90, 2]) {
        client.setQueryData(['desktop', 'market-period-options', symbol, 'qfq', barsLimit], { options: [] });
      }
    }}>
      模拟周期能力失效
    </button>
    <MarketPeriodSelection symbol={symbol} enabled>{(period) => <Load period={period} key={period} />}</MarketPeriodSelection>
  </main>
</QueryClientProvider>);
