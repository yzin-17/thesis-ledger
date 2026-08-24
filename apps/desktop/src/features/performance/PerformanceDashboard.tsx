import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToastManager } from '@/components/ui/toast';

import type { Account } from '../portfolio/portfolio.types.js';
import { DataStateBanner } from '../shared/DesktopPrimitives.js';
import { resolveLoadState } from '../shared/loadState.js';
import { PortfolioModeNote } from '../shared/PortfolioModeSwitch.js';
import { useSavePerformanceTargetsMutation } from './performance.mutations.js';
import { usePerformanceQueries } from './performance.queries.js';
import type { AllocationCategory, PortfolioMode } from './performance.types.js';
import {
  PerformanceAccountSelector,
  PerformanceAllocationSection,
  PerformanceMetrics,
  PerformanceSnapshotTable,
  PerformanceTargetSheet,
} from './PerformanceSections.js';

export function PerformanceDashboard({
  accounts,
  mode,
  onModeChange,
}: {
  accounts: Account[];
  mode: PortfolioMode;
  onModeChange: (mode: PortfolioMode) => void;
}) {
  const [accountId, setAccountId] = useState('');
  const [targetSheetOpen, setTargetSheetOpen] = useState(false);
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
      setTargetSheetOpen(false);
      toastManager.add({
        title: '目标配置已保存',
        description: '已生成新版本，配置比较会自动更新。',
        type: 'success',
        timeout: 2800,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '目标保存失败，请稍后重试。';
      setTargetSaveError(message);
    }
  };

  return (
    <section className="module-page">
      <header className="page-header">
        <div>
          <p className="kicker">Performance</p>
          <h1>收益分析</h1>
          <p className="page-description">
            所有收益指标从 Ledger 与带数据质量标记的 Portfolio Snapshot
            计算；指标仅解释历史，不自动下单。
          </p>
        </div>
        <div className="page-header-actions">
          <Button
            type="button"
            variant="outline"
            disabled={!scopeEnabled || targetsUnavailable}
            onClick={() => {
              if (scopeEnabled && !targetsUnavailable) {
                setTargetSaveError(null);
                setTargetSheetOpen(true);
              }
            }}
          >
            调整目标
          </Button>
        </div>
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
        onModeChange={onModeChange}
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
        editDisabled={!scopeEnabled || targetsUnavailable}
        onRetry={retryAllocation}
        onEditTargets={() => {
          if (scopeEnabled && !targetsUnavailable) {
            setTargetSaveError(null);
            setTargetSheetOpen(true);
          }
        }}
      />
      <PerformanceTargetSheet
        open={targetSheetOpen}
        onOpenChange={setTargetSheetOpen}
        targets={targetsResponse?.targets}
        version={targetsResponse?.version}
        createdAt={targetsResponse?.createdAt}
        saving={saveTargetsMutation.isPending}
        error={targetSaveError}
        onSave={saveTargets}
      />
    </section>
  );
}
