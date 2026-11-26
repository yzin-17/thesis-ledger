import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrategyVersionScreen } from '../src/features/strategy-library/StrategyVersionScreen';
import { useState } from 'react';
import {
  authoringModificationTargetOptions,
  type BacktestStrategy,
  type AuthoringProposalInput,
} from '@thesis-ledger/schemas';
import { AuthoringProposalReview } from '../src/features/strategy-authoring/AuthoringProposalReview';
import { BacktestDailyOrders } from '../src/features/backtest-results/BacktestDailyOrders';
import { Choices, Page, Copy } from '../src/components/MobilePrimitives';
const qa = window as unknown as {
  tradePlanConfiguration: BacktestStrategy;
  tradePlanBefore: BacktestStrategy;
  tradePlanDifferences: AuthoringProposalInput['differences'];
  tradePlanAllowedPaths?: AuthoringProposalInput['allowedPaths'];
  tradePlanResult?: { dailyOrders?: unknown };
};
function ProposalPage() {
  const [target, setTarget] = useState('exit');
  const [result, setResult] = useState('');
  return (
    <Page title="交易计划修改">
      <Choices
        label="修改范围"
        value={target}
        onChange={setTarget}
        options={authoringModificationTargetOptions}
      />
      <AuthoringProposalReview
        payload={{
          allowedPaths: qa.tradePlanAllowedPaths ?? ['tradePlan'],
          beforeText: JSON.stringify(qa.tradePlanBefore),
          afterText: JSON.stringify(qa.tradePlanConfiguration),
          differences: qa.tradePlanDifferences,
        }}
        canApply
        canDiscard
        onApply={() => setResult('已在独立样本采用')}
        onDiscard={() => setResult('已在独立样本放弃')}
      />
      <Copy>{result}</Copy>
    </Page>
  );
}
function SelectedPage() {
  const view = new URLSearchParams(location.search).get('view');
  if (view === 'orders') return <Page title="委托结果"><BacktestDailyOrders value={qa.tradePlanResult?.dailyOrders} unit="研究单位" /></Page>;
  if (view === 'proposal') return <ProposalPage />;
  return <StrategyVersionScreen />;
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SelectedPage /></QueryClientProvider>,
);
