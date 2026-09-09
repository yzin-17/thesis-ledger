import { PageHeader } from '../shared/PageHeader.js';
import { useState } from 'react';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToastManager } from '@/components/ui/toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { DataStateBanner } from '../shared/DesktopPrimitives.js';
import { RefreshIconButton } from '../shared/RefreshIconButton.js';
import { resolveLoadState } from '../shared/loadState.js';
import { AutomationEditorSheet } from './AutomationEditorSheet.js';
import { ProviderEditorSheet } from './ProviderEditorSheet.js';
import { createProviderActionHandlers } from './providers.actions.js';
import { useProviderQueries } from './providers.queries.js';
import {
  useCreateAutomationJobMutation,
  useDeleteAutomationJobMutation,
  useRunAutomationJobMutation,
  useSaveProviderMutation,
  useTestProviderConnectionMutation,
  useTestProviderDraftMutation,
  useToggleAutomationMutation,
  useUpdateAutomationJobMutation,
} from './providers.mutations.js';
import {
  AUTOMATION_HISTORY_PAGE_SIZE,
  newAutomationJobDraft,
  newProviderDraft,
  type AutomationJob,
  type AutomationJobDraft,
  type ProviderRecord,
  type ProviderTestEvidence,
  type ProviderTestState,
} from './providers.types.js';
import {
  AutomationRunHistoryTable,
  AutomationTable,
  DataQualityIssuesTable,
  HealthHistoryTable,
  NotificationFailuresTable,
  ProviderTable,
} from './ProviderSettingsSections.js';

export type ProviderSettingsTab = 'providers' | 'automation' | 'diagnostics';

export function ProviderSettings() {
  const [healthHistoryPage, setHealthHistoryPage] = useState(1);
  const [automationHistoryPage, setAutomationHistoryPage] = useState(1);
  const [tab, setTab] = useState<ProviderSettingsTab>('providers');
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
  const [automationSheetOpen, setAutomationSheetOpen] = useState(false);
  const [automationDraft, setAutomationDraft] = useState<AutomationJobDraft>(newAutomationJobDraft);
  const [editingAutomationJob, setEditingAutomationJob] = useState<AutomationJob | null>(null);
  const [savingAutomationDraft, setSavingAutomationDraft] = useState(false);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const toastManager = useToastManager();
  const { confirm } = useConfirmDialog();
  const providerQueries = useProviderQueries(healthHistoryPage, automationHistoryPage);
  const providerMutation = useSaveProviderMutation();
  const testProviderMutation = useTestProviderConnectionMutation();
  const testProviderDraftMutation = useTestProviderDraftMutation();
  const toggleJobMutation = useToggleAutomationMutation();
  const createJobMutation = useCreateAutomationJobMutation();
  const updateJobMutation = useUpdateAutomationJobMutation();
  const deleteJobMutation = useDeleteAutomationJobMutation();
  const runJobMutation = useRunAutomationJobMutation();
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
  const jobHistory = providerQueries.jobHistory.data ?? {
    items: [],
    page: automationHistoryPage,
    pageSize: AUTOMATION_HISTORY_PAGE_SIZE,
    total: 0,
    totalPages: 0,
  };
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
      jobHistory.items.length === 0 &&
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
    automationSheetOpen,
    automationDraft,
    editingAutomationJob,
    savingAutomationDraft,
    runningJobId,
    setAutomationSheetOpen,
    setAutomationDraft,
    setEditingAutomationJob,
    setSavingAutomationDraft,
    setRunningJobId,
    createJobMutation,
    updateJobMutation,
    deleteJobMutation,
    runJobMutation,
    confirm,
  });
  const healthHistoryLoading = providerQueries.healthHistory.isFetching;
  const providerRefreshing = Object.values(providerQueries).some((query) => query.isFetching);
  const handleHealthPage = (page: number) => setHealthHistoryPage(page);
  const handleAutomationHistoryPage = (page: number) => setAutomationHistoryPage(page);

  return (
    <section className="module-page" data-provider-sheet-open={String(providerSheetOpen)}>
      <PageHeader
        eyebrow="DATA & AUTOMATION"
        title="数据与自动化"
        description="管理数据源、连接状态和自动化任务。"
        actions={
          <>
            <RefreshIconButton
              label="刷新 Provider 与自动化"
              refreshing={providerRefreshing}
              onClick={() => void load()}
            />
          </>
        }
      />
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
      <AutomationEditorSheet
        open={automationSheetOpen}
        editingJob={editingAutomationJob}
        draft={automationDraft}
        saving={savingAutomationDraft}
        onOpenChange={(open) =>
          open ? actions.openAutomationEditor() : actions.closeAutomationEditor()
        }
        onUpdateDraft={actions.updateAutomationDraft}
        onClose={actions.closeAutomationEditor}
        onSubmit={(event) => void actions.submitAutomationEditor(event)}
      />
      <DataStateBanner state={loadState} onRetry={() => void load()} />
      <Tabs value={tab} onValueChange={(value) => setTab(value as ProviderSettingsTab)}>
        <TabsList variant="line" className="w-full">
          <TabsTrigger value="providers">数据源</TabsTrigger>
          <TabsTrigger value="automation">自动化</TabsTrigger>
          <TabsTrigger value="diagnostics">诊断</TabsTrigger>
        </TabsList>
        <TabsContent value="providers">
          <div className="space-y-6">
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
              onCreate={() => actions.openProviderSheet()}
            />
            <HealthHistoryTable
              loadState={loadState}
              history={healthHistory}
              loading={healthHistoryLoading}
              onPage={handleHealthPage}
            />
          </div>
        </TabsContent>
        <TabsContent value="automation">
          <div className="space-y-6">
            <AutomationTable
              loadState={loadState}
              jobs={jobs}
              togglingJobId={togglingJobId}
              runningJobId={runningJobId}
              onToggle={(job) => void actions.toggleJob(job)}
              onEdit={(job) => actions.openAutomationEditor(job)}
              onRun={(job) => void actions.runJobNow(job)}
              onDelete={(job) => void actions.deleteJob(job)}
              onCreate={() => actions.openAutomationEditor()}
            />
            <AutomationRunHistoryTable
              loadState={loadState}
              jobs={jobs}
              history={jobHistory}
              loading={providerQueries.jobHistory.isFetching}
              onPage={handleAutomationHistoryPage}
            />
          </div>
        </TabsContent>
        <TabsContent value="diagnostics">
          <div className="space-y-6">
            <NotificationFailuresTable
              loadState={loadState}
              notificationFailures={notificationFailures}
            />
            <DataQualityIssuesTable loadState={loadState} issues={issues} />
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
