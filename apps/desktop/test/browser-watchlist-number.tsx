import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WatchlistTable } from '../src/features/watchlist/WatchlistTable';
import { watchlistNumberSample } from './watchlist-number-samples';
import '../src/ui/styles.css';
const scenario = new URLSearchParams(window.location.search).get('case') ?? 'ordinary';
const sample = watchlistNumberSample(scenario),
  root = ['watchlist-number-browser'];
const client = new QueryClient({
  defaultOptions: { queries: { enabled: false, retry: false, staleTime: Infinity } },
});
const candles = Array.from({ length: 20 }, (_, index) => {
  const close = 4.2 + Math.sin(index * 0.8) * 0.1 - index * 0.004;
  const open = close + (index % 2 ? 0.03 : -0.03);
  return {
    at: new Date(Date.UTC(2026, 9, index + 10)).toISOString(),
    open,
    close,
    high: Math.max(open, close) + 0.02,
    low: Math.min(open, close) - 0.02,
  };
});
client.setQueryData([...root, 'trends', sample.symbol, scenario === 'nav' ? 'nav' : '1d'], {
  points: scenario === 'ordinary' ? candles.map((p) => ({ at: p.at, value: p.close })) : [],
  ...(scenario === 'ordinary' && {
    candles,
    label: '日线 · 前复权',
    source: 'tencent',
    cutoff: candles.at(-1)!.at,
  }),
  ...(scenario !== 'ordinary' && { label: '受控走势', notice: '受控暂无图形' }),
});
const minutePoints = Array.from({ length: 242 }, (_, index) => {
  const minute = index < 121 ? 90 + index : 300 + index - 121;
  return {
    at: new Date(Date.UTC(2026, 10, 6, 0, minute)).toISOString(),
    value: 4.1 + Math.sin(index * 0.07) * 0.03 + Math.sin(index * 0.23) * 0.006,
  };
}).filter((_, index) => index !== 15 && index !== 80);
if (scenario !== 'nav')
  client.setQueryData([...root, 'trends', sample.symbol, '1m'], {
    points: scenario === 'ordinary' ? minutePoints : [],
    label: '分时 · 1分钟',
    ...(scenario === 'ordinary'
      ? { source: 'tencent', cutoff: minutePoints.at(-1)!.at }
      : { notice: '未配置分钟行情来源' }),
  });
function Harness() {
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.watchlistRaw = JSON.stringify({
      page: sample.page,
      prices: sample.prices,
    });
    document.documentElement.dataset.watchlistReady = scenario;
  }, []);
  return (
    <QueryClientProvider client={client}>
      <main className="mx-auto max-w-6xl p-4 sm:p-6">
        <button type="button" onClick={() => setRefreshing((v) => !v)}>
          {refreshing ? '受控结束刷新' : '受控开始刷新'}
        </button>
        <WatchlistTable
          page={sample.page}
          prices={sample.prices}
          mode="actual"
          busy={false}
          refreshing={refreshing}
          filtered={false}
          period="1d"
          queryRoot={root}
          select={(item) => {
            document.documentElement.dataset.watchlistSelected = item.id;
          }}
          change={() => {
            throw new Error('验收不修改业务数据');
          }}
        />
      </main>
    </QueryClientProvider>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
