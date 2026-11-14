import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { BacktestSetupDialog } from '../src/features/strategy/BacktestSetupDialog';
import { StrategyBacktestResultTabs } from '../src/features/strategy/StrategyBacktestDetailSections';
import { StrategyEditorSheet } from '../src/features/strategy/StrategyEditorSheet';
import { NavigationGuardProvider } from '../src/features/shared/navigation-guard';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog';
import { ToastProvider } from '../src/components/ui/toast';
import { Button } from '../src/components/ui/button';
import {
  legacyVersion,
  researchVersion,
  researchModel,
  researchJob,
  sampleStrategy,
} from '../../../packages/schemas/test/price-research-fixture';
import type { BacktestJob, StrategyVersion } from '../src/features/strategy/strategy.types';
import '../src/ui/styles.css';

Object.assign(window, { priceResearchQa: { model: researchModel, researchVersion } });
const view = new URLSearchParams(location.search).get('view') ?? 'setup';
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4" data-price-research-qa={view}>
      {view === 'setup' && (
        <>
          <Button onClick={() => setOpen(true)}>打开研究设置</Button>
          <BacktestSetupDialog
            open={open}
            strategy={sampleStrategy}
            version={legacyVersion}
            busy={false}
            initialSetup={{ period: { start: '2024-01-02', end: '2024-03-29' }, initialCash: 1000 }}
            onOpenChange={setOpen}
            onSubmit={async () => {
              throw Error('受控浏览器不创建业务回测');
            }}
          />
        </>
      )}
      {view === 'result' && <StrategyBacktestResultTabs job={researchJob as BacktestJob} />}
      {view === 'editor' && (
        <StrategyEditorSheet
          open
          mode="edit"
          presentation="page"
          version={researchVersion as StrategyVersion}
          strategy={sampleStrategy}
          busy={false}
          onOpenChange={() => undefined}
          onSave={() => undefined}
        />
      )}
    </main>
  );
}
const router = createMemoryRouter([
  {
    path: '*',
    element: (
      <ToastProvider>
        <ConfirmDialogProvider>
          <NavigationGuardProvider>
            <Harness />
          </NavigationGuardProvider>
        </ConfirmDialogProvider>
      </ToastProvider>
    ),
  },
]);
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
