import type { Dispatch, SetStateAction } from 'react';
import type { useToastManager } from '@/components/ui/toast';

import type { Portfolio } from '../portfolio/portfolio.types.js';
import type {
  CreateRiskRuleInput,
  PortfolioMode,
  RiskContext,
  RiskRuleRecord,
  RiskTestResult,
  UpdateRiskRuleInput,
} from './risk.types.js';

type ToastManager = Pick<ReturnType<typeof useToastManager>, 'add'>;
type AsyncMutation<Input, Output> = {
  mutateAsync: (input: Input) => Promise<Output>;
};

export const buildRiskContexts = (
  portfolio: Portfolio | null,
  mode: PortfolioMode,
): RiskContext[] => {
  if (!portfolio) return [];
  return portfolio.positions.map((position) => ({
    symbol: position.symbol,
    accountId: position.accountId,
    mode,
    costPrice: position.costPrice,
    ...(position.marketValue === null || position.quantity <= 0
      ? {}
      : { price: position.marketValue / position.quantity }),
    ...(portfolio.totalMarketValue > 0 && position.marketValue !== null
      ? { weight: position.marketValue / portfolio.totalMarketValue }
      : {}),
    marketTime: portfolio.valuedAt,
    dataQuality: {
      portfolio: portfolio.partial ? 'partial' : 'fresh',
    },
  }));
};

type Dependencies = {
  portfolio: Portfolio | null;
  mode: PortfolioMode;
  busyAction: string | null;
  setBusyAction: Dispatch<SetStateAction<string | null>>;
  toastManager: ToastManager;
  createRuleMutation: AsyncMutation<CreateRiskRuleInput, RiskRuleRecord>;
  patchRuleMutation: AsyncMutation<{ ruleId: string; patch: UpdateRiskRuleInput }, RiskRuleRecord>;
  deleteRuleMutation: AsyncMutation<{ ruleId: string }, RiskRuleRecord>;
  testRuleMutation: AsyncMutation<{ ruleId: string; contexts: RiskContext[] }, RiskTestResult[]>;
  scanRiskMutation: AsyncMutation<RiskContext[], unknown>;
  refetchRules: () => Promise<unknown>;
  refetchEvents: () => Promise<unknown>;
  refetchNotifications: () => Promise<unknown>;
};

const successToast = (toastManager: ToastManager, title: string, description: string) =>
  toastManager.add({ title, description, type: 'success', timeout: 2800 });

const errorToast = (toastManager: ToastManager, title: string, description: string) =>
  toastManager.add({ title, description, type: 'error', timeout: 0, priority: 'high' });

export const createRiskActionHandlers = (dependencies: Dependencies) => {
  const {
    portfolio,
    mode,
    busyAction,
    setBusyAction,
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

  const createRule = async (input: CreateRiskRuleInput) => {
    if (busyAction) return false;
    setBusyAction('create-rule');
    try {
      await createRuleMutation.mutateAsync(input);
      successToast(toastManager, '规则已创建', '已记录审计。');
      await refetchRules();
      return true;
    } catch {
      errorToast(toastManager, '规则创建失败', '请检查规则目标和阈值。');
      return false;
    } finally {
      setBusyAction(null);
    }
  };

  const patchRule = async (ruleId: string, patch: UpdateRiskRuleInput) => {
    if (busyAction) return false;
    setBusyAction(`patch:${ruleId}`);
    try {
      await patchRuleMutation.mutateAsync({ ruleId, patch });
      successToast(toastManager, '规则已更新', '已生成新版本并记录审计。');
      return true;
    } catch {
      errorToast(toastManager, '规则更新失败', '请稍后重试。');
      return false;
    } finally {
      setBusyAction(null);
    }
  };

  const archiveRule = async (rule: RiskRuleRecord) => {
    if (busyAction) return false;
    setBusyAction(`archive:${rule.id}`);
    try {
      await deleteRuleMutation.mutateAsync({ ruleId: rule.id });
      successToast(toastManager, '规则已归档', '规则已停用，历史事件与审计记录保留。');
      return true;
    } catch {
      errorToast(toastManager, '规则归档失败', '请稍后重试。');
      return false;
    } finally {
      setBusyAction(null);
    }
  };

  const testRule = async (rule: RiskRuleRecord) => {
    if (busyAction) return null;
    setBusyAction(`test:${rule.id}`);
    try {
      const result = await testRuleMutation.mutateAsync({
        ruleId: rule.id,
        contexts: buildRiskContexts(portfolio, mode),
      });
      successToast(
        toastManager,
        '人工测试完成',
        `${result.filter((item) => item.triggered).length} 个上下文触发。`,
      );
      return result;
    } catch {
      errorToast(toastManager, '人工测试失败', '请确认当前组合有可用数据。');
      return null;
    } finally {
      setBusyAction(null);
    }
  };

  const scanRisk = async () => {
    if (busyAction) return false;
    setBusyAction('scan-risk');
    try {
      await scanRiskMutation.mutateAsync(buildRiskContexts(portfolio, mode));
      successToast(toastManager, '风险扫描已完成', '触发事件已写入历史。');
      await loadRisk();
      return true;
    } catch {
      errorToast(toastManager, '风险扫描失败', '请确认当前组合有可用数据。');
      return false;
    } finally {
      setBusyAction(null);
    }
  };

  return { loadRisk, createRule, patchRule, archiveRule, testRule, scanRisk };
};
