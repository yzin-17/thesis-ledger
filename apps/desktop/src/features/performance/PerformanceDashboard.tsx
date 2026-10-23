import { PageHeader } from '../shared/PageHeader.js';
import { requestFailureMessage } from '../../shared/api/request-error.js';
import { useEffect, useMemo, useState } from 'react';
import { useToastManager } from '@/components/ui/toast';

import type { DesktopNavigationView } from '../../views.js';
import type { Account } from '../portfolio/portfolio.types.js';
import { DataStateBanner } from '../shared/DesktopPrimitives.js';
import { resolveLoadState } from '../shared/loadState.js';
import { PortfolioModeNote } from '../shared/PortfolioModeSwitch.js';
import { useSavePerformanceTargetsMutation } from './performance.mutations.js';
import { usePerformanceQueries } from './performance.queries.js';
import type {
  AllocationCategory,
  Currency,
  PerformanceSeriesInterval,
  PerformanceSeriesRange,
  PortfolioMode,
} from './performance.types.js';
import {
  PerformanceAccountSelector,
  PerformanceAllocationSection,
  PerformanceMetrics,
  PerformanceSnapshotTable,
} from './PerformanceSections.js';

export function PerformanceDashboard({
  accounts,
  mode,
  onNavigate,
}: {
  accounts: Account[];
  mode: PortfolioMode;
  onNavigate: (view: DesktopNavigationView) => void;
}) {
  const [accountId, setAccountId] = useState('');
  const [fxMerge, setFxMerge] = useState(false);
  const [baseCurrency, setBaseCurrency] = useState<Currency>('CNY');
  const [seriesRange, setSeriesRange] = useState<PerformanceSeriesRange>('1Y');
  const [seriesInterval, setSeriesInterval] = useState<PerformanceSeriesInterval>('1d');
  const [targetSaveError, setTargetSaveError] = useState<string | null>(null);
  const toastManager = useToastManager();
  const modeAccounts = useMemo(
    () => accounts.filter((account) => account.mode === mode && account.active !== false),
    [accounts, mode],
  );
  const effectiveAccountId = modeAccounts.some((account) => account.id === accountId)
    ? accountId
    : '';
  const mixedCurrencies = useMemo(
    () => new Set(modeAccounts.map((account) => account.currency)).size > 1,
    [modeAccounts],
  );
  const canMergeFx = mixedCurrencies && !effectiveAccountId;
  const effectiveFxMerge = canMergeFx && fxMerge;
  const queryOptions = { fxMerge: effectiveFxMerge, baseCurrency };
  const performanceQueries = usePerformanceQueries(
    mode,
    effectiveAccountId,
    true,
    queryOptions,
    seriesRange,
    seriesInterval,
  );

  useEffect(() => {
    if (accountId && !modeAccounts.some((account) => account.id === accountId)) setAccountId('');
  }, [accountId, modeAccounts]);

  useEffect(() => {
    setFxMerge(false);
    setBaseCurrency('CNY');
  }, [mode]);

  useEffect(() => {
    if (!mixedCurrencies) {
      setFxMerge(false);
      setBaseCurrency('CNY');
    }
  }, [mixedCurrencies]);

  useEffect(() => {
    const available = performanceQueries.series.data?.availableIntervals;
    if (!available || available.includes(seriesInterval)) return;
    setSeriesInterval(performanceQueries.series.data?.defaultInterval ?? available[0] ?? '1d');
  }, [performanceQueries.series.data, seriesInterval]);

  const snapshots = performanceQueries.history.data ?? [];
  const summary = !performanceQueries.summary.isError
    ? (performanceQueries.summary.data ?? null)
    : null;
  const layers = performanceQueries.layers.data;
  const allocationResponse = performanceQueries.allocation.data;
  const targetsUnavailable = performanceQueries.targets.isError;
  const targetsResponse = !targetsUnavailable ? performanceQueries.targets.data : undefined;
  const targets = targetsResponse?.targets ?? {};
  const latestSnapshot = snapshots.at(-1);
  const latest = [...snapshots].reverse().find((snapshot) => !snapshot.partial);
  const scopedTotal = effectiveAccountId
    ? layers?.account.find((record) => record.accountId === effectiveAccountId)
    : layers?.portfolio;
  const scopedSecurity =
    layers?.security.filter(
      (position) => !effectiveAccountId || position.accountId === effectiveAccountId,
    ) ?? [];
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
    performanceQueries.series,
    performanceQueries.summary,
    performanceQueries.layers,
    performanceQueries.targets,
  ].some((query) => query.data !== undefined);
  const scopeWideError =
    !scopeHasData &&
    [
      performanceQueries.history,
      performanceQueries.series,
      performanceQueries.summary,
      performanceQueries.layers,
      performanceQueries.targets,
    ].every((query) => query.isError);
  const historyState = resolveLoadState(
    [performanceQueries.history],
    performanceQueries.history.data !== undefined,
    performanceQueries.history.data !== undefined && snapshots.length === 0,
  );
  const seriesState = resolveLoadState(
    [performanceQueries.series],
    performanceQueries.series.data !== undefined,
    performanceQueries.series.data !== undefined &&
      performanceQueries.series.data.points.length === 0,
  );
  const allocationState = resolveLoadState(
    [
      performanceQueries.layers,
      // 目标配置单独展示“目标配置不可用”；它不应把当前估值标记为陈旧。
      { isPending: performanceQueries.targets.isPending, isError: false },
      performanceQueries.allocation,
    ],
    allocationResponse !== undefined,
    allocationResponse !== undefined && allocationResponse.allocation.length === 0,
  );
  const refreshing = [
    performanceQueries.history,
    performanceQueries.series,
    performanceQueries.summary,
    performanceQueries.layers,
    performanceQueries.targets,
    performanceQueries.allocation,
  ].some((query) => query.isFetching);
  const saveTargetsMutation = useSavePerformanceTargetsMutation();
  const savedTargetsRefreshFailed =
    saveTargetsMutation.isSuccess &&
    !saveTargetsMutation.data.refreshed &&
    saveTargetsMutation.variables.accountId === (effectiveAccountId || undefined) &&
    (performanceQueries.targets.isError || performanceQueries.allocation.isError);

  const retry = () => {
    void Promise.all([
      performanceQueries.history.refetch(),
      performanceQueries.series.refetch(),
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
      const saved = await saveTargetsMutation.mutateAsync({
        scope: effectiveAccountId ? 'account' : 'portfolio',
        ...(effectiveAccountId ? { accountId: effectiveAccountId } : {}),
        targets: nextTargets,
      });
      toastManager.add({
        title: saved.refreshed ? '目标配置已保存' : '目标已保存，比较数据刷新失败',
        description: saved.refreshed
          ? '已生成新版本，配置比较已更新。'
          : '请重新加载目标配置；本次保存已完成，无需再次提交。',
        type: saved.refreshed ? 'success' : 'warning',
        timeout: saved.refreshed ? 2800 : 6000,
      });
      return true;
    } catch (error) {
      const message = requestFailureMessage(error, '目标保存失败，请稍后重试。');
      setTargetSaveError(message);
      return false;
    }
  };

  return (
    <section className="module-page performance-page w-full">
      <PageHeader
        eyebrow="PERFORMANCE"
        title="收益分析"
        description="查看资产走势、历史收益与配置目标。"
      />
      {mode === 'shadow' ? (
        <PortfolioModeNote>当前收益只计算模拟账户，结果仅用于研究。</PortfolioModeNote>
      ) : null}
      <div className="mt-8 space-y-10">
        <div className="space-y-4">
          <PerformanceAccountSelector
            accounts={accounts}
            mode={mode}
            accountId={effectiveAccountId}
            mixedCurrencies={mixedCurrencies}
            latestSnapshotAt={latest?.capturedAt}
            valuedAt={layers?.valuedAt}
            onAccountChange={setAccountId}
            fxMerge={effectiveFxMerge}
            baseCurrency={baseCurrency}
            onFxMergeChange={setFxMerge}
            onBaseCurrencyChange={setBaseCurrency}
            onRetry={retry}
            fx={layers?.fx ?? summary?.fx}
          />
          {scopeWideError ? <DataStateBanner state="error" onRetry={retry} /> : null}
          <PerformanceMetrics
            latest={latest}
            summary={summary}
            snapshotCount={snapshots.length}
            latestPartial={latestSnapshot?.partial === true}
            currentValue={currentValue}
            currentValuePartial={currentValuePartial}
            currentPnl={currentPnl}
            currentPnlRate={currentPnlRate}
            currentCurrency={scopedTotal?.currency}
            currencyTotals={
              !effectiveAccountId && (!effectiveFxMerge || layers?.fx?.status === 'blocked')
                ? (layers?.byCurrency ?? [])
                : []
            }
            fx={layers?.fx ?? summary?.fx}
            summaryError={
              performanceQueries.summary.isError
                ? '收益摘要暂不可用，请检查行情完整性后重试'
                : undefined
            }
          />
        </div>
        <PerformanceSnapshotTable
          loadState={
            !effectiveAccountId && mixedCurrencies && !effectiveFxMerge ? historyState : seriesState
          }
          snapshots={snapshots}
          series={performanceQueries.series.data}
          range={seriesRange}
          interval={seriesInterval}
          onRangeChange={(nextRange, defaultInterval) => {
            setSeriesRange(nextRange);
            setSeriesInterval(defaultInterval);
          }}
          onIntervalChange={setSeriesInterval}
          groupedByCurrency={
            !effectiveAccountId &&
            mixedCurrencies &&
            (!effectiveFxMerge || layers?.fx?.status === 'blocked')
          }
          refreshing={refreshing}
          onRetry={() =>
            void Promise.all([
              performanceQueries.history.refetch(),
              performanceQueries.series.refetch(),
            ])
          }
          onCompleteDataSetup={() => onNavigate('providers')}
        />
        {savedTargetsRefreshFailed && (
          <DataStateBanner
            state="error"
            description="目标配置已保存，但比较数据刷新失败。本次保存已完成，请重新加载目标配置，无需再次提交。"
          />
        )}
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
          portfolioScope={!effectiveAccountId}
          valuedAt={layers?.valuedAt}
          fx={layers?.fx ?? summary?.fx}
          currencyTotals={layers?.byCurrency ?? []}
          allocationUnavailable={performanceQueries.allocationUnavailable}
          targetVersion={targetsResponse?.version}
          targetCreatedAt={targetsResponse?.createdAt}
          targetSaving={saveTargetsMutation.isPending}
          targetSaveError={targetSaveError}
          editDisabled={
            performanceQueries.targets.isPending ||
            performanceQueries.allocationUnavailable ||
            (targetsUnavailable && Boolean(effectiveAccountId))
          }
          onRetry={retryAllocation}
          onSaveTargets={saveTargets}
        />
      </div>
    </section>
  );
}
