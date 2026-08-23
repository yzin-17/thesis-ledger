import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToastManager } from '@/components/ui/toast';

import { DataStateBanner } from '../shared/DesktopPrimitives.js';
import { resolveLoadState } from '../shared/loadState.js';
import { ProviderEditorSheet } from './ProviderEditorSheet.js';
import { createProviderActionHandlers } from './providers.actions.js';
import { useProviderQueries } from './providers.queries.js';
import {
  useSaveProviderMutation,
  useTestProviderConnectionMutation,
  useTestProviderDraftMutation,
  useToggleAutomationMutation,
} from './providers.mutations.js';
import type {
  AutomationJob,
  ProviderRecord,
  ProviderTestEvidence,
  ProviderTestState,
} from './providers.types.js';
import { newProviderDraft } from './providers.types.js';
import {
  AutomationTable,
  HealthHistoryTable,
  ProviderHistoryTables,
  ProviderTable,
} from './ProviderSettingsSections.js';

export function ProviderSettings() {
  const [healthHistoryPage, setHealthHistoryPage] = useState(1);
  const [providerDraft, setProviderDraft] = useState(newProviderDraft);
  const [providerSheetOpen, setProviderSheetOpen] = useState(false);
  const [editingProviderName, setEditingProviderName] = useState<string | null>(null);
  const [credentialInputOpen, setCredentialInputOpen] = useState(true);
  const [providerTestState, setProviderTestState] = useState<ProviderTestState>('idle');
  const [providerTestEvidence, setProviderTestEvidence] = useState<ProviderTestEvidence | null>(
    null,
  );
  const [testingProviderName, setTestingProviderName] = useState<string | null>(null);
  const [savingProviderName, setSavingProviderName] = useState<string | null>(null);
  const [savingProviderDraft, setSavingProviderDraft] = useState(false);
  const [togglingJobId, setTogglingJobId] = useState<string | null>(null);
  const [providerPriorityDrafts, setProviderPriorityDrafts] = useState<Record<string, number>>({});
  const toastManager = useToastManager();
  const providerQueries = useProviderQueries(healthHistoryPage);
  const providerMutation = useSaveProviderMutation();
  const testProviderMutation = useTestProviderConnectionMutation();
  const testProviderDraftMutation = useTestProviderDraftMutation();
  const toggleJobMutation = useToggleAutomationMutation();
  const providers: ProviderRecord[] = providerQueries.providers.data ?? [];
  const issues = providerQueries.issues.data ?? [];
  const jobs: AutomationJob[] = providerQueries.jobs.data ?? [];
  const healthHistory = providerQueries.healthHistory.data ?? {
    items: [],
    page: healthHistoryPage,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  };
  const jobHistory = providerQueries.jobHistory.data ?? [];
  const notificationFailures = providerQueries.notificationFailures.data ?? [];
  const hasProviderData = Object.values(providerQueries).some((query) => query.data !== undefined);
  const loadState = resolveLoadState(
    Object.values(providerQueries),
    hasProviderData,
    hasProviderData &&
      providers.length === 0 &&
      issues.length === 0 &&
      jobs.length === 0 &&
      healthHistory.items.length === 0 &&
      jobHistory.length === 0 &&
      notificationFailures.length === 0,
  );
  const load = async () => {
    await Promise.all(Object.values(providerQueries).map((query) => query.refetch()));
  };
  const resetProviderTest = () => {
    setProviderTestState('idle');
    setProviderTestEvidence(null);
  };
  const updateProviderDraft = (
    updater: (current: typeof providerDraft) => typeof providerDraft,
  ) => {
    setProviderDraft(updater);
    resetProviderTest();
  };
  const actions = createProviderActionHandlers({
    providerDraft,
    credentialInputOpen,
    providerTestEvidence,
    savingProviderDraft,
    setProviderDraft,
    setProviderSheetOpen,
    setEditingProviderName,
    setCredentialInputOpen,
    setProviderTestState,
    setProviderTestEvidence,
    setTestingProviderName,
    setSavingProviderName,
    setTogglingJobId,
    setSavingProviderDraft,
    setProviderPriorityDrafts,
    toastManager,
    providerMutation,
    testProviderMutation,
    testProviderDraftMutation,
    toggleJobMutation,
    load,
    resetProviderTest,
  });
  const healthHistoryLoading = providerQueries.healthHistory.isFetching;
  const handleHealthPage = (page: number) => setHealthHistoryPage(page);

  return (
    <section className="module-page" data-provider-sheet-open={String(providerSheetOpen)}>
      <div className="entry-page-heading">
        <div>
          <p className="kicker">Providers</p>
          <h1>数据与自动化</h1>
          <p className="page-description">
            按能力查看 Provider、优先级、健康和额度；凭证只显示配置状态，不回显密钥。
          </p>
        </div>
        <Button type="button" variant="default" onClick={() => actions.openProviderSheet()}>
          新增或更新 Provider
        </Button>
      </div>
      <Button className="secondary" type="button" variant="outline" onClick={() => void load()}>
        刷新 Provider 与自动化
      </Button>
      <ProviderEditorSheet
        open={providerSheetOpen}
        editingProviderName={editingProviderName}
        providerDraft={providerDraft}
        credentialInputOpen={credentialInputOpen}
        providerTestState={providerTestState}
        savingProviderDraft={savingProviderDraft}
        onOpenChange={(open) => (open ? setProviderSheetOpen(true) : actions.closeProviderSheet())}
        onUpdateDraft={updateProviderDraft}
        onResetTest={resetProviderTest}
        onSetCredentialInputOpen={setCredentialInputOpen}
        onClose={actions.closeProviderSheet}
        onTest={() => void actions.testProviderDraft()}
        onSave={(event) => void actions.saveProviderDraft(event)}
      />
      <DataStateBanner state={loadState} onRetry={() => void load()} />
      <ProviderTable
        loadState={loadState}
        providers={providers}
        priorityDrafts={providerPriorityDrafts}
        testingProviderName={testingProviderName}
        savingProviderName={savingProviderName}
        onPriorityChange={(name, value) =>
          setProviderPriorityDrafts((current) => ({ ...current, [name]: value }))
        }
        onPrioritySave={(provider) => void actions.saveProvider(provider)}
        onEdit={actions.openProviderSheet}
        onTest={(name) => void actions.test(name)}
        onToggle={(provider) =>
          void actions.saveProvider(
            provider,
            !provider.enabled,
            `${provider.name} 已${provider.enabled ? '停用' : '启用'}`,
          )
        }
      />
      <AutomationTable
        loadState={loadState}
        jobs={jobs}
        togglingJobId={togglingJobId}
        onToggle={(job) => void actions.toggleJob(job)}
      />
      <HealthHistoryTable
        loadState={loadState}
        history={healthHistory}
        loading={healthHistoryLoading}
        onPage={handleHealthPage}
      />
      <ProviderHistoryTables
        loadState={loadState}
        jobHistory={jobHistory}
        notificationFailures={notificationFailures}
        issues={issues}
      />
    </section>
  );
}
