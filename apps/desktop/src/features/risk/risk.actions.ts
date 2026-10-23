import type { Dispatch, SetStateAction } from 'react';
import { requestFailureMessage } from '../../shared/api/request-error.js';
import type { useToastManager } from '@/components/ui/toast';

import type { Portfolio } from '../portfolio/portfolio.types.js';
import type {
  CreateRiskRuleInput,
  NotificationAvailability,
  PortfolioMode,
  RiskContext,
  RiskRuleRecord,
  RiskScanResult,
  RiskTestResult,
  UpdateRiskRuleInput,
} from './risk.types.js';

type ToastManager = Pick<ReturnType<typeof useToastManager>, 'add' | 'close'>;
type AsyncMutation<Input, Output> = {
  mutateAsync: (input: Input) => Promise<Output>;
};

export const buildRiskContexts = (
  portfolio: Portfolio | null,
  mode: PortfolioMode,
): RiskContext[] => {
  if (!portfolio) return [];
  const accountValues = portfolio.positions.reduce((totals, position) => {
    if (position.marketValue === null || position.quantity <= 0) return totals;
    totals.set(position.accountId, (totals.get(position.accountId) ?? 0) + position.marketValue);
    return totals;
  }, new Map<string, number>());
  return portfolio.positions.map((position) => ({
    symbol: position.symbol,
    accountId: position.accountId,
    positionId: position.id,
    mode,
    costPrice: position.costPrice,
    quantity: position.quantity,
    ...(position.marketValue === null || position.quantity <= 0
      ? {}
      : { price: position.marketValue / position.quantity }),
    ...(position.updatedAt === undefined ? {} : { positionUpdatedAt: position.updatedAt }),
    ...(portfolio.totalMarketValue > 0 && position.marketValue !== null
      ? { weight: position.marketValue / portfolio.totalMarketValue }
      : {}),
    ...(position.marketValue !== null && (accountValues.get(position.accountId) ?? 0) > 0
      ? { accountWeight: position.marketValue / accountValues.get(position.accountId)! }
      : {}),
    marketTime: portfolio.valuedAt,
    dataQuality: {
      portfolio: portfolio.partial ? 'partial' : 'fresh',
      ...(position.stale ? { marketData: 'stale' as const } : {}),
    },
  }));
};

type Dependencies = {
  portfolio: Portfolio | null;
  mode: PortfolioMode;
  busyAction: string | null;
  setBusyAction: Dispatch<SetStateAction<string | null>>;
  toastManager: ToastManager;
  failureToastRef: { current: string | null };
  createRuleMutation: AsyncMutation<CreateRiskRuleInput, RiskRuleRecord>;
  patchRuleMutation: AsyncMutation<{ ruleId: string; patch: UpdateRiskRuleInput }, RiskRuleRecord>;
  deleteRuleMutation: AsyncMutation<{ ruleId: string }, RiskRuleRecord>;
  restoreRuleMutation: AsyncMutation<{ ruleId: string }, RiskRuleRecord>;
  testRuleMutation: AsyncMutation<{ ruleId: string; contexts: RiskContext[] }, RiskTestResult[]>;
  scanRiskMutation: AsyncMutation<{ contexts: RiskContext[]; scanId: string }, RiskScanResult>;
  notificationAvailability: NotificationAvailability;
  refetchRules: () => Promise<unknown>;
  refetchEvents: () => Promise<unknown>;
  refetchNotifications: () => Promise<unknown>;
};

const successToast = (toastManager: ToastManager, title: string, description: string) =>
  toastManager.add({ title, description, type: 'success', timeout: 2800 });

const errorToast = (toastManager: ToastManager, title: string, description: string) =>
  toastManager.add({ title, description, type: 'error', timeout: 0, priority: 'high' });

export const riskActionFeedback = (
  action: 'test' | 'scan',
  mode: PortfolioMode,
  notificationAvailability: NotificationAvailability,
  triggeredCount: number,
) => {
  if (action === 'test') {
    const providerNote =
      notificationAvailability === 'unconfigured' ? ' 当前未配置通知提供方。' : '';
    return {
      type: notificationAvailability === 'unconfigured' ? ('warning' as const) : ('info' as const),
      description: `${triggeredCount} 个上下文触发。人工测试只验证规则，不发送通知。${providerNote}`,
    };
  }

  if (triggeredCount === 0) {
    return {
      type: 'success' as const,
      description: '本次扫描未产生新的风险事件，因此没有通知需要发送。',
    };
  }
  const eventSummary = `${triggeredCount} 个风险事件已写入历史。`;
  if (mode === 'shadow') {
    return { type: 'info' as const, description: `${eventSummary} 模拟模式不会发送通知。` };
  }
  if (notificationAvailability === 'unconfigured') {
    return {
      type: 'warning' as const,
      description: `${eventSummary} 当前未配置通知提供方，本次未发送通知。`,
    };
  }
  if (notificationAvailability === 'unknown') {
    return {
      type: 'warning' as const,
      description: `${eventSummary} 暂时无法确认通知提供方状态，请在“通知”页签核对。`,
    };
  }
  return {
    type: 'success' as const,
    description: `${eventSummary} 通知已按当前提供方配置处理，结果可在“通知”页签查看。`,
  };
};

