import { performanceSeriesSelection } from './performance-series-selection.js';
import { usePageRefresh } from '../shared/usePageRefresh.js';
import { requestFailureMessage } from '../../shared/api/request-error.js';
import { useEffect, useMemo, useState } from 'react';
import { useToastManager } from '@/components/ui/toast';

import type { DesktopNavigationView } from '../../views.js';
import type { Account, Portfolio } from '../portfolio/portfolio.types.js';
import { PerformanceAnalysisTrend } from './PerformanceAnalysisTrend.js';
import { DataStateBanner } from '../shared/DesktopPrimitives.js';
import { resolveLoadState } from '../shared/loadState.js';
import { useSavePerformanceTargetsMutation } from './performance.mutations.js';
import { performanceKeys, usePerformanceQueries } from './performance.queries.js';
import type {
  AllocationCategory,
  Currency,
  PerformanceSeriesInterval,
  PerformanceSeriesRange,
  PortfolioMode,
} from './performance.types.js';
import { PerformanceAllocationSection, PerformanceMetrics } from './PerformanceSections.js';

export function PerformanceDashboard(props: {
  accountId: string;
  section: 'analysis' | 'allocation';
  fxMerge: boolean;
  baseCurrency: Currency;
  portfolio: Portfolio | null;
  accounts: Account[];
  mode: PortfolioMode;
  onNavigate: (view: DesktopNavigationView) => void;
}) {
  const control = usePerformanceDashboard(props);
  const { scopeWideError, retry, section, savedTargetsRefreshFailed } = control;

  return (
    <section className="flex min-w-0 flex-col gap-6">
      {scopeWideError && <DataStateBanner state="error" onRetry={retry} />}
      {section === 'analysis' && (
        <div className="flex min-w-0 flex-col gap-group">
          <p className="m-0 text-xs text-muted-foreground">全历史收益率</p>
          <DashboardMetrics control={control} />
        </div>
      )}
      {section === 'analysis' && (
        <div className="flex min-w-0 flex-col gap-4">
          <DashboardTrend control={control} />
        </div>
      )}
      {section === 'allocation' && savedTargetsRefreshFailed && (
        <DataStateBanner
          state="error"
          description="目标配置已保存，但比较数据刷新失败。本次保存已完成，请重新加载目标配置，无需再次提交。"
        />
      )}
      {section === 'allocation' && <DashboardAllocation control={control} />}
    </section>
  );
}

function usePerformanceDashboard({
  accounts,
  mode,
  onNavigate,
  accountId,
  section,
  fxMerge,
  baseCurrency,
  portfolio,
}: {
  accountId: string;
  section: 'analysis' | 'allocation';
  fxMerge: boolean;
  baseCurrency: Currency;
  portfolio: Portfolio | null;
  accounts: Account[];
  mode: PortfolioMode;
  onNavigate: (view: DesktopNavigationView) => void;
}) {
  const [seriesRange, setSeriesRange] = useState<PerformanceSeriesRange>('1Y');
  const [seriesInterval, setSeriesInterval] = useState<PerformanceSeriesInterval>('1d');
  const selection = performanceSeriesSelection(seriesRange, seriesInterval, mode);
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
    selection.range,
    selection.interval,
  );

  useEffect(() => {
    const available = performanceQueries.series.data?.availableIntervals;
    if (!available || available.includes(selection.interval)) return;
    setSeriesInterval(performanceQueries.series.data?.defaultInterval ?? available[0] ?? '1d');
  }, [performanceQueries.series.data, selection.interval]);

  const {
    snapshots,
    summary,
    layers,
    allocationResponse,
    targetsUnavailable,
    targetsResponse,
    targets,
    latestSnapshot,
    latest,
    scopedTotal,
    currentValue,
    currentValuePartial,
    currentPnl,
    currentPnlRate,
  } = currentPerformanceValuation(performanceQueries, effectiveAccountId);
  const { scopeWideError, historyState, seriesState, allocationState } =
    performanceRegionLoadStates(performanceQueries, snapshots, allocationResponse);
  const { refresh } = usePageRefresh([{ queryKey: performanceKeys.root }]);
  const groupedTrend =
    !effectiveAccountId &&
    mixedCurrencies &&
    (!effectiveFxMerge || layers?.fx?.status === 'blocked');
  const saveTargetsMutation = useSavePerformanceTargetsMutation();
  const savedTargetsRefreshFailed =
    saveTargetsMutation.isSuccess &&
    !saveTargetsMutation.data.refreshed &&
    saveTargetsMutation.variables.accountId === (effectiveAccountId || undefined) &&
    (performanceQueries.targets.isError || performanceQueries.allocation.isError);

  const retry = () => {
    void refresh();
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

  return {
    scopeWideError,
    retry,
    section,
    latest,
    summary,
    snapshots,
    latestSnapshot,
    currentValue,
    currentValuePartial,
    currentPnl,
    currentPnlRate,
    scopedTotal,
    effectiveAccountId,
    effectiveFxMerge,
    layers,
    performanceQueries,
    portfolio,
    mode,
    baseCurrency,
    mixedCurrencies,
    historyState,
    seriesState,
    selection,
    setSeriesRange,
    setSeriesInterval,
    groupedTrend,
    onNavigate,
    savedTargetsRefreshFailed,
    allocationState,
    allocationResponse,
    targets,
    targetsUnavailable,
    modeAccounts,
    targetsResponse,
    saveTargetsMutation,
    targetSaveError,
    setTargetSaveError,
    retryAllocation,
    saveTargets,
  };
}

