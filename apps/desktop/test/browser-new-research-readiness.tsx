import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { ToastProvider } from '../src/components/ui/toast.js';
import { NewResearchSheet } from '../src/features/ai/NewResearchSheet.js';
import { aiKeys } from '../src/features/ai/ai.queries.js';
import { portfolioKeys } from '../src/features/portfolio/portfolio.queries.js';
import { strategyKeys } from '../src/features/strategy/strategy.queries.js';
import { strategySummaryVersion } from './strategy-summary-ratio-samples.js';
import '../src/ui/styles.css';

const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
});
client.setQueryData(aiKeys.capabilities(), { canStart: true, providers: [] });
client.setQueryData(aiKeys.routingSettings(), {
  revision: 'controlled',
  researchDefault: { providerId: 'controlled', model: 'controlled-model' },
  candidates: [
    {
      providerId: 'controlled',
      providerName: '受控模型',
      model: 'controlled-model',
      enabled: true,
      health: 'healthy',
      authMode: 'none',
      priceConfigured: true,
    },
  ],
});
client.setQueryData(portfolioKeys.accounts(), [
  {
    id: 'actual-account',
    name: '受控实际账户',
    mode: 'actual',
    type: 'securities',
    currency: 'CNY',
    active: true,
  },
  {
    id: 'shadow-account',
    name: '受控模拟账户',
    mode: 'shadow',
    type: 'securities',
    currency: 'CNY',
    active: true,
  },
]);
client.setQueryData(portfolioKeys.valuation('actual', 'actual-account'), {
  positions: [{ symbol: '510300.SH', asset: { name: '受控持仓' } }],
});
client.setQueryData(strategyKeys.strategies(), [
  { id: 'controlled-strategy', name: '受控策略', versions: [strategySummaryVersion('0.25')] },
]);
const retry = new URLSearchParams(location.search).get('case') === 'retry';
const retryId = '00000000-0000-4000-8000-000000000001';
client.setQueryData(aiKeys.retryPrefill(retryId), {
  sourceRunId: retryId,
  context: { scope: 'portfolio', mode: 'actual' },
  question: '受控重试问题',
  templateId: null,
  sourceOutcome: 'unknown',
  contextState: 'valid',
  requiresUnknownOutcomeAcknowledgement: true,
});
function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <NewResearchSheet
      open={open}
      onOpenChange={setOpen}
      {...(retry ? { retryOfRunId: retryId } : {})}
      onCreated={() => {
        throw new Error('受控验收不提交研究');
      }}
    />
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <MemoryRouter>
      <ToastProvider>
        <ConfirmDialogProvider>
          <Harness />
        </ConfirmDialogProvider>
      </ToastProvider>
    </MemoryRouter>
  </QueryClientProvider>,
);
