import { Spinner } from '@/components/ui/spinner';
import { PageHeader } from '../shared/PageHeader.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToastManager } from '@/components/ui/toast';
import { useNavigate, useSearchParams } from 'react-router';

import type { Account, Portfolio, PortfolioMode } from '../portfolio/portfolio.types.js';
import { DataStateBanner } from '../shared/DesktopPrimitives.js';
import { resolveLoadState } from '../shared/loadState.js';
import type { LoadState } from '../shared/types.js';
import { PortfolioModeNote } from '../shared/PortfolioModeSwitch.js';
import { RefreshIconButton } from '../shared/RefreshIconButton.js';
import { usePageRefresh } from '../shared/usePageRefresh.js';
import { portfolioKeys } from '../portfolio/portfolio.queries.js';
import { strategyKeys } from '../strategy/strategy.queries.js';
import { useNavigationGuard } from '../shared/navigation-guard.js';
import { createRiskActionHandlers } from './risk.actions.js';
import {
  useCreateRiskRuleMutation,
  useDeleteRiskRuleMutation,
  usePatchRiskRuleMutation,
  useRestoreRiskRuleMutation,
  useScanRiskMutation,
  useTestRiskRuleMutation,
} from './risk.mutations.js';
import {
  riskKeys,
  useRiskNotificationRoutingQuery,
  useRiskAuditQuery,
  useRiskQueries,
} from './risk.queries.js';
import { RiskOverview } from './RiskOverview.js';
import { RiskRuleWorkbench } from './RiskRuleWorkbench.js';
import { StrategyRiskApplicationsSection } from './StrategyRiskApplicationsSection.js';
import { riskCenterApplicationPath } from '../strategy/strategy-risk-application.model.js';
import {
  NotificationProviderNotice,
  RiskAuditDialog,
  RiskNotificationTable,
} from './RiskSections.js';
import type {
  CreateRiskRuleInput,
  RiskRuleRecord,
  RiskTestRecord,
  RiskTestResult,
} from './risk.types.js';

type RiskTab = 'overview' | 'rules' | 'strategy-applications' | 'notifications';

