import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../src/components/ui/toast.js';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { PortfolioModeProvider } from '../src/features/portfolio/portfolio-mode-context.js';
import { WatchlistPage } from '../src/features/watchlist/WatchlistPage.js';
import { watchlistNumberSample } from './watchlist-number-samples.js';
import '../src/ui/styles.css';

const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false } },
});
const sample = watchlistNumberSample('ordinary');
const root = ['desktop', window.location.origin, 'watchlist', 'local-workspace'];
client.setQueryDefaults([...root, 'trends'], {
  initialData: { points: [], label: '受控走势', notice: '受控暂无图形' },
});
client.setQueryDefaults([...root, 'page'], {
  initialData: { ...sample.page, groups: [{ id: 'controlled-group', name: '受控长期关注' }] },
});
client.setQueryData([...root, 'prices', 'actual', sample.page.items.map((item) => item.id)], {
  rows: sample.prices,
  checkedAt: Object.fromEntries(sample.page.items.map((item) => [item.id, Date.now()])),
});
client.setQueryData([...root, 'source-cadence'], {
  contractVersion: 1,
  consumer: 'thesis-ledger',
  status: 'complete',
  catalogRevision: 1,
  generatedAt: new Date().toISOString(),
  reason: null,
  entries: [],
});
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <MemoryRouter>
      <ToastProvider>
        <ConfirmDialogProvider>
          <PortfolioModeProvider>
            <main className="content">
              <WatchlistPage />
            </main>
          </PortfolioModeProvider>
        </ConfirmDialogProvider>
      </ToastProvider>
    </MemoryRouter>
  </QueryClientProvider>,
);
