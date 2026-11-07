import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WatchlistScreen } from '../src/features/watchlist/WatchlistScreen';
import { watchlistNumberSample, watchlistSampleId } from './watchlist-number-samples';
const scenario = new URLSearchParams(window.location.search).get('case') ?? 'ordinary';
const sample = watchlistNumberSample(scenario),
  scope = ['watchlist-number-browser'],
  root = [...scope, 'watchlist', watchlistSampleId];
const client = new QueryClient({
  defaultOptions: { queries: { enabled: false, retry: false, staleTime: Infinity } },
});
client.setQueryData([...scope, 'watchlist-identity'], {
  mode: 'local',
  principal: { id: watchlistSampleId, username: 'sample', displayName: '受控样本' },
});
client.setQueryData([...root, 'page', '', '', '', 0], sample.page);
client.setQueryData([...root, 'prices', sample.page.items.map((i) => i.id)], sample.prices);
function Harness() {
  useEffect(() => {
    document.documentElement.dataset.watchlistRaw = JSON.stringify({
      page: sample.page,
      prices: sample.prices,
    });
    document.documentElement.dataset.watchlistReady = scenario;
  }, []);
  return (
    <QueryClientProvider client={client}>
      <main style={{ height: '100dvh' }}>
        <WatchlistScreen />
      </main>
    </QueryClientProvider>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
