import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { StrategyBacktestDetailPage } from '../src/features/strategy/StrategyBacktestDetailPage.js';
import { BacktestPricePreparation } from '../src/features/strategy/BacktestPricePreparation.js';
import { StrategyEditorSheet } from '../src/features/strategy/StrategyEditorSheet.js';
import { cancelBacktest, retryBacktest } from '../src/features/strategy/strategy.api.js';
import { strategyKeys } from '../src/features/strategy/strategy.queries.js';
import type { BacktestJob, StrategySchema } from '../src/features/strategy/strategy.types.js';
import type { BacktestExecutionModelV3 } from '@thesis-ledger/schemas';
import '../src/ui/styles.css';

const qa = window as unknown as { practicalRunId: string; practicalModel: BacktestExecutionModelV3; practicalEditingStrategy: StrategySchema };
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
(window as unknown as { practicalRefresh: () => Promise<void> }).practicalRefresh = () =>
  client.refetchQueries({ queryKey: strategyKeys.jobs() });
function Detail() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (job: BacktestJob, kind: 'cancel' | 'retry') => {
    setBusy(`${kind}:${job.id}`);
    try {
      await client.cancelQueries({ queryKey: strategyKeys.jobs() });
      const receipt = await (kind === 'cancel' ? cancelBacktest(job.id) : retryBacktest(job.id));
      client.setQueryData(strategyKeys.job(receipt.id), receipt);
      if (receipt.id !== job.id) navigate(`/strategy/jobs/${receipt.id}`);
    } finally { setBusy(null); }
  };
  return <StrategyBacktestDetailPage strategies={[]} strategiesLoading={false} busyAction={busy}
    onRun={() => {}} onCancel={(job) => void act(job, 'cancel')}
    onRetry={(job) => void act(job, 'retry')} onRerun={() => {}} />;
}
function Harness() {
  const [submitted, setSubmitted] = useState(false);
  const [saved, setSaved] = useState<StrategySchema | null>(null);
  if (new URLSearchParams(location.search).get('view') === 'policy') return <>
    <StrategyEditorSheet open presentation="page" mode="edit" version={{ id: 'editor-version', version: 1, schema: qa.practicalEditingStrategy }}
      busy={false} onOpenChange={() => {}} onSave={setSaved} />
    <output hidden data-testid="saved-policy">{saved && JSON.stringify(saved)}</output>
  </>;
  if (new URLSearchParams(location.search).get('view') === 'prepare') return <><BacktestPricePreparation
    strategyVersionId="11111111-1111-4111-8111-111111111111" adjustment="hfq"
    period={{ start: '2024-01-02', end: '2024-03-29' }} initialCash="10000" currency="CNY"
    priceResearch initialModel={qa.practicalModel} onPrepared={() => {}} onSubmitted={() => setSubmitted(true)} />
    {submitted && <p role="status">已创建回测任务</p>}</>;
  return <MemoryRouter initialEntries={[`/strategy/jobs/${qa.practicalRunId}`]}><Routes>
    <Route path="/strategy/jobs/:jobId" element={<Detail />} />
  </Routes></MemoryRouter>;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}>
  <main className="mx-auto max-w-6xl p-4"><Harness /></main>
</QueryClientProvider>);
