import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BacktestResultScreen } from '../src/features/backtest-results/BacktestResultScreen';
import { BacktestSetupScreen } from '../src/features/backtest-setup/BacktestSetupScreen';
import { StrategyEditorScreen } from '../src/features/strategy-editor/StrategyEditorScreen';
const view = new URLSearchParams(location.search).get('view');
function Screen() {
  if (view === 'policy') return <StrategyEditorScreen />;
  if (view === 'prepare') return <BacktestSetupScreen />;
  return <BacktestResultScreen />;
}
const client = new QueryClient({ defaultOptions: {
  queries: { retry: false }, mutations: { retry: false },
} });
(window as unknown as { practicalRefresh: () => Promise<void> }).practicalRefresh = () =>
  client.refetchQueries({ predicate: (query) => query.queryKey.includes('backtest-run') });
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><Screen /></QueryClientProvider>);