export function RiskCenter(props: {
  accounts: Account[];
  portfolio: Portfolio | null;
  portfolioState: LoadState;
  mode: PortfolioMode;
}) {
  const control = useRiskCenter(props);
  const {
    tab,
    riskRefreshing,
    busyAction,
    refreshRisk,
    mode,
    loadState,
    confirmedRuleWrite,
    riskQueries,
    scanReadUnconfirmed,
    actions,
    selectTab,
    notificationAvailability,
    notificationRoutingState,
    navigate,
    portfolio,
    portfolioState,
    eventReadState,
    rulesReadState,
    notificationReadState,
    rules,
    events,
    deliveries,
    riskUpdatedAt,
    rulesReadOnly,
    selectCriticalEvents,
    accounts,
    testRecords,
    createRule,
    updateRule,
    toggleRule,
    saveTestRecord,
    openAudit,
    notificationStatusFilter,
    auditVisible,
    auditRule,
    auditAccountName,
    auditQuery,
    closeAudit,
  } = control;

  return (
    <section
      data-fill-height={tab === 'rules' ? '' : undefined}
      className="module-page lg:data-fill-height:flex lg:data-fill-height:grow lg:data-fill-height:flex-col"
    >
      <PageHeader
        className="mb-card"
        eyebrow="RISK CENTER"
        title="风险中心"
        actions={
          <>
            <RefreshIconButton
              label="刷新风险数据"
              refreshing={riskRefreshing}
              disabled={busyAction !== null}
              onClick={() => void refreshRisk()}
            />
          </>
        }
      />

      {mode === 'shadow' ? (
        <PortfolioModeNote>
          模拟组合用于研究和纸面跟踪：后台会与实际组合同批评估并记录事件，但不发送任何通知，也不代表实际资产风险。
        </PortfolioModeNote>
      ) : null}

      {/* 规则、事件、通知全部为空时，指标卡和表格的 0 值已表达状态，不再叠加“暂无数据”横幅。 */}
      {loadState === 'empty' ? null : (
        <DataStateBanner state={loadState} onRetry={() => void refreshRisk()} />
      )}
      {confirmedRuleWrite && riskQueries.rules.isError && (
        <Alert>
          <AlertTitle>规则更改已保存</AlertTitle>
          <AlertDescription>
            完整规则列表读取失败；无需再次提交，重新读取后再继续操作。
          </AlertDescription>
          <Button
            aria-busy={riskQueries.rules.isFetching}
            type="button"
            variant="outline"
            disabled={riskQueries.rules.isFetching}
            onClick={() => void riskQueries.rules.refetch()}
          >
            {riskQueries.rules.isFetching && (
              <Spinner data-icon="inline-start" aria-hidden="true" />
            )}
            重新读取规则
          </Button>
        </Alert>
      )}
      {scanReadUnconfirmed && (
        <Alert>
          <AlertTitle>风险扫描已完成</AlertTitle>
          <AlertDescription>
            风险历史读取失败，无需再次执行；重新读取后再继续扫描。
          </AlertDescription>
          <Button
            aria-busy={riskRefreshing}
            type="button"
            variant="outline"
            disabled={riskRefreshing}
            onClick={() => void actions.loadRisk()}
          >
            {riskRefreshing && <Spinner data-icon="inline-start" aria-hidden="true" />}
            重新读取风险历史
          </Button>
        </Alert>
      )}

      <Tabs className="lg:grow" value={tab} onValueChange={(value) => selectTab(value as RiskTab)}>
        <TabsList variant="line" className="w-full">
          <TabsTrigger value="overview">总览</TabsTrigger>
          <TabsTrigger value="rules">规则</TabsTrigger>
          <TabsTrigger value="strategy-applications">策略应用</TabsTrigger>
          <TabsTrigger value="notifications">通知</TabsTrigger>
        </TabsList>
        <NotificationProviderNotice
          mode={mode}
          availability={notificationAvailability}
          routingState={notificationRoutingState}
          onConfigure={() => void navigate('/providers')}
        />
        <TabsContent value="overview">
          <RiskOverview
            eventsRefreshing={riskQueries.events.isRefetching}
            portfolioValueAt={portfolio?.valuedAt ?? null}
            portfolioState={portfolioState}
            loadState={eventReadState}
            rulesState={rulesReadState}
            notificationsState={notificationReadState}
            rules={rules}
            events={events}
            deliveries={deliveries}
            lastUpdatedAt={riskUpdatedAt}
            scanning={busyAction === 'scan-risk'}
            scanDisabled={rulesReadOnly || busyAction !== null || scanReadUnconfirmed}
            onScan={() => void actions.scanRisk()}
            onSelectTab={selectTab}
            onSelectCriticalEvents={selectCriticalEvents}
            onRetryEvents={() => void riskQueries.events.refetch()}
          />
        </TabsContent>
        <TabsContent value="rules" className="lg:grid">
          <RiskRuleWorkbench
            onEditApplication={(id) => void navigate(riskCenterApplicationPath(id))}
            refreshing={riskQueries.rules.isRefetching}
            rules={rules}
            accounts={accounts}
            positions={portfolio?.positions ?? []}
            loadState={loadState}
            busyAction={busyAction}
            readOnly={rulesReadOnly}
            testRecords={testRecords}
            onCreate={createRule}
            onUpdate={updateRule}
            onToggle={toggleRule}
            onArchive={actions.archiveRule}
            onRestore={actions.restoreRule}
            onTest={actions.testRule}
            onTestComplete={saveTestRecord}
            onAudit={openAudit}
          />
        </TabsContent>
        <TabsContent value="strategy-applications">
          <StrategyRiskApplicationsSection accounts={accounts} />
        </TabsContent>
        <TabsContent value="notifications">
          <RiskNotificationTable
            refreshing={riskQueries.notifications.isRefetching}
            loadState={notificationReadState}
            deliveries={deliveries}
            statusFilter={notificationStatusFilter}
            onClearStatusFilter={() => selectTab('notifications')}
            onRetry={() => void riskQueries.notifications.refetch()}
          />
        </TabsContent>
      </Tabs>

      <RiskAuditDialog
        open={auditVisible}
        rule={auditRule}
        {...(auditAccountName ? { accountName: auditAccountName } : {})}
        audit={auditQuery.data ?? []}
        pending={auditQuery.isPending || auditQuery.isFetching}
        error={auditQuery.isError}
        onRetry={() => void auditQuery.refetch()}
        onOpenChange={closeAudit}
      />
    </section>
  );
}