export const createRiskActionHandlers = (dependencies: Dependencies) => {
  const {
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
    refetchRules,
    refetchEvents,
    refetchNotifications,
  } = dependencies;

  let inFlight = false;
  const claimAction = (action: string) => {
    if (busyAction || inFlight) return false;
    inFlight = true;
    if (failureToastRef.current) toastManager.close(failureToastRef.current);
    failureToastRef.current = null;
    setBusyAction(action);
    return true;
  };
  const releaseAction = () => {
    inFlight = false;
    setBusyAction(null);
  };
  const notifyFailure = (title: string, description: string) => {
    failureToastRef.current = errorToast(toastManager, title, description);
  };

  const loadRisk = async () => {
    await Promise.all([refetchRules(), refetchEvents(), refetchNotifications()]);
  };

  const createRule = async (input: CreateRiskRuleInput) => {
    if (!claimAction('create-rule')) return false;
    try {
      await createRuleMutation.mutateAsync(input);
      successToast(toastManager, '规则已创建', '已记录审计。');
      return true;
    } catch (error) {
      notifyFailure('规则创建失败', requestFailureMessage(error));
      return false;
    } finally {
      releaseAction();
    }
  };

  const patchRule = async (ruleId: string, patch: UpdateRiskRuleInput) => {
    if (!claimAction(`patch:${ruleId}`)) return false;
    try {
      await patchRuleMutation.mutateAsync({ ruleId, patch });
      successToast(toastManager, '规则已更新', '已生成新版本并记录审计。');
      return true;
    } catch (error) {
      notifyFailure('规则更新失败', requestFailureMessage(error));
      return false;
    } finally {
      releaseAction();
    }
  };

  const archiveRule = async (rule: RiskRuleRecord) => {
    if (!claimAction(`archive:${rule.id}`)) return false;
    try {
      await deleteRuleMutation.mutateAsync({ ruleId: rule.id });
      successToast(
        toastManager,
        '规则已归档',
        '规则已移出列表，历史事件与审计记录保留；可在“显示已归档”中恢复。',
      );
      return true;
    } catch (error) {
      notifyFailure('规则归档失败', requestFailureMessage(error));
      return false;
    } finally {
      releaseAction();
    }
  };

  const restoreRule = async (rule: RiskRuleRecord) => {
    if (!claimAction(`restore:${rule.id}`)) return false;
    try {
      await restoreRuleMutation.mutateAsync({ ruleId: rule.id });
      successToast(toastManager, '规则已恢复', '规则已回到列表并保持停用，确认无误后可手动启用。');
      return true;
    } catch (error) {
      notifyFailure('规则恢复失败', requestFailureMessage(error));
      return false;
    } finally {
      releaseAction();
    }
  };

  const testRule = async (rule: RiskRuleRecord) => {
    if (busyAction) return null;
    if (rule.needsRepair) {
      notifyFailure('规则待修复', '请先补齐账户和标的后再进行测试。');
      return null;
    }
    if (!claimAction(`test:${rule.id}`)) return null;
    try {
      const result = await testRuleMutation.mutateAsync({
        ruleId: rule.id,
        contexts: buildRiskContexts(portfolio, mode),
      });
      const feedback = riskActionFeedback(
        'test',
        mode,
        notificationAvailability,
        result.filter((item) => item.triggered).length,
      );
      toastManager.add({ title: '人工测试完成', ...feedback, timeout: 7000 });
      return result;
    } catch (error) {
      notifyFailure('人工测试失败', requestFailureMessage(error));
      return null;
    } finally {
      releaseAction();
    }
  };

  const scanRisk = async () => {
    if (!claimAction('scan-risk')) return false;
    try {
      const result = await scanRiskMutation.mutateAsync({
        contexts: buildRiskContexts(portfolio, mode),
        scanId: crypto.randomUUID(),
      });
      const feedback = riskActionFeedback(
        'scan',
        mode,
        notificationAvailability,
        result.results.filter((item) => item.eventId).length,
      );
      toastManager.add({ title: '风险扫描已完成', ...feedback, timeout: 7000 });
      return true;
    } catch (error) {
      notifyFailure('风险扫描失败', requestFailureMessage(error));
      return false;
    } finally {
      releaseAction();
    }
  };

  return { loadRisk, createRule, patchRule, archiveRule, restoreRule, testRule, scanRisk };
};
