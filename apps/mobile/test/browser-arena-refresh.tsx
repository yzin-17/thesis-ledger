import type { ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArenaScreen } from '../src/features/model-arena/ArenaScreen';
import { ArenaWeekScreen } from '../src/features/model-arena/ArenaWeekScreen';

const search = new URLSearchParams(window.location.search);
const view = search.get('view') ?? 'list';
const route = {
  params: {
    ...(search.get('match') && { match: search.get('match')! }),
    ...(search.get('round') && { round: search.get('round')! }),
    ...(search.get('id') && { id: search.get('id')! }),
  },
};
const events: unknown[] = [];
const navigation = {
  push: (...args: unknown[]) => events.push(args),
  navigate: (...args: unknown[]) => events.push(args),
  getParent: () => navigation,
};
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
Object.defineProperty(window, '__arenaRefreshSnapshot', {
  value: () => ({
    fetching: client.isFetching(),
    events,
    cache: client
      .getQueryCache()
      .getAll()
      .map((query) => ({
        key: query.queryKey,
        data: query.state.data,
        status: query.state.status,
        fetchStatus: query.state.fetchStatus,
      })),
  }),
});
function Harness() {
  return (
    <QueryClientProvider client={client}>
      <button
        type="button"
        onClick={() => {
          void client.invalidateQueries({
            predicate: (query) => !query.queryKey.includes('watchlist-identity'),
          });
        }}
      >
        刷新受控读取
      </button>
      <div
        data-mobile-arena-content=""
        style={{ display: 'flex', height: 'calc(100dvh - 30px)', minHeight: 0 }}
      >
        {view.startsWith('week') ? (
          <ArenaWeekScreen
            {...({ route, navigation } as unknown as ComponentProps<typeof ArenaWeekScreen>)}
          />
        ) : (
          <ArenaScreen
            {...({ route, navigation } as unknown as ComponentProps<typeof ArenaScreen>)}
          />
        )}
      </div>
    </QueryClientProvider>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
