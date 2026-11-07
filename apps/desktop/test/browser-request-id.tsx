import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog';
import { Toaster } from '../src/components/ui/toast';
import { StrategyRiskApplicationPage } from '../src/features/strategy/StrategyRiskApplicationPage';
import { createDefaultStrategySchema, setStrategyExecutionSymbol } from '../src/features/strategy/strategy.schema';
import fixture from './fixtures/experiment-risk-ui-recovery.json';
import '../src/ui/styles.css';

// All API traffic must be intercepted by the browser runner; no real writes.
const version = {
  id: fixture.experiment.baselineStrategyVersionId,
  version: 1,
  schemaVersion: 2,
  schema: setStrategyExecutionSymbol(createDefaultStrategySchema('受控风险策略'), '600519.SH'),
};
const strategy = { id: 'strategy', name: '受控风险策略', versions: [version] };
const router = createMemoryRouter([
  { path: '/strategy/library/:strategyId/versions/:versionId/risk-application', element: <StrategyRiskApplicationPage strategies={[strategy]} presentation="drawer" /> },
  { path: '*', element: <p>返回来源</p> },
], { initialEntries: ['/strategy/library', `/strategy/library/strategy/versions/${version.id}/risk-application`] });
const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <Toaster><ConfirmDialogProvider><RouterProvider router={router} /></ConfirmDialogProvider></Toaster>
  </QueryClientProvider>,
);
