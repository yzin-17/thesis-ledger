import { PageHeader } from '../shared/PageHeader.js';
import { useRef, useState } from 'react';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToastManager } from '@/components/ui/toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { DataStateBanner } from '../shared/DesktopPrimitives.js';
import { RefreshIconButton } from '../shared/RefreshIconButton.js';
import { resolveLoadState } from '../shared/loadState.js';
import { ProviderDiagnosticsPanel } from './ProviderDiagnosticsPanel.js';
import { AutomationEditorSheet } from './AutomationEditorSheet.js';
import { AutomationSettingsPanel } from './AutomationSettingsPanel.js';
import { useAutomationHistoryScope } from './useAutomationHistoryScope.js';
import { ProviderEditorSheet } from './ProviderEditorSheet.js';
import { useAiProviderEditor } from './useAiProviderEditor.js';
import { useAiProviderPriority } from './useAiProviderPriority.js';
import { isAiProvider } from './providers.types.js';
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
  newAutomationJobDraft,
  newProviderDraft,
  type AutomationJob,
  type AutomationJobDraft,
  type ProviderRecord,
  type ProviderTestEvidence,
  type ProviderTestState,
} from './providers.types.js';
import { HealthHistoryTable, ProviderTable } from './ProviderSettingsSections.js';

export type ProviderSettingsTab = 'providers' | 'automation' | 'diagnostics';

function initialProviderSettingsTab(): ProviderSettingsTab {
  if (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('tab') === 'automation'
  )
    return 'automation';
  return 'providers';
}

