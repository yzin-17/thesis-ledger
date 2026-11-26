import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { StrategyV2Summary } from '../src/features/strategy/StrategyV2Summary';
import {
  StrategyVersionPage,
  type StrategyVersionTabState,
} from '../src/features/strategy/StrategyLibraryPages';
import type { StrategySchema } from '../src/features/strategy/strategy.types';
import '../src/ui/styles.css';
import { authoringModificationTargetOptions } from '@thesis-ledger/schemas';
import { AuthoringSelect } from '../src/features/strategy-authoring/AuthoringSelect';
import { AuthoringPlanReview } from '../src/features/strategy-authoring/AuthoringPlanReview';
import { Button } from '../src/components/ui/button';
import { BacktestDailyOrders } from '../src/features/strategy/BacktestDailyOrders';
const qa = window as unknown as {
  tradePlanConfiguration: StrategySchema;
  tradePlanBefore: StrategySchema;
  tradePlanAllowedPaths?: string[];
  tradePlanResult?: { dailyOrders?: unknown };
};
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function ProposalPage() {
  const [target, setTarget] = useState('exit');
  const [result, setResult] = useState('');
  return (
    <div className="flex flex-col gap-4">
      <AuthoringSelect
        label="修改范围"
        value={target}
        onChange={setTarget}
        options={authoringModificationTargetOptions}
      />
      <AuthoringPlanReview
        beforeText={JSON.stringify(qa.tradePlanBefore)}
        afterText={JSON.stringify(qa.tradePlanConfiguration)}
        includeRules={qa.tradePlanAllowedPaths?.some(path => ['entry', 'exit', 'execution'].includes(path.split('.')[0]!))}
      />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setResult('已在独立样本采用')}>确认应用修改</Button>
        <Button variant="outline" onClick={() => setResult('已在独立样本放弃')}>
          放弃修改建议
        </Button>
      </div>
      <p role="status">{result}</p>
    </div>
  );
}
function VersionPage() {
  const [tabState, onTabChange] = useState<StrategyVersionTabState>({
    sourceKey: '',
    value: 'definition',
  });
  return (
    <StrategyVersionPage
      strategies={[
        {
          id: 'trade-plan-qa',
          name: '模拟交易计划',
          status: 'draft',
          versions: [{ id: 'trade-plan-version', version: 1, schema: qa.tradePlanConfiguration }],
        },
      ]}
      loading={false}
      onBacktest={() => {}}
      tabState={tabState}
      onTabChange={onTabChange}
    />
  );
}
function SelectedPage() {
  const view = new URLSearchParams(location.search).get('view');
  if (view === 'orders') return <BacktestDailyOrders value={qa.tradePlanResult?.dailyOrders} unit="研究单位" />;
  if (view === 'proposal') return <ProposalPage />;
  if (view !== 'version') return <StrategyV2Summary schema={qa.tradePlanConfiguration} />;
  return (
    <MemoryRouter initialEntries={['/strategy/library/trade-plan-qa/versions/trade-plan-version']}>
      <Routes>
        <Route path="/strategy/library/:strategyId/versions/:versionId" element={<VersionPage />} />
      </Routes>
    </MemoryRouter>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <main className="mx-auto max-w-5xl p-4">
      <SelectedPage />
    </main>
  </QueryClientProvider>,
);
