import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrategyEditorScreen } from '../src/features/strategy-editor/StrategyEditorScreen';
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <StrategyEditorScreen />
  </QueryClientProvider>,
);