function useRiskCenter({
  accounts,
  portfolio,
  portfolioState,
  mode,
}: {
  accounts: Account[];
  portfolio: Portfolio | null;
  portfolioState: LoadState;
  mode: PortfolioMode;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab: RiskTab =
    requestedTab === 'rules' ||
    requestedTab === 'strategy-applications' ||
    requestedTab === 'notifications'
      ? requestedTab
      : 'overview';
  // 进 URL：从总览点「通知失败」跳进来时，刷新与后退都能还原同一份筛选。
  const notificationStatusFilter = searchParams.get('notifyStatus');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const failureToastRef = useRef<string | null>(null);
  useNavigationGuard({
    dirty: false,
    busy: busyAction !== null && !busyAction.startsWith('audit:'),
  });
  const [auditRule, setAuditRule] = useState<RiskRuleRecord | null>(null);
  const [auditVisible, setAuditVisible] = useState(false);
  const [testRecords, setTestRecords] = useState<Record<string, RiskTestRecord>>({});
  const navigate = useNavigate();
  const toastManager = useToastManager();
  const riskQueries = useRiskQueries(mode);
  const { refreshing: riskRefreshing, refresh: refreshRisk } = usePageRefresh([
    { queryKey: riskKeys.root },
    { queryKey: portfolioKeys.root },
    { queryKey: strategyKeys.root },
  ]);
  const notificationRoutingQuery = useRiskNotificationRoutingQuery();
  const auditQuery = useRiskAuditQuery(auditVisible ? (auditRule?.id ?? null) : null);
  const createRuleMutation = useCreateRiskRuleMutation();
  const patchRuleMutation = usePatchRiskRuleMutation();
  const deleteRuleMutation = useDeleteRiskRuleMutation();
  const restoreRuleMutation = useRestoreRiskRuleMutation();
  const testRuleMutation = useTestRiskRuleMutation();
  const scanRiskMutation = useScanRiskMutation();
  const {
    rules,
    rulesReadOnly,
    rulesReadState,
    confirmedRuleWrite,
    scanReadUnconfirmed,
    events,
    deliveries,
    eventReadState,
    notificationReadState,
    notificationRoutingState,
    notificationAvailability,
    loadState,
  } = riskCenterReadModels({
    riskQueries,
    notificationRoutingQuery,
    createRuleMutation,
    patchRuleMutation,
    deleteRuleMutation,
    restoreRuleMutation,
    scanRiskMutation,
  });
  const riskUpdatedAt = useMemo(() => {
    const timestamp = Math.max(
      riskQueries.rules.dataUpdatedAt,
      riskQueries.events.dataUpdatedAt,
      riskQueries.notifications.dataUpdatedAt,
    );
    return timestamp > 0 ? new Date(timestamp).toISOString() : null;
  }, [
    riskQueries.events.dataUpdatedAt,
    riskQueries.notifications.dataUpdatedAt,
    riskQueries.rules.dataUpdatedAt,
  ]);
  const actions = createRiskActionHandlers({
    portfolio,
    mode,
    busyAction,
    setBusyAction,
    toastManager,
    failureToastRef,
    createRuleMutation,
    patchRuleMutation,
    deleteRuleMutation,
    restoreRuleMutation,
    testRuleMutation,
    scanRiskMutation,
    notificationAvailability,
    refetchRules: riskQueries.rules.refetch,
    refetchEvents: riskQueries.events.refetch,
    refetchNotifications: riskQueries.notifications.refetch,
  });
  useEffect(() => {
    if (!auditVisible) {
      if (busyAction?.startsWith('audit:')) setBusyAction(null);
      return;
    }
    if (!auditRule || busyAction !== `audit:${auditRule.id}`) return;
    if (!auditQuery.isPending && !auditQuery.isFetching) setBusyAction(null);
  }, [auditQuery.isFetching, auditQuery.isPending, auditRule, auditVisible, busyAction]);

  const selectTab = (nextTab: RiskTab, filter?: string) => {
    const next = new URLSearchParams(searchParams);
    if (nextTab === 'overview') next.delete('tab');
    else next.set('tab', nextTab);
    if (nextTab !== 'strategy-applications') next.delete('applicationId');
    if (nextTab === 'notifications' && filter) next.set('notifyStatus', filter);
    else next.delete('notifyStatus');
    setSearchParams(next);
  };

  useEffect(() => {
    if (requestedTab !== 'events') return;
    const next = new URLSearchParams(searchParams);
    next.delete('tab');
    setSearchParams(next, { replace: true });
    window.requestAnimationFrame(() => document.getElementById('risk-events')?.scrollIntoView?.());
  }, [requestedTab, searchParams, setSearchParams]);

  const selectCriticalEvents = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('tab');
    next.set('eventSeverity', 'critical');
    next.delete('eventSearch');
    next.delete('eventPage');
    setSearchParams(next);
    window.requestAnimationFrame(() => document.getElementById('risk-events')?.scrollIntoView?.());
  };

  const { openAudit, closeAudit } = createRiskAuditActions({
    busyAction,
    setBusyAction,
    setAuditRule,
    setAuditVisible,
  });

  const auditAccountName = auditRule?.accountId
    ? accounts.find((account) => account.id === auditRule.accountId)?.name
    : undefined;

  const createRule = (input: CreateRiskRuleInput) => actions.createRule(input);
  const invalidateTestRecord = (ruleId: string) => {
    setTestRecords((current) => {
      if (!current[ruleId]) return current;
      const next = { ...current };
      delete next[ruleId];
      return next;
    });
  };
  const updateRule = async (ruleId: string, input: CreateRiskRuleInput) => {
    const updated = await actions.patchRule(ruleId, input);
    if (updated) invalidateTestRecord(ruleId);
    return updated;
  };
  const toggleRule = async (rule: RiskRuleRecord) => {
    if (rule.needsRepair && !rule.enabled) {
      toastManager.add({
        title: '规则待修复',
        description: '请先补齐账户和标的后再启用这条旧规则。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
      return false;
    }
    const updated = await actions.patchRule(rule.id, { enabled: !rule.enabled });
    if (updated) invalidateTestRecord(rule.id);
    return updated;
  };
  const saveTestRecord = (rule: RiskRuleRecord, results: RiskTestResult[]) => {
    setTestRecords((current) => ({
      ...current,
      [rule.id]: {
        ruleVersion: rule.version,
        results,
        testedAt: new Date().toISOString(),
      },
    }));
  };

  return {
    tab,
    riskRefreshing,
    busyAction,
    refreshRisk,
    mode,
    loadState,
    confirmedRuleWrite,
    riskQueries,
    scanReadUnconfirmed,
    actions,
    selectTab,
    notificationAvailability,
    notificationRoutingState,
    navigate,
    portfolio,
    portfolioState,
    eventReadState,
    rulesReadState,
    notificationReadState,
    rules,
    events,
    deliveries,
    riskUpdatedAt,
    rulesReadOnly,
    selectCriticalEvents,
    accounts,
    testRecords,
    createRule,
    updateRule,
    toggleRule,
    saveTestRecord,
    openAudit,
    notificationStatusFilter,
    auditVisible,
    auditRule,
    auditAccountName,
    auditQuery,
    closeAudit,
  };
}

function riskCenterReadModels({
  riskQueries,
  notificationRoutingQuery,
  createRuleMutation,
  patchRuleMutation,
  deleteRuleMutation,
  restoreRuleMutation,
  scanRiskMutation,
}: {
  riskQueries: ReturnType<typeof useRiskQueries>;
  notificationRoutingQuery: ReturnType<typeof useRiskNotificationRoutingQuery>;
  createRuleMutation: ReturnType<typeof useCreateRiskRuleMutation>;
  patchRuleMutation: ReturnType<typeof usePatchRiskRuleMutation>;
  deleteRuleMutation: ReturnType<typeof useDeleteRiskRuleMutation>;
  restoreRuleMutation: ReturnType<typeof useRestoreRiskRuleMutation>;
  scanRiskMutation: ReturnType<typeof useScanRiskMutation>;
}) {
  const rules = riskQueries.rules.data ?? [];
  const rulesReadOnly = riskQueries.rules.isError || riskQueries.rules.isPending;
  const rulesReadState = resolveLoadState(
    [riskQueries.rules],
    riskQueries.rules.data !== undefined,
    rules.length === 0,
  );
  const confirmedRuleWrite = [
    createRuleMutation,
    patchRuleMutation,
    deleteRuleMutation,
    restoreRuleMutation,
  ].some((mutation) => mutation.data !== undefined);
  const scanReadUnconfirmed =
    scanRiskMutation.data !== undefined &&
    (riskQueries.rules.isError || riskQueries.events.isError || riskQueries.notifications.isError);
  const events = riskQueries.events.data ?? [];
  const deliveries = riskQueries.notifications.data ?? [];
  const eventReadState = resolveLoadState(
    [riskQueries.events],
    riskQueries.events.data !== undefined,
    events.length === 0,
  );
  const notificationReadState = resolveLoadState(
    [riskQueries.notifications],
    riskQueries.notifications.data !== undefined,
    deliveries.length === 0,
  );
  let notificationRoutingState: 'loading' | 'ready' | 'error' = 'ready';
  if (notificationRoutingQuery.isError) notificationRoutingState = 'error';
  else if (notificationRoutingQuery.isPending) notificationRoutingState = 'loading';
  let notificationAvailability: 'available' | 'unconfigured' | 'unknown' = 'available';
  if (notificationRoutingState !== 'ready') notificationAvailability = 'unknown';
  else if ((notificationRoutingQuery.data?.availableRoutes.length ?? 0) === 0) {
    notificationAvailability = 'unconfigured';
  }
  const hasRiskData = Object.values(riskQueries).some((query) => query.data !== undefined);
  const loadState = resolveLoadState(
    Object.values(riskQueries),
    hasRiskData,
    hasRiskData && rules.length === 0 && events.length === 0 && deliveries.length === 0,
  );
  return {
    rules,
    rulesReadOnly,
    rulesReadState,
    confirmedRuleWrite,
    scanReadUnconfirmed,
    events,
    deliveries,
    eventReadState,
    notificationReadState,
    notificationRoutingState,
    notificationAvailability,
    loadState,
  };
}

function createRiskAuditActions({
  busyAction,
  setBusyAction,
  setAuditRule,
  setAuditVisible,
}: {
  busyAction: string | null;
  setBusyAction: (value: string | null) => void;
  setAuditRule: (value: RiskRuleRecord | null) => void;
  setAuditVisible: (value: boolean) => void;
}) {
  const openAudit = (rule: RiskRuleRecord) => {
    if (busyAction) return;
    setBusyAction(`audit:${rule.id}`);
    setAuditRule(rule);
    setAuditVisible(true);
  };

  const closeAudit = (open: boolean) => {
    setAuditVisible(open);
    if (!open) {
      setAuditRule(null);
      if (busyAction?.startsWith('audit:')) setBusyAction(null);
    }
  };
  return { openAudit, closeAudit };
}
