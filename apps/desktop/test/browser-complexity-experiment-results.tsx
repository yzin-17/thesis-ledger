import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrategyOptimizationExperimentResults } from '../src/features/strategy/StrategyOptimizationExperimentResults.js';
import type {
  OptimizationCandidate,
  OptimizationExperimentSummary,
} from '../src/features/strategy/strategy-optimization.api.js';
import '../src/ui/styles.css';

const readable = {
  state: 'readable',
  code: 'READABLE',
  scope: 'test',
  accessedAt: '2026-09-18T00:00:00.000Z',
  revealedAt: '2026-09-18T00:00:00.000Z',
} as const;
const experiment: OptimizationExperimentSummary = {
  id: 'controlled-experiment',
  name: '受控实验',
  nameSource: 'stored',
  sourceMode: 'discovery',
  baselineStrategyVersionId: 'seed',
  status: 'succeeded',
  stage: 'completed',
  objective: {},
  split: {},
  modelConfig: [{ provider: 'controlled-provider', model: 'controlled-model' }],
  aiCallsUsed: 1,
  backtestRunsUsed: 3,
  inputTokensUsed: 100,
  outputTokensUsed: 20,
  costUsed: null,
  costSummary: {
    status: 'unavailable',
    currency: null,
    knownAmount: null,
    knownByCurrency: [],
    reason: 'unknown_cost',
  },
  tradingCost: {
    source: 'discovery_seed',
    commissionRate: '0',
    slippageRate: '0',
    isAssumption: true,
    zeroDoesNotMeanFree: true,
  },
  readEligibility: readable,
  createdAt: readable.accessedAt,
  updatedAt: readable.accessedAt,
};
const candidate: OptimizationCandidate = {
  id: 'controlled-candidate',
  experimentId: experiment.id,
  candidateNumber: 1,
  modelKey: 'controlled-provider:controlled-model',
  candidateStrategyVersionId: 'candidate-version',
  executionHash: 'controlled-hash',
  proposal: {},
  validationStatus: 'test_valid',
  runRefs: {},
  metrics: { validation: { totalReturn: '0.1', tradeCount: 3 } },
  readEligibility: readable,
  diff: [{ path: '$.risk', kind: 'full-strategy', before: null, after: { stopLoss: 0.03 } }],
};
const client = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });
function ResultsFixture() {
  const [event, setEvent] = useState('等待操作');
  const empty = new URLSearchParams(location.search).has('empty');
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4">
      <StrategyOptimizationExperimentResults
        experiments={empty ? [] : [experiment, { ...experiment, id: 'queued', status: 'queued' }]}
        compare={
          empty
            ? undefined
            : {
                experiment,
                baseline: { runRefs: {}, metrics: {} },
                candidates: [candidate],
                attempts: [],
                note: '受控样本',
              }
        }
        settledStatuses={new Set(['succeeded', 'failed', 'cancelled'])}
        selectedExperimentId={experiment.id}
        versions={[]}
        clonePending={false}
        onInvalidate={async () => undefined}
        onFeedback={setEvent}
        onSelectExperiment={(id) => setEvent('查看 ' + id)}
        onCloneExperiment={(id) => setEvent('克隆 ' + id)}
        onCancelExperiment={(id) => setEvent('取消 ' + id)}
      />
      <output aria-label="受控操作">{event}</output>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <ResultsFixture />
  </QueryClientProvider>,
);
