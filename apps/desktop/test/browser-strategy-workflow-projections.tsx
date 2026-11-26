import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import {
  StrategyVersionPage,
  type StrategyVersionTabState,
} from '../src/features/strategy/StrategyLibraryPages';
import { StrategyExperimentCreatePage } from '../src/features/strategy/StrategyExperimentCreatePage';
import { StrategyExperimentDetailPage } from '../src/features/strategy/StrategyExperimentDetailPage';
import { StrategyOptimizationExperimentPanel } from '../src/features/strategy/StrategyOptimizationExperimentPanel';
import { StrategyRiskApplicationPage } from '../src/features/strategy/StrategyRiskApplicationPage';
import {
  createDefaultStrategySchema,
  setStrategyExecutionSymbol,
} from '../src/features/strategy/strategy.schema';
import { riskKeys } from '../src/features/risk/risk.queries';
import { NavigationGuardProvider } from '../src/features/shared/navigation-guard';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog';
import { ToastProvider } from '../src/components/ui/toast';
import { researchModel } from '../../../packages/schemas/test/price-research-fixture';
import fixture from './fixtures/experiment-risk-ui-recovery.json';
import '../src/ui/styles.css';

const version = {
  id: fixture.experiment.baselineStrategyVersionId,
  version: 1,
  schemaVersion: 3,
  schema: setStrategyExecutionSymbol(createDefaultStrategySchema('受控流程策略'), '600519.SH'),
};
const strategy = { id: 'controlled-strategy', name: '受控流程策略', versions: [version] };
const experiment = { ...fixture.experiment, status: 'succeeded', stage: 'completed' };
const optimizationKey = ['desktop', 'strategy', 'optimization'];
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
});
client.setQueryDefaults(['desktop', 'optimization-execution-model'], {
  initialData: { status: 'available', model: researchModel, notes: [] },
});
client.setQueryData([...optimizationKey, 'capabilities'], {
  aiOptimizationEnabled: true,
  riskApplicationsEnabled: true,
  providers: [
    { provider: 'controlled', model: 'fixture', costStatus: 'known', costCurrency: 'CNY' },
  ],
});
client.setQueryData(
  [...optimizationKey, 'parameters', version.id],
  [
    {
      parameterId: 'sizing.value',
      label: '仓位',
      value: 10000,
      optimizationRange: { min: 1000, max: 20000 },
    },
  ],
);
client.setQueryData([...optimizationKey, 'experiment', experiment.id], {
  experiment,
  candidates: [fixture.candidate],
  attempts: [],
});
client.setQueryData([...optimizationKey, 'compare', experiment.id], {
  experiment,
  baseline: { metrics: {}, runRefs: {} },
  candidates: [fixture.candidate],
  attempts: [],
});
client.setQueryData([...optimizationKey, 'adoption-context', experiment.id, fixture.candidate.id], {
  baseline: version,
  current: version,
  candidateVsBaseline: [],
  candidateVsCurrent: [],
  expectedStrategyVersion: 1,
});
const experiments = { items: [experiment], pageInfo: { nextCursor: null } };
client.setQueryData([...optimizationKey, 'experiments'], experiments);
client.setQueryData(
  [...optimizationKey, 'experiments', { strategyVersionId: version.id, limit: 20 }],
  experiments,
);
client.setQueryData(
  ['desktop', 'strategy', 'backtest-groups', { strategyVersionId: version.id, limit: 20 }],
  {
    items: [],
    pageInfo: { nextCursor: null },
  },
);
client.setQueryData(['desktop', 'accounts'], [fixture.account]);
client.setQueryData(riskKeys.riskNotificationRouting(), {
  availableRoutes: [],
  selectedProviders: [],
});
client.setQueryData(
  ['desktop', 'strategy', 'risk-applications', fixture.account.id, '600519.SH'],
  [],
);

const view = new URLSearchParams(location.search).get('view') ?? 'version';
function Harness() {
  const [tabState, onTabChange] = useState<StrategyVersionTabState>({
    sourceKey: '',
    value: 'definition',
  });
  return (
    <main className="mx-auto min-w-0 max-w-6xl p-4" data-strategy-workflow-qa={view}>
      {view === 'version' && (
        <StrategyVersionPage
          strategies={[strategy]}
          loading={false}
          onBacktest={() => undefined}
          tabState={tabState}
          onTabChange={onTabChange}
        />
      )}
      {view === 'create' && <StrategyExperimentCreatePage strategies={[strategy]} />}
      {view === 'detail' && <StrategyExperimentDetailPage strategies={[strategy]} />}
      {view === 'panel' && <StrategyOptimizationExperimentPanel strategies={[strategy]} />}
      {view === 'risk' && (
        <StrategyRiskApplicationPage strategies={[strategy]} presentation="drawer" />
      )}
    </main>
  );
}
let route = `/strategy/library/${strategy.id}/versions/${version.id}`;
if (view === 'create') route = '/strategy/experiments/new';
else if (view === 'detail') route = `/strategy/experiments/${experiment.id}`;
else if (view === 'risk') route += '/risk-application';
const element = (
  <ToastProvider>
    <ConfirmDialogProvider>
      <NavigationGuardProvider>
        <Harness />
      </NavigationGuardProvider>
    </ConfirmDialogProvider>
  </ToastProvider>
);
const router = createMemoryRouter(
  [
    { path: '/strategy/library/:strategyId/versions/:versionId', element },
    { path: '/strategy/library/:strategyId/versions/:versionId/risk-application', element },
    { path: '/strategy/experiments/:experimentId', element },
    { path: '*', element },
  ],
  { initialEntries: [route] },
);
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
