import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import {
  optimizationAdoptionContextSchema,
  optimizationCompareReadSchema,
  optimizationDetailReadSchema,
} from '@thesis-ledger/schemas';
import { Button } from '../src/components/ui/button';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog';
import { Toaster } from '../src/components/ui/toast';
import { StrategyExperimentDetailPage } from '../src/features/strategy/StrategyExperimentDetailPage';
import {
  createDefaultStrategySchema,
  setStrategyExecutionSymbol,
} from '../src/features/strategy/strategy.schema';
import type { OptimizationExperimentSummary } from '../src/features/strategy/strategy-optimization.api';
import fixture from './fixtures/experiment-risk-ui-recovery.json';
import '../src/ui/styles.css';

const a = fixture.experiment.id;
const b = '00000000-0000-4000-8000-000000000081';
const strategyId = '00000000-0000-4000-8000-000000000071';
const baseline = {
  id: fixture.experiment.baselineStrategyVersionId,
  strategyId,
  version: 1,
  schemaVersion: 3,
  schema: setStrategyExecutionSymbol(createDefaultStrategySchema('隔离验收策略'), '600519.SH'),
};
const version = { ...baseline, id: '00000000-0000-4000-8000-000000000072', version: 2 };
const strategy = { id: strategyId, name: '隔离验收策略', versions: [baseline, version] };
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
});
const records = Object.fromEntries(
  [a, b].map((id) => {
    const candidateId = id === a ? fixture.candidate.id : '00000000-0000-4000-8000-000000000082';
    return [
      id,
      {
        experiment: {
          ...fixture.experiment,
          id,
          name: id === a ? '实验 A' : '实验 B',
          selectedCandidateId: candidateId,
          lockedCandidateIds: [candidateId],
          status: 'succeeded',
          stage: 'completed',
        } as OptimizationExperimentSummary,
        candidates: [{ ...fixture.candidate, id: candidateId, experimentId: id }],
        attempts: [],
      },
    ];
  }),
);
const contexts = Object.fromEntries(
  [a, b].map((id) => [
    id,
    {
      experimentId: id,
      candidateId: records[id]!.candidates[0]!.id,
      expectedStrategyVersion: 1,
      baseline,
      current: baseline,
      candidate: {
        ...baseline,
        id: fixture.candidate.candidateStrategyVersionId,
        candidateId: records[id]!.candidates[0]!.id,
        executionHash: fixture.candidate.executionHash,
      },
      candidateVsBaseline: [],
      candidateVsCurrent: [],
    },
  ]),
);
const compare = (id: string) => ({
  ...records[id],
  baseline: { metrics: {}, runRefs: {} },
  note: '受控样本',
});
for (const id of [a, b]) {
  optimizationDetailReadSchema.parse(records[id]);
  optimizationCompareReadSchema.parse(compare(id));
  optimizationAdoptionContextSchema.parse(contexts[id]);
  client.setQueryData(['desktop', 'strategy', 'optimization', 'experiment', id], records[id]);
  client.setQueryData(['desktop', 'strategy', 'optimization', 'compare', id], compare(id));
  client.setQueryData(
    ['desktop', 'strategy', 'optimization', 'adoption-context', id, contexts[id]!.candidateId],
    contexts[id],
  );
}
const router = createMemoryRouter(
  [
    {
      path: '/strategy/experiments/:experimentId',
      element: <StrategyExperimentDetailPage strategies={[strategy]} />,
    },
  ],
  { initialEntries: ['/strategy/experiments/' + a] },
);
const scopeBrowser = {
  a,
  b,
  records,
  contexts,
  compare,
  adoption: {
    strategyVersion: { id: version.id, strategyId, version: 2 },
    riskApplicationEnabled: false,
    detailsStatus: 'unavailable',
    detailsErrorCode: 'ADOPTION_DETAILS_UNAVAILABLE',
    source: {
      experimentId: a,
      candidateId: fixture.candidate.id,
      candidateHash: fixture.candidate.executionHash,
    },
  },
  navigate: (id: string) => router.navigate('/strategy/experiments/' + id),
  pending: () => client.isMutating(),
};
declare global {
  interface Window {
    scopeBrowser: typeof scopeBrowser;
  }
}
window.scopeBrowser = scopeBrowser;
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <Toaster>
        <ConfirmDialogProvider>
          <main className="mx-auto max-w-7xl space-y-4 p-4">
            <nav className="flex gap-2" aria-label="受控实验切换">
              <Button variant="outline" onClick={() => void scopeBrowser.navigate(a)}>
                切换实验 A
              </Button>
              <Button variant="outline" onClick={() => void scopeBrowser.navigate(b)}>
                切换实验 B
              </Button>
            </nav>
            <RouterProvider router={router} />
          </main>
        </ConfirmDialogProvider>
      </Toaster>
    </QueryClientProvider>
  </StrictMode>,
);
