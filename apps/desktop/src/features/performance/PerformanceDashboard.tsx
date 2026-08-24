import { useEffect, useMemo, useState } from 'react';
import { useToastManager } from '@/components/ui/toast';

import type { DesktopNavigationView } from '../../views.js';
import type { Account } from '../portfolio/portfolio.types.js';
import { DataStateBanner } from '../shared/DesktopPrimitives.js';
import { resolveLoadState } from '../shared/loadState.js';
import { PortfolioModeNote, PortfolioModeSwitch } from '../shared/PortfolioModeSwitch.js';
import { useSavePerformanceTargetsMutation } from './performance.mutations.js';
import { usePerformanceQueries } from './performance.queries.js';
import type { AllocationCategory, PortfolioMode } from './performance.types.js';
import {
  PerformanceAccountSelector,
  PerformanceAllocationSection,
  PerformanceMetrics,
  PerformanceSnapshotTable,
} from './PerformanceSections.js';

export function PerformanceDashboard({
  accounts,
  mode,
  onModeChange,
  onNavigate,
}: {
  accounts: Account[];
  mode: PortfolioMode;
  onModeChange: (mode: PortfolioMode) => void;
  onNavigate: (view: DesktopNavigationView) => void;
}) {
  const [accountId, setAccountId] = useState('');
  const [targetSaveError, setTargetSaveError] = useState<string | null>(null);
  const toastManager = useToastManager();
  const modeAccounts = useMemo(
    () => accounts.filter((account) => account.mode === mode && account.active !== false),
    [accounts, mode],
  );
  const mixedCurrencies = useMemo(
    () => new Set(modeAccounts.map((account) => account.currency)).size > 1,
    [modeAccounts],
  );
  const scopeEnabled = !mixedCurrencies || Boolean(accountId);
  const performanceQueries = usePerformanceQueries(mode, accountId, scopeEnabled);

  useEffect(() => {
    if (accountId && !modeAccounts.some((account) => account.id === accountId)) setAccountId('');
  }, [accountId, modeAccounts]);

  const snapshots = scopeEnabled ? (performanceQueries.history.data ?? []) : [];
  const summary =
    scopeEnabled && !performanceQueries.summary.isError
      ? (performanceQueries.summary.data ?? null)
      : null;
  const layers = scopeEnabled ? performanceQueries.layers.data : undefined;
  const allocationResponse = scopeEnabled ? performanceQueries.allocation.data : undefined;
  const targetsUnavailable = scopeEnabled && performanceQueries.targets.isError;
  const targetsResponse =
    scopeEnabled && !targetsUnavailable ? performanceQueries.targets.data : undefined;
  const targets = targetsResponse?.targets ?? {};
  const latestSnapshot = snapshots.at(-1);
  const latest = [...snapshots].reverse().find((snapshot) => !snapshot.partial);
  const scopedTotal = accountId
    ? layers?.account.find((record) => record.accountId === accountId)
    : layers?.portfolio;
  const scopedSecurity =
    layers?.security.filter((position) => !accountId || position.accountId === accountId) ?? [];
  const currentValue = scopedTotal ? scopedTotal.marketValue + scopedTotal.cashValue : undefined;
  const currentValuePartial = scopedTotal?.partial ?? layers?.dataQuality.partial ?? false;
  const currentCost = scopedSecurity.reduce((sum, position) => sum + position.costValue, 0);
  const hasCompleteSecurity = scopedSecurity.every((position) => position.marketValue !== null);
  const currentPnl =
    scopedTotal && !scopedTotal.partial && hasCompleteSecurity
      ? scopedSecurity.reduce(
          (sum, position) => sum + (position.marketValue ?? 0) - position.costValue,
          0,
        )
      : null;
  const currentPnlRate = currentPnl !== null && currentCost > 0 ? currentPnl / currentCost : null;
  const scopeHasData = [
    performanceQueries.history,
    performanceQueries.summary,
    performanceQueries.layers,
    performanceQueries.targets,
  ].some((query) => query.data !== undefined);
  const scopeWideError =
    !scopeHasData &&
    [
      performanceQueries.history,
      performanceQueries.summary,
      performanceQueries.layers,
      performanceQueries.targets,
    ].every((query) => query.isError);
  const historyState = resolveLoadState(
    [performanceQueries.history],
    performanceQueries.history.data !== undefined,
    performanceQueries.history.data !== undefined && snapshots.length === 0,
  );
  const allocationState = resolveLoadState(
    [performanceQueries.layers, performanceQueries.targets, performanceQueries.allocation],
    allocationResponse !== undefined,
    allocationResponse !== undefined && allocationResponse.allocation.length === 0,
  );
  const refreshing = [
    performanceQueries.history,
    performanceQueries.summary,
    performanceQueries.layers,
    performanceQueries.targets,
    performanceQueries.allocation,
  ].some((query) => query.isFetching);
  const saveTargetsMutation = useSavePerformanceTargetsMutation();

  const retry = () => {
    void Promise.all([
      performanceQueries.history.refetch(),
      performanceQueries.summary.refetch(),
      performanceQueries.layers.refetch(),
      performanceQueries.targets.refetch(),
    ]);
  };
  const retryAllocation = () => {
    void Promise.all([
      performanceQueries.layers.refetch(),
      performanceQueries.targets.refetch(),
      performanceQueries.allocation.refetch(),
    ]);
  };

  const saveTargets = async (nextTargets: Record<AllocationCategory, number>) => {
    setTargetSaveError(null);
    try {
      await saveTargetsMutation.mutateAsync({
        scope: accountId ? 'account' : 'portfolio',
        ...(accountId ? { accountId } : {}),
        targets: nextTargets,
      });
      toastManager.add({
        title: '目标配置已保存',
        description: '已生成新版本，配置比较会自动更新。',
        type: 'success',
        timeout: 2800,
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : '目标保存失败，请稍后重试。';
      setTargetSaveError(message);
      return false;
    }
  };

  return (
    <section className="module-page">
      <header className="mb-7 flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="kicker text-[10px]">Performance</p>
          <h1>收益分析</h1>
          <p className="m-0 mt-2 max-w-3xl text-sm text-muted-foreground">
            基于 Portfolio Snapshot 计算历史收益，不触发自动交易。
          </p>
        </div>
        <PortfolioModeSwitch
          mode={mode}
          onModeChange={onModeChange}
          ariaLabel="收益范围"
          className="shrink-0 pt-1"
        />
      </header>
      {mode === 'shadow' ? (
        <PortfolioModeNote>当前收益只计算模拟账户，结果仅用于研究。</PortfolioModeNote>
      ) : null}
      <PerformanceAccountSelector
        accounts={accounts}
        mode={mode}
        accountId={accountId}
        mixedCurrencies={mixedCurrencies}
        latestSnapshotAt={latest?.capturedAt}
        valuedAt={layers?.valuedAt}
        onAccountChange={setAccountId}
      />
      {mixedCurrencies && !accountId ? (
        <DataStateBanner
          state="error"
          description="当前模式包含多个币种，已暂停全部账户聚合。请选择一个账户后继续。"
        />
      ) : null}
      {!mixedCurrencies && scopeWideError ? (
        <DataStateBanner state="error" onRetry={retry} />
      ) : null}
      <PerformanceMetrics
        latest={latest}
        summary={summary}
        snapshotCount={snapshots.length}
        latestPartial={latestSnapshot?.partial === true}
        currentValue={currentValue}
        currentValuePartial={currentValuePartial}
        currentPnl={currentPnl}
        currentPnlRate={currentPnlRate}
        summaryError={
          performanceQueries.summary.isError
            ? '收益摘要暂不可用，请检查行情完整性后重试'
            : undefined
        }
      />
      <PerformanceSnapshotTable
        loadState={historyState}
        snapshots={snapshots}
        refreshing={refreshing}
        onRetry={() => void performanceQueries.history.refetch()}
        onCompleteDataSetup={() => onNavigate('providers')}
      />
      <PerformanceAllocationSection
        loadState={allocationState}
        allocationRows={allocationResponse?.allocation ?? []}
        rebalanceRows={allocationResponse?.rebalance ?? []}
        targets={targets}
        dataQuality={
          allocationResponse?.partial
            ? {
                partial: true,
                missingSymbols: allocationResponse.missingSymbols,
              }
            : performanceQueries.quality
        }
        targetsUnavailable={targetsUnavailable}
        valuedAt={layers?.valuedAt}
        targetVersion={targetsResponse?.version}
        targetCreatedAt={targetsResponse?.createdAt}
        targetSaving={saveTargetsMutation.isPending}
        targetSaveError={targetSaveError}
        editDisabled={!scopeEnabled || targetsUnavailable || performanceQueries.targets.isPending}
        onRetry={retryAllocation}
        onSaveTargets={saveTargets}
      />
    </section>
  );
}
