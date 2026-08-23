import type { Dispatch, FormEvent, SetStateAction } from 'react';
import type { useToastManager } from '@/components/ui/toast';

import type { Account, Portfolio } from '../portfolio/portfolio.types.js';
import { formText } from '../shared/display.js';
import type {
  CreateRiskRuleInput,
  PortfolioMode,
  RiskContext,
  RiskRuleRecord,
} from './risk.types.js';

type ToastManager = Pick<ReturnType<typeof useToastManager>, 'add'>;
type AsyncMutation<Input, Output> = {
  mutateAsync: (input: Input) => Promise<Output>;
};

const buildRiskContexts = (portfolio: Portfolio | null, mode: PortfolioMode): RiskContext[] =>
  (portfolio?.positions ?? []).map((position) => ({
    symbol: position.symbol,
    accountId: position.accountId,
    mode,
    costPrice: position.costPrice,
    ...(position.marketValue === null || position.quantity <= 0
      ? {}
      : { price: position.marketValue / position.quantity }),
    ...(portfolio && portfolio.totalMarketValue > 0 && position.marketValue !== null
      ? { weight: position.marketValue / portfolio.totalMarketValue }
      : {}),
    marketTime: portfolio?.valuedAt ?? new Date().toISOString(),
    dataQuality: {
      portfolio: portfolio?.partial ? ('partial' as const) : ('fresh' as const),
    },
  }));

type Dependencies = {
  accounts: Account[];
  portfolio: Portfolio | null;
  mode: PortfolioMode;
  busyAction: string | null;
  setBusyAction: Dispatch<SetStateAction<string | null>>;
  setAuditRule: Dispatch<SetStateAction<RiskRuleRecord | null>>;
  setAuditVisible: Dispatch<SetStateAction<boolean>>;
  toastManager: ToastManager;
  createRuleMutation: AsyncMutation<CreateRiskRuleInput, RiskRuleRecord>;
  patchRuleMutation: AsyncMutation<{ ruleId: string; patch: object }, RiskRuleRecord>;
  deleteRuleMutation: AsyncMutation<{ ruleId: string }, RiskRuleRecord>;
  testRuleMutation: AsyncMutation<
    { ruleId: string; contexts: RiskContext[] },
    Array<{ triggered: boolean }>
  >;
  scanRiskMutation: AsyncMutation<RiskContext[], unknown>;
  refetchRules: () => Promise<unknown>;
  refetchEvents: () => Promise<unknown>;
  refetchNotifications: () => Promise<unknown>;
};

export const createRiskActionHandlers = (dependencies: Dependencies) => {
  const {
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
    refetchRules,
    refetchEvents,
    refetchNotifications,
  } = dependencies;

  const loadRisk = async () => {
    await Promise.all([refetchRules(), refetchEvents(), refetchNotifications()]);
  };

  const createRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busyAction) return;
    setBusyAction('create-rule');
    try {
      const formElement = event.currentTarget;
      const form = new FormData(formElement);
      const scope = formText(form, 'scope') as CreateRiskRuleInput['scope'];
      await createRuleMutation.mutateAsync({
        kind: formText(form, 'kind'),
        scope,
        severity: formText(form, 'severity') as CreateRiskRuleInput['severity'],
        threshold: Number(formText(form, 'threshold')),
        enabled: true,
        ...(scope === 'security' ? { symbol: formText(form, 'symbol') } : {}),
        ...(scope === 'account' ? { accountId: formText(form, 'accountId') } : {}),
      });
      formElement.reset();
      toastManager.add({
        title: '规则已创建',
        description: '已记录审计。',
        type: 'success',
        timeout: 2800,
      });
      await refetchRules();
    } catch {
      toastManager.add({
        title: '规则创建失败',
        description: '请检查 scope 与目标。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const patchRule = async (rule: RiskRuleRecord) => {
    if (busyAction) return;
    setBusyAction(`patch:${rule.id}`);
    try {
      await patchRuleMutation.mutateAsync({ ruleId: rule.id, patch: { enabled: !rule.enabled } });
      toastManager.add({
        title: '规则已更新',
        description: '已生成新版本。',
        type: 'success',
        timeout: 2800,
      });
    } catch {
      toastManager.add({
        title: '规则更新失败',
        description: '请稍后重试。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const deleteRule = async (rule: RiskRuleRecord) => {
    if (busyAction) return;
    if (
      !window.confirm(
        `确认删除风险规则“${rule.kind}”？删除后规则会停用，历史事件与审计记录会保留。`,
      )
    )
      return;
    setBusyAction(`delete:${rule.id}`);
    try {
      await deleteRuleMutation.mutateAsync({ ruleId: rule.id });
      toastManager.add({
        title: '规则已删除',
        description: '规则已停用，历史事件与审计记录保留。',
        type: 'success',
        timeout: 2800,
      });
    } catch {
      toastManager.add({
        title: '规则删除失败',
        description: '请稍后重试。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const testRule = async (rule: RiskRuleRecord) => {
    if (busyAction) return;
    setBusyAction(`test:${rule.id}`);
    try {
      const result = await testRuleMutation.mutateAsync({
        ruleId: rule.id,
        contexts: buildRiskContexts(portfolio, mode),
      });
      toastManager.add({
        title: '人工测试完成',
        description: `${result.filter((item) => item.triggered).length} 个上下文触发。`,
        type: 'success',
        timeout: 2800,
      });
    } catch {
      toastManager.add({
        title: '人工测试失败',
        description: '请确认组合中有可用数据。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const scanRisk = async () => {
    if (busyAction) return;
    setBusyAction('scan-risk');
    try {
      await scanRiskMutation.mutateAsync(buildRiskContexts(portfolio, mode));
      toastManager.add({
        title: '风险扫描已完成',
        description: '触发事件已写入历史。',
        type: 'success',
        timeout: 2800,
      });
      await loadRisk();
    } catch {
      toastManager.add({
        title: '风险扫描失败',
        description: '请确认当前组合有可用数据。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const showAudit = (rule: RiskRuleRecord) => {
    if (busyAction) return;
    setBusyAction(`audit:${rule.id}`);
    setAuditRule(rule);
    setAuditVisible(true);
  };

  return { loadRisk, createRule, patchRule, deleteRule, testRule, scanRisk, showAudit };
};
