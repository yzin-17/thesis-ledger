import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog';
import { NavigationGuardProvider } from '../src/features/shared/navigation-guard';
import { Toaster } from '../src/components/ui/toast';
import { StrategyRiskApplicationPage } from '../src/features/strategy/StrategyRiskApplicationPage';
import { RiskApplicationNotificationEditor } from '../src/features/risk/StrategyRiskApplicationEditors';
import { updateStrategyRiskApplication } from '../src/features/strategy/strategy-optimization.api';
import { ruleApplication, ruleStrategy } from './strategy-rule-notification.fixture';
import { manualNotificationRule } from './strategy-rule-notification.fixture';
import { RiskRuleEditorSheet } from '../src/features/risk/RiskRuleEditorSheet';
import { riskAccount, riskPosition } from './risk-threshold.fixture';
import { createRiskRule, patchRiskRule } from '../src/features/risk/risk.api';
import { RiskCenter } from '../src/features/risk/RiskCenter';
import { StrategyRiskApplicationsSection } from '../src/features/risk/StrategyRiskApplicationsSection';
import { strategyKeys } from '../src/features/strategy/strategy.queries';
import type { CreateRiskRuleInput, RiskRuleRecord } from '../src/features/risk/risk.types';
import '../src/ui/styles.css';

function Editor() {
  const [application, setApplication] = useState(ruleApplication);
  const mutation = useMutation({
    mutationFn: (notification: typeof application.notification) =>
      updateStrategyRiskApplication(application.id, {
        expectedRevision: application.revision,
        notification,
      }),
    onSuccess: setApplication,
  });
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">风险应用</h1>
      <RiskApplicationNotificationEditor
        application={application}
        pending={mutation.isPending}
        onSave={(value) => mutation.mutate(value)}
      />
      {mutation.isError ? <p role="alert">保存失败，输入已保留。</p> : null}
      {mutation.isSuccess ? <p role="status">配置已保存</p> : null}
    </main>
  );
}
const mode = new URLSearchParams(location.search).get('mode');
const editor = mode === 'editor' || mode === 'provider-edit';
function ManualRule() {
  const [open, setOpen] = useState(true);
  const [saved, setSaved] = useState<RiskRuleRecord | null>(
    mode === 'manual-edit' ? manualNotificationRule : null,
  );
  const mutation = useMutation({
    mutationFn: (input: CreateRiskRuleInput) =>
      saved ? patchRiskRule(saved.id, input) : createRiskRule(input),
    onSuccess: (rule) => setSaved(rule),
  });
  return (
    <>
      <RiskRuleEditorSheet
        open={open}
        onOpenChange={setOpen}
        rule={saved}
        accounts={[riskAccount]}
        positions={[riskPosition]}
        pending={mutation.isPending}
        onSubmit={async (input) => {
          try {
            await mutation.mutateAsync(input);
            return true;
          } catch {
            return false;
          }
        }}
      />
      {mutation.isError ? <p role="alert">保存失败，输入保留</p> : null}
      {!open && saved ? (
        <>
          <p>规则已保存</p>
          <button onClick={() => setOpen(true)}>编辑已保存规则</button>
        </>
      ) : null}
    </>
  );
}
let initialPath = `/strategy/library/strategy/versions/${ruleStrategy.versions[0].id}/risk-application`;
if (mode?.startsWith('manual')) initialPath = '/manual';
else if (editor) initialPath = '/editor';
else if (mode === 'notification-list') initialPath = '/risk-center?tab=notifications';
else if (mode === 'application-list') initialPath = '/applications';
else if (mode === 'overview-list') initialPath = '/risk-center';
else if (mode === 'overview-legacy') initialPath = '/risk-center?tab=events';
const router = createMemoryRouter(
  [
    {
      element: (
        <NavigationGuardProvider>
          <Outlet />
        </NavigationGuardProvider>
      ),
      children: [
        {
          path: '/strategy/library/:strategyId/versions/:versionId/risk-application',
          element: (
            <StrategyRiskApplicationPage strategies={[ruleStrategy]} presentation="drawer" />
          ),
        },
        { path: '/outside', element: <p>受控其他页面</p> },
        { path: '/applications', element: <main className="mx-auto max-w-6xl p-4"><StrategyRiskApplicationsSection accounts={[riskAccount]} /></main> },
        { path: '/manual', element: <ManualRule /> },
        { path: '/risk-center', element: <RiskCenter accounts={[]} portfolio={null} portfolioState="empty" mode="actual" /> },
        { path: '*', element: editor ? <Editor /> : <p>返回策略版本</p> },
      ],
    },
  ],
  {
    initialEntries: [initialPath],
  },
);
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: mode === 'application-list' ? Infinity : 0 }, mutations: { retry: false } },
});
if (mode === 'application-list') {
  const application = { ...ruleApplication, accountId: riskAccount.id, enabled: true,
    notification: { ...ruleApplication.notification, enabled: true, providers: ['主要通知'] } };
  client.setQueryData(['desktop', 'strategy', 'risk-applications'], [application,
    { ...application, id: '88888888-8888-4888-8888-888888888888', enabled: false }]);
  client.setQueryData(strategyKeys.strategies(), [ruleStrategy]);
}
Object.assign(window, { riskCloseHarness: { navigate: router.navigate } });
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <Toaster>
      <ConfirmDialogProvider>
        <RouterProvider router={router} />
      </ConfirmDialogProvider>
    </Toaster>
  </QueryClientProvider>,
);
