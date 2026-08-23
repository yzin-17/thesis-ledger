import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToastManager } from '@/components/ui/toast';

import type { Account, Portfolio } from '../portfolio/portfolio.types.js';
import { DataStateBanner } from '../shared/DesktopPrimitives.js';
import { resolveLoadState } from '../shared/loadState.js';
import { createRiskActionHandlers } from './risk.actions.js';
import {
  useCreateRiskRuleMutation,
  useDeleteRiskRuleMutation,
  usePatchRiskRuleMutation,
  useScanRiskMutation,
  useTestRiskRuleMutation,
} from './risk.mutations.js';
import { useRiskAuditQuery, useRiskQueries } from './risk.queries.js';
import {
  RiskAuditDialog,
  RiskEventTable,
  RiskNotificationTable,
  RiskRuleForm,
  RiskRuleTable,
  RiskSummary,
} from './RiskSections.js';
import type { PortfolioMode, RiskRuleRecord } from './risk.types.js';

export function RiskCenter({
  accounts,
  portfolio,
}: {
  accounts: Account[];
  portfolio: Portfolio | null;
}) {
  const [mode, setMode] = useState<PortfolioMode>('actual');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [auditRule, setAuditRule] = useState<RiskRuleRecord | null>(null);
  const [auditVisible, setAuditVisible] = useState(false);
  const toastManager = useToastManager();
  const riskQueries = useRiskQueries(mode);
  const auditQuery = useRiskAuditQuery(auditVisible ? (auditRule?.id ?? null) : null);
  const createRuleMutation = useCreateRiskRuleMutation();
  const patchRuleMutation = usePatchRiskRuleMutation();
  const deleteRuleMutation = useDeleteRiskRuleMutation();
  const testRuleMutation = useTestRiskRuleMutation();
  const scanRiskMutation = useScanRiskMutation();
  const rules = riskQueries.rules.data ?? [];
  const events = riskQueries.events.data ?? [];
  const deliveries = riskQueries.notifications.data ?? [];
  const hasRiskData = Object.values(riskQueries).some((query) => query.data !== undefined);
  const loadState = resolveLoadState(
    Object.values(riskQueries),
    hasRiskData,
    hasRiskData && rules.length === 0 && events.length === 0 && deliveries.length === 0,
  );
  const actions = createRiskActionHandlers({
    accounts,
    portfolio,
    mode,
    busyAction,
    setBusyAction,
    setAuditRule,
    setAuditVisible,
    toastManager,
    createRuleMutation,
    patchRuleMutation,
    deleteRuleMutation,
    testRuleMutation,
    scanRiskMutation,
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
    if (!auditQuery.isFetching) setBusyAction(null);
  }, [auditQuery.isFetching, auditRule, auditVisible, busyAction]);

  useEffect(() => {
    if (!auditQuery.isError || !auditRule) return;
    setAuditVisible(false);
    setBusyAction(null);
    toastManager.add({
      title: '审计记录读取失败',
      description: '请稍后重试。',
      type: 'error',
      timeout: 0,
      priority: 'high',
    });
  }, [auditQuery.isError, auditRule, toastManager]);

  return (
    <section className="module-page">
      <p className="kicker">Risk Center</p>
      <h1>风险中心</h1>
      <p className="page-description">
        规则负责确定性判断；提醒仅用于辅助研究，不代表交易执行保证。事件保留规则版本、数据时间和触发上下文。
      </p>
      <div className="page-header-actions">
        <div className="portfolio-mode-tabs" role="tablist" aria-label="风险范围">
          {(['actual', 'shadow'] as const).map((nextMode) => (
            <Button
              key={nextMode}
              type="button"
              size="sm"
              variant={mode === nextMode ? 'default' : 'outline'}
              role="tab"
              aria-selected={mode === nextMode}
              onClick={() => setMode(nextMode)}
            >
              {nextMode === 'actual' ? '实际风险' : '影子风险'}
            </Button>
          ))}
        </div>
        <Button
          className="secondary"
          type="button"
          variant="outline"
          onClick={() => void actions.loadRisk()}
        >
          刷新风险数据
        </Button>
      </div>
      {mode === 'shadow' && (
        <p className="mode-note">当前只显示影子风险事件，通知默认不代表实际资产风险。</p>
      )}
      <RiskSummary rules={rules} events={events} deliveries={deliveries} />
      <RiskRuleForm
        accounts={accounts}
        busyAction={busyAction}
        onSubmit={(event) => void actions.createRule(event)}
        onScan={() => void actions.scanRisk()}
      />
      <DataStateBanner state={loadState} onRetry={() => void actions.loadRisk()} />
      <RiskRuleTable
        loadState={loadState}
        rules={rules}
        busyAction={busyAction}
        onPatch={(rule) => void actions.patchRule(rule)}
        onTest={(rule) => void actions.testRule(rule)}
        onAudit={actions.showAudit}
        onDelete={(rule) => void actions.deleteRule(rule)}
      />
      <RiskAuditDialog
        open={auditVisible}
        rule={auditRule}
        audit={auditQuery.data ?? []}
        pending={auditQuery.isPending || auditQuery.isFetching}
        error={auditQuery.isError}
        onOpenChange={setAuditVisible}
      />
      <RiskEventTable loadState={loadState} events={events} />
      <RiskNotificationTable loadState={loadState} deliveries={deliveries} />
    </section>
  );
}
