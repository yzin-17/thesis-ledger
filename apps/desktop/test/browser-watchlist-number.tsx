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
client.setQueryData([...root, 'trends', sample.symbol, scenario === 'nav' ? 'nav' : '1d'], {
  points: [],
  label: '受控走势',
  notice: '受控暂无图形',
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
