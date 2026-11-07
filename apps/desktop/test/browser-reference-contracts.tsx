import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MarketReferenceSheet } from '../src/features/market-data/MarketReferenceSheet.js';
import '../src/ui/styles.css';
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <main className="p-6">
      <MarketReferenceSheet />
    </main>
  </QueryClientProvider>,
);
