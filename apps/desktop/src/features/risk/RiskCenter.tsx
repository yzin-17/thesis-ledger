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
import { useNotificationRoutingQuery, useRiskAuditQuery, useRiskQueries } from './risk.queries.js';
import { RiskOverview } from './RiskOverview.js';
import { RiskRuleWorkbench } from './RiskRuleWorkbench.js';
import { StrategyRiskApplicationsSection } from './StrategyRiskApplicationsSection.js';
import {
  NotificationProviderNotice,
  RiskAuditDialog,
  RiskEventTable,
  RiskNotificationTable,
} from './RiskSections.js';
import type {
  CreateRiskRuleInput,
  RiskRuleRecord,
  RiskTestRecord,
  RiskTestResult,
} from './risk.types.js';

type RiskTab = 'overview' | 'rules' | 'strategy-applications' | 'events' | 'notifications';

export function RiskCenter({
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
  const initialTab: RiskTab =
    requestedTab === 'rules' ||
    requestedTab === 'strategy-applications' ||
    requestedTab === 'events' ||
    requestedTab === 'notifications'
      ? requestedTab
      : 'overview';
  const [tab, setTab] = useState<RiskTab>(initialTab);
  const [eventSeverityFilter, setEventSeverityFilter] = useState<string | null>(null);
  const [notificationStatusFilter, setNotificationStatusFilter] = useState<string | null>(null);
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
  const notificationRoutingQuery = useNotificationRoutingQuery();
  const auditQuery = useRiskAuditQuery(auditVisible ? (auditRule?.id ?? null) : null);
  const createRuleMutation = useCreateRiskRuleMutation();
  const patchRuleMutation = usePatchRiskRuleMutation();
  const deleteRuleMutation = useDeleteRiskRuleMutation();
  const restoreRuleMutation = useRestoreRiskRuleMutation();
  const testRuleMutation = useTestRiskRuleMutation();
  const scanRiskMutation = useScanRiskMutation();
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
  else if ((notificationRoutingQuery.data?.routes.length ?? 0) === 0) {
    notificationAvailability = 'unconfigured';
  }
  const hasRiskData = Object.values(riskQueries).some((query) => query.data !== undefined);
  const riskRefreshing = Object.values(riskQueries).some((query) => query.isFetching);
  const loadState = resolveLoadState(
    Object.values(riskQueries),
    hasRiskData,
    hasRiskData && rules.length === 0 && events.length === 0 && deliveries.length === 0,
  );
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
  const refreshRisk = async () => {
    await Promise.all([actions.loadRisk(), notificationRoutingQuery.refetch()]);
  };

  useEffect(() => {
    if (!auditVisible) {
      if (busyAction?.startsWith('audit:')) setBusyAction(null);
      return;
    }
    if (!auditRule || busyAction !== `audit:${auditRule.id}`) return;
    if (!auditQuery.isPending && !auditQuery.isFetching) setBusyAction(null);
  }, [auditQuery.isFetching, auditQuery.isPending, auditRule, auditVisible, busyAction]);

  const selectTab = (nextTab: RiskTab, filter?: string) => {
    setTab(nextTab);
    const next = new URLSearchParams(searchParams);
    if (nextTab === 'overview') next.delete('tab');
    else next.set('tab', nextTab);
    if (nextTab !== 'strategy-applications') next.delete('applicationId');
    setSearchParams(next, { replace: true });
    if (nextTab === 'events') {
      setEventSeverityFilter(filter ?? null);
      setNotificationStatusFilter(null);
    } else if (nextTab === 'notifications') {
      setNotificationStatusFilter(filter ?? null);
      setEventSeverityFilter(null);
    } else {
      setEventSeverityFilter(null);
      setNotificationStatusFilter(null);
    }
  };

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

  return (
    <section className="module-page">
      <PageHeader
        eyebrow="RISK CENTER"
        title="风险中心"
        description="设置监控规则，查看风险事件与通知记录。"
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

      <NotificationProviderNotice
        mode={mode}
        availability={notificationAvailability}
        routingState={notificationRoutingState}
        onConfigure={() => void navigate('/providers')}
      />

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
            type="button"
            variant="outline"
            disabled={riskQueries.rules.isFetching}
            onClick={() => void riskQueries.rules.refetch()}
          >
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
            type="button"
            variant="outline"
            disabled={riskRefreshing}
            onClick={() => void actions.loadRisk()}
          >
            重新读取风险历史
          </Button>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={(value) => selectTab(value as RiskTab)}>
        <TabsList variant="line" className="mb-4 w-full">
          <TabsTrigger value="overview">总览</TabsTrigger>
          <TabsTrigger value="rules">规则</TabsTrigger>
          <TabsTrigger value="strategy-applications">策略应用</TabsTrigger>
          <TabsTrigger value="events">事件</TabsTrigger>
          <TabsTrigger value="notifications">通知</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <RiskOverview
            mode={mode}
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
            onRetryEvents={() => void riskQueries.events.refetch()}
          />
        </TabsContent>
        <TabsContent value="rules">
          <RiskRuleWorkbench
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
        <TabsContent value="events">
          <RiskEventTable
            loadState={eventReadState}
            events={events}
            severityFilter={eventSeverityFilter}
            onRetry={() => void riskQueries.events.refetch()}
          />
        </TabsContent>
        <TabsContent value="notifications">
          <RiskNotificationTable
            loadState={notificationReadState}
            deliveries={deliveries}
            statusFilter={notificationStatusFilter}
            routes={notificationRoutingQuery.data?.routes ?? []}
            routingState={notificationRoutingState}
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
