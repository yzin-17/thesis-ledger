import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import {
  PerformanceWorkspace,
  type PerformanceWorkspaceTab,
} from '../src/app/PerformanceWorkspace.js';
import { StrategyJobs, StrategyLibrary } from '../src/features/strategy/StrategySections.js';
import { performanceKeys } from '../src/features/performance/performance.queries.js';
import { strategySummaryVersion } from './strategy-summary-ratio-samples.js';
import type { Account } from '../src/features/portfolio/portfolio.types.js';
import type { BacktestJobSummary } from '../src/features/strategy/strategy.types.js';
import '../src/ui/styles.css';

const client = new QueryClient({
  defaultOptions: { queries: { enabled: false, retry: false, staleTime: Infinity } },
});
const accounts: Account[] = [
  {
    id: 'controlled-cny',
    name: '受控人民币账户',
    type: 'securities',
    mode: 'actual',
    currency: 'CNY',
  },
  {
    id: 'controlled-usd',
    name: '受控美元账户',
    type: 'securities',
    mode: 'actual',
    currency: 'USD',
  },
];
for (const accountId of ['', ...accounts.map((account) => account.id)]) {
  for (const fxMerge of [false, true]) {
    const options = { fxMerge, baseCurrency: 'CNY' as const };
    client.setQueryData(performanceKeys.layers('actual', accountId, options), {
      valuedAt: '2026-11-12T01:00:00Z',
      fx: { status: 'ready', asOf: '2026-11-12T00:00:00Z' },
    });
    client.setQueryData(performanceKeys.history('actual', accountId, options), [
      { partial: false, capturedAt: '2026-11-11T01:00:00Z' },
      { partial: true, capturedAt: '2026-11-12T02:00:00Z' },
    ]);
  }
}
const version = { ...strategySummaryVersion('0.25'), version: 1 };
const strategies = [
  {
    id: 'ratio-strategy',
    name: '受控 EMA 策略',
    status: 'active',
    versions: [version, { ...version, id: 'controlled-version-2', version: 2 }],
  },
];
const jobs: BacktestJobSummary[] = ['queued', 'running', 'succeeded', 'failed'].map(
  (status, index) => ({
    id: 'controlled-job-' + index,
    strategyVersionId: version.id,
    status,
    createdAt: '2026-11-12T01:00:00Z',
    progress: 37,
    stage: 'running',
    executionAttempt: 1,
    errorSummary: status === 'failed' ? '受控失败详情' : undefined,
  }),
);

function Harness() {
  const [accountId, setAccountId] = useState('');
  const [tab, setTab] = useState<PerformanceWorkspaceTab>('overview');
  const [receipt, setReceipt] = useState('');
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-4">
      <PerformanceWorkspace
        accountsReady={false}
        accountsError
        accountId={accountId}
        onAccountChange={setAccountId}
        tab={tab}
        onTabChange={setTab}
        onOpenReview={() => setReceipt('受控复盘')}
        onRetry={() => setReceipt('受控刷新')}
        state="error"
        portfolio={null}
        accounts={accounts}
        mode="actual"
        onNavigate={() => setReceipt('受控导航')}
      />
      <StrategyLibrary
        strategies={strategies}
        jobs={jobs}
        loadState="ready"
        busyAction={null}
        onCreate={() => setReceipt('受控创建')}
        onEdit={(_strategy, selected) => setReceipt('受控编辑 v' + selected.version)}
        onBacktest={(_strategy, selected) => setReceipt('受控回测 v' + selected.version)}
      />
      <StrategyJobs
        strategies={strategies}
        jobs={jobs}
        loadState="ready"
        busyAction={null}
        onRun={() => setReceipt('受控重试')}
        onCancel={() => setReceipt('受控取消')}
        onViewResult={(selected) => setReceipt('受控详情 ' + selected.status)}
      />
      <output aria-label="操作回执">{receipt}</output>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <MemoryRouter>
      <Harness />
    </MemoryRouter>
  </QueryClientProvider>,
);
