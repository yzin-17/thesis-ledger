import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { Button } from '../src/components/ui/button';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog';
import { Toaster } from '../src/components/ui/toast';
import { RiskRuleEditorSheet } from '../src/features/risk/RiskRuleEditorSheet';
import { StrategyRiskApplicationsSection } from '../src/features/risk/StrategyRiskApplicationsSection';
import { riskKeys } from '../src/features/risk/risk.queries';
import { strategyKeys } from '../src/features/strategy/strategy.queries';
import { riskAccount, riskPosition } from './risk-threshold.fixture';
import { ruleApplication, ruleStrategy } from './strategy-rule-notification.fixture';
import '../src/ui/styles.css';

const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false } },
});
client.setQueryData(riskKeys.riskNotificationRouting(), {
  availableRoutes: [{ provider: '主要通知', channel: 'feishu' }],
  selectedProviders: ['主要通知'],
});
client.setQueryData(
  ['desktop', 'strategy', 'risk-applications'],
  [
    {
      ...ruleApplication,
      accountId: riskAccount.id,
      notification: { ...ruleApplication.notification, enabled: true, providers: ['主要通知'] },
    },
  ],
);
client.setQueryData(strategyKeys.strategies(), [ruleStrategy]);
function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <main className="content">
      <Button onClick={() => setOpen(true)}>新建风险规则</Button>
      <RiskRuleEditorSheet
        open={open}
        rule={null}
        accounts={[riskAccount]}
        positions={[riskPosition]}
        pending={false}
        onOpenChange={setOpen}
        onSubmit={async () => false}
      />
      <StrategyRiskApplicationsSection accounts={[riskAccount]} />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <MemoryRouter>
      <Toaster>
        <ConfirmDialogProvider>
          <Harness />
        </ConfirmDialogProvider>
      </Toaster>
    </MemoryRouter>
  </QueryClientProvider>,
);
