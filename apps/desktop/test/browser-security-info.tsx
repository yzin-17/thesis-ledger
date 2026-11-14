import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InstrumentCatalogPanel } from '../src/features/market-data/InstrumentCatalogPanel.js';
import type { InstrumentResult } from '../src/features/market-data/market-data.types.js';
import '../src/ui/styles.css';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const rows: InstrumentResult[] = [
  { id: 'controlled-hk', canonicalCode: '03968', symbol: '03968.HK', displayName: '招商银行', market: 'HK', instrumentType: 'STOCK', confirmable: false },
  { id: 'controlled-us', canonicalCode: 'SPY', symbol: 'SPY.US', displayName: '标普500 ETF', market: 'US', instrumentType: 'ETF', confirmable: false },
  { id: 'controlled-cn', canonicalCode: '600036', symbol: '600036.SH', displayName: '招商银行', market: 'SH', instrumentType: 'STOCK', confirmable: true },
];
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}><MemoryRouter>
    <main className="mx-auto max-w-6xl p-4">
      <InstrumentCatalogPanel catalog={null} disabled={false} syncing={false} searchBusy={false}
        searchRequested searchResults={rows} confirmingId={null} onSync={() => {}} onSearch={() => {}} onConfirm={() => {}} />
    </main>
  </MemoryRouter></QueryClientProvider>,
);