export function ProviderSettings() {
  const {
    automationHistory,
    setHealthFailurePage,
    setAutomationFailurePage,
    tab,
    setTab,
    testingProviderName,
    savingProviderName,
    togglingJobId,
    providerPriorityDrafts,
    setProviderPriorityDrafts,
    automationSheetOpen,
    automationDraft,
    editingAutomationJob,
    savingAutomationDraft,
    runningJobId,
    deletingJobId,
    providerQueries,
    aiEditor,
    aiPriority,
    providers,
    jobs,
    healthHistory,
    jobHistory,
    jobHistoryLoadState,
    loadState,
    load,
    actions,
    healthHistoryLoading,
    providerRefreshing,
    handleHealthPage,
    providerEditorOpen,
  } = useProviderSettingsController();
  return (
    <section className="module-page" data-provider-sheet-open={String(providerEditorOpen)}>
      <PageHeader
        className="mb-card"
        eyebrow="DATA & AUTOMATION"
        title="数据与自动化"
        actions={
          <>
            <RefreshIconButton
              label="刷新数据与自动化"
              refreshing={providerRefreshing}
              onClick={() => void load()}
            />
          </>
        }
      />
      <ProviderEditorSheet
        open={providerEditorOpen}
        editingProviderName={aiEditor.editor.editingProviderName}
        providerDraft={aiEditor.editor.providerDraft}
        credentialInputOpen={aiEditor.editor.credentialInputOpen}
        providerTestState={aiEditor.editor.providerTestState}
        savingProviderDraft={aiEditor.editor.savingProviderDraft}
        availableAiModels={aiEditor.editor.availableModels}
        aiModelDetails={aiEditor.editor.modelDetails}
        aiModelCatalogState={aiEditor.editor.modelCatalogState}
        onOpenChange={aiEditor.editor.onOpenChange}
        onUpdateDraft={aiEditor.updateDraft}
        onResetTest={aiEditor.editor.onResetTest}
        onSetCredentialInputOpen={aiEditor.editor.onSetCredentialInputOpen}
        onAuthModeChange={aiEditor.editor.onAuthModeChange}
        onTestModel={(model) => void aiEditor.testDraft(model)}
        onTestPurpose={(model, purpose, mode) => void aiEditor.testDraft(model, purpose, mode)}
        onCancelTest={aiEditor.cancelTest}
        onTypeChange={aiEditor.changeType}
        onFetchAiModels={() => void aiEditor.fetchModels()}
        onClose={aiEditor.close}
        onTest={() => void aiEditor.testDraft()}
        onSave={(event) => void aiEditor.saveDraft(event)}
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
              refreshing={providerQueries.providers.isRefetching}
              loadState={loadState}
              providers={providers}
              priorityDrafts={providerPriorityDrafts}
              testingProviderName={aiEditor.testingProviderName ?? testingProviderName}
              savingProviderName={
                aiPriority.savingProviderName ?? aiEditor.testingProviderName ?? savingProviderName
              }
              deletingProviderName={aiEditor.deletingProviderName}
              onPriorityChange={(name, value) =>
                setProviderPriorityDrafts((current) => ({ ...current, [name]: value }))
              }
              onPrioritySave={(provider) => {
                if (isAiProvider(provider)) void aiPriority.save(provider);
                else void actions.saveProvider(provider);
              }}
              onEdit={(provider) => aiEditor.openEditor(provider)}
              onTest={(provider) => {
                if (isAiProvider(provider)) aiEditor.openEditor(provider);
                else void actions.test(provider.name);
              }}
              onToggle={(provider) => {
                if (isAiProvider(provider)) void aiEditor.toggle(provider);
                else
                  void actions.saveProvider(
                    provider,
                    !provider.enabled,
                    `${provider.name} 已${provider.enabled ? '停用' : '启用'}`,
                  );
              }}
              onDelete={(provider) => void aiEditor.remove(provider)}
              onCreate={() => aiEditor.openEditor()}
            />
            <HealthHistoryTable
              loadState={resolveLoadState(
                [providerQueries.healthHistory],
                providerQueries.healthHistory.data !== undefined,
                providerQueries.healthHistory.data?.items.length === 0,
              )}
              history={healthHistory}
              loading={healthHistoryLoading}
              onPage={handleHealthPage}
              onRetry={() => void providerQueries.healthHistory.refetch()}
            />
          </div>
        </TabsContent>
        <TabsContent value="automation">
          <AutomationSettingsPanel
            table={{
              loadState,
              jobs,
              readError: providerQueries.jobs.isError,
              reloading: providerQueries.jobs.isFetching,
              onRetry: () => void providerQueries.jobs.refetch(),
              togglingJobId,
              runningJobId,
              deletingJobId,
              onToggle: (job) => void actions.toggleJob(job),
              onEdit: (job) => actions.openAutomationEditor(job),
              onRun: (job) => void actions.runJobNow(job),
              onDelete: (job) => void actions.deleteJob(job),
              onCreate: () => actions.openAutomationEditor(),
            }}
            history={{
              loadState: jobHistoryLoadState,
              jobs,
              history: jobHistory,
              loading: providerQueries.jobHistory.isFetching,
              onPage: automationHistory.onPage,
              ...automationHistory.filterProps,
            }}
          />
        </TabsContent>
        <TabsContent value="diagnostics">
          <ProviderDiagnosticsPanel
            queries={providerQueries}
            jobs={jobs}
            onHealthPage={setHealthFailurePage}
            onAutomationPage={setAutomationFailurePage}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}

function useProviderSettingsController() {
  const [healthHistoryPage, setHealthHistoryPage] = useState(1);
  const automationHistory = useAutomationHistoryScope();
  const [healthFailurePage, setHealthFailurePage] = useState(1);
  const [automationFailurePage, setAutomationFailurePage] = useState(1);
  const [tab, setTab] = useState<ProviderSettingsTab>(initialProviderSettingsTab);
  const [providerDraft, setProviderDraft] = useState(newProviderDraft);
  const [, setProviderSheetOpen] = useState(false);
  const [, setEditingProviderName] = useState<string | null>(null);
  const [credentialInputOpen, setCredentialInputOpen] = useState(true);
  const [, setProviderTestState] = useState<ProviderTestState>('idle');
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
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const deletingJobIdRef = useRef<string | null>(null);
  const toastManager = useToastManager();
  const { confirm } = useConfirmDialog();
  const providerQueries = useProviderQueries(healthHistoryPage, automationHistory.page, {
    healthPage: healthFailurePage,
    automationPage: automationFailurePage,
    automationJobId: automationHistory.jobId,
    enabled: tab === 'diagnostics',
  });
  const aiEditor = useAiProviderEditor(providerQueries.routingSettings.data);
  const aiPriority = useAiProviderPriority((name) => {
    setProviderPriorityDrafts((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
  });
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
  const jobHistory = providerQueries.jobHistory.data ?? automationHistory.emptyPage;
  const jobHistoryLoadState = resolveLoadState(
    [providerQueries.jobHistory],
    providerQueries.jobHistory.data !== undefined,
    providerQueries.jobHistory.data !== undefined &&
      providerQueries.jobHistory.data.items.length === 0,
  );
  const notificationFailures = providerQueries.notificationFailures.data ?? [];
  const activeQueries = Object.entries(providerQueries)
    .filter(
      ([name]) => tab === 'diagnostics' || !['healthFailures', 'automationFailures'].includes(name),
    )
    .map(([, query]) => query);
  const hasProviderData = activeQueries.some((query) => query.data !== undefined);
  const loadState = resolveLoadState(
    activeQueries,
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
    await Promise.all(activeQueries.map((query) => query.refetch()));
  };
  const resetProviderTest = () => {
    setProviderTestState('idle');
    setProviderTestEvidence(null);
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
    deletingJobIdRef,
    setDeletingJobId,
    createJobMutation,
    updateJobMutation,
    deleteJobMutation,
    runJobMutation,
    confirm,
  });
  const healthHistoryLoading = providerQueries.healthHistory.isFetching;
  const providerRefreshing = activeQueries.some((query) => query.isFetching);
  const handleHealthPage = (page: number) => setHealthHistoryPage(page);
  const providerEditorOpen = aiEditor.editor.open;

  return {
    automationHistory,
    setHealthFailurePage,
    setAutomationFailurePage,
    tab,
    setTab,
    testingProviderName,
    savingProviderName,
    togglingJobId,
    providerPriorityDrafts,
    setProviderPriorityDrafts,
    automationSheetOpen,
    automationDraft,
    editingAutomationJob,
    savingAutomationDraft,
    runningJobId,
    deletingJobId,
    providerQueries,
    aiEditor,
    aiPriority,
    providers,
    jobs,
    healthHistory,
    jobHistory,
    jobHistoryLoadState,
    loadState,
    load,
    actions,
    healthHistoryLoading,
    providerRefreshing,
    handleHealthPage,
    providerEditorOpen,
  };
}