function DashboardMetrics({ control }: { control: ReturnType<typeof usePerformanceDashboard> }) {
  return (
    <>
      <PerformanceMetrics
        includeAssets={false}
        latest={control.latest}
        summary={control.summary}
        snapshotCount={control.snapshots.length}
        latestPartial={control.latestSnapshot?.partial === true}
        currentValue={control.currentValue}
        currentValuePartial={control.currentValuePartial}
        currentPnl={control.currentPnl}
        currentPnlRate={control.currentPnlRate}
        currentCurrency={control.scopedTotal?.currency}
        currencyTotals={
          !control.effectiveAccountId &&
          (!control.effectiveFxMerge || control.layers?.fx?.status === 'blocked')
            ? (control.layers?.byCurrency ?? [])
            : []
        }
        fx={control.layers?.fx ?? control.summary?.fx}
        summaryError={
          control.performanceQueries.summary.isError
            ? '收益摘要暂不可用，请检查行情完整性后重试'
            : undefined
        }
      />
    </>
  );
}
function DashboardTrend({ control }: { control: ReturnType<typeof usePerformanceDashboard> }) {
  return (
    <>
      <PerformanceAnalysisTrend
        portfolio={control.portfolio}
        accountId={control.effectiveAccountId}
        mode={control.mode}
        baseCurrency={control.baseCurrency}
        loadState={
          !control.effectiveAccountId && control.mixedCurrencies && !control.effectiveFxMerge
            ? control.historyState
            : control.seriesState
        }
        snapshots={control.snapshots}
        series={control.performanceQueries.series.data}
        range={control.selection.range}
        interval={control.selection.interval}
        onRangeChange={(nextRange, defaultInterval) => {
          control.setSeriesRange(nextRange);
          control.setSeriesInterval(defaultInterval);
        }}
        onIntervalChange={control.setSeriesInterval}
        groupedByCurrency={control.groupedTrend}
        refreshing={
          control.performanceQueries.series.isFetching ||
          (control.groupedTrend && control.performanceQueries.history.isFetching)
        }
        onRetry={() =>
          void Promise.all([
            control.performanceQueries.history.refetch(),
            control.performanceQueries.series.refetch(),
          ])
        }
        onCompleteDataSetup={() => control.onNavigate('providers')}
      />
    </>
  );
}
function DashboardAllocation({ control }: { control: ReturnType<typeof usePerformanceDashboard> }) {
  return (
    <>
      <PerformanceAllocationSection
        refreshing={
          control.performanceQueries.allocation.isRefetching ||
          control.performanceQueries.targets.isRefetching ||
          control.performanceQueries.layers.isRefetching
        }
        key={`${control.mode}:${control.effectiveAccountId}:${control.effectiveFxMerge}:${control.baseCurrency}`}
        loadState={control.allocationState}
        allocationRows={control.allocationResponse?.allocation ?? []}
        rebalanceRows={control.allocationResponse?.rebalance ?? []}
        targets={control.targets}
        dataQuality={
          control.allocationResponse?.partial
            ? {
                partial: true,
                missingSymbols: control.allocationResponse.missingSymbols,
              }
            : control.performanceQueries.quality
        }
        targetsUnavailable={control.targetsUnavailable}
        portfolioScope={!control.effectiveAccountId}
        targetScopeLabel={
          control.modeAccounts.find((account) => account.id === control.effectiveAccountId)?.name ??
          '全部账户'
        }
        valuedAt={control.layers?.valuedAt}
        fx={control.layers?.fx ?? control.summary?.fx}
        currencyTotals={control.layers?.byCurrency ?? []}
        allocationUnavailable={control.performanceQueries.allocationUnavailable}
        targetVersion={control.targetsResponse?.version}
        targetCreatedAt={control.targetsResponse?.createdAt}
        targetSaving={control.saveTargetsMutation.isPending}
        targetSaveError={control.targetSaveError}
        onBeginTargetEdit={() => control.setTargetSaveError(null)}
        editDisabled={allocationEditDisabled(control)}
        onRetry={control.retryAllocation}
        onSaveTargets={control.saveTargets}
      />
    </>
  );
}

function currentPerformanceValuation(
  performanceQueries: ReturnType<typeof usePerformanceQueries>,
  effectiveAccountId: string,
) {
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
  const { scopedTotal, currentValue, currentValuePartial, currentPnl, currentPnlRate } =
    currentScopeValuation(layers, effectiveAccountId);
  return {
    snapshots,
    summary,
    layers,
    allocationResponse,
    targetsUnavailable,
    targetsResponse,
    targets,
    latestSnapshot,
    latest,
    scopedTotal,
    currentValue,
    currentValuePartial,
    currentPnl,
    currentPnlRate,
  };
}

function performanceRegionLoadStates(
  performanceQueries: ReturnType<typeof usePerformanceQueries>,
  snapshots: ReturnType<typeof currentPerformanceValuation>['snapshots'],
  allocationResponse: ReturnType<typeof currentPerformanceValuation>['allocationResponse'],
) {
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
  return { scopeWideError, historyState, seriesState, allocationState };
}

function currentScopeValuation(
  layers: ReturnType<typeof usePerformanceQueries>['layers']['data'],
  effectiveAccountId: string,
) {
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
  return { scopedTotal, currentValue, currentValuePartial, currentPnl, currentPnlRate };
}

function allocationEditDisabled(control: ReturnType<typeof usePerformanceDashboard>) {
  return (
    control.performanceQueries.targets.isPending ||
    control.performanceQueries.allocationUnavailable ||
    (control.targetsUnavailable && Boolean(control.effectiveAccountId))
  );
}
