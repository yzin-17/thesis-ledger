import { TableHeader, TableHead } from '@/components/ui/table';
import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { CATEGORY_LABELS, CATEGORY_ORDER } from './performance.target-draft.js';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { cn } from '@/lib/utils';
import { LoadingState } from '@/components/ui/spinner';
import { AlertTriangle } from 'lucide-react';
import { formatRatioPercent as formatWeight, normalizeAllocationTargets } from '@thesis-ledger/domain';

import { PerformanceTargetEditor } from './PerformanceTargetEditor.js';
import { AllocationWeight as WeightBar } from './AllocationWeight.js';
import type {
  AllocationCategory,
  PerformanceAllocationRecord,
  PerformanceDataQuality,
  PerformanceFxMeta,
  PerformancePortfolioTotal,
  RebalanceGapRecord,
  Currency,
} from './performance.types.js';

import { formatDate, formatMoney } from './performance-display.js';
export { PerformanceMetrics } from './PerformanceMetrics.js';

export { PerformanceSnapshotTable } from './PerformanceTrendSection.js';


export { PerformanceAccountSelector } from './PerformanceScopeControls.js';

type ComparisonRow = {
  category: AllocationCategory;
  value: number;
  currentWeight: number | null;
  targetWeight: number | null;
  weightGap: number | null;
  amountGap: number | null;
  direction: RebalanceGapRecord['direction'] | null;
};

const adjustmentLabel = (
  row: ComparisonRow,
  weightsUnavailable: boolean,
  targetsUnavailable: boolean,
  currency?: Currency,
) => {
  if (weightsUnavailable) return { text: '暂不可用', className: 'text-muted-foreground' };
  if (targetsUnavailable) return { text: '目标不可用', className: 'text-muted-foreground' };
  if (row.targetWeight === null) return { text: '未设置目标', className: 'text-muted-foreground' };
  if (row.direction === 'increase' && row.amountGap !== null) {
    return {
      text: `↑ 买入 ${formatMoney(Math.abs(row.amountGap), currency)}`,
      className: 'text-[var(--color-market-up)]',
    };
  }
  if (row.direction === 'decrease' && row.amountGap !== null) {
    return {
      text: `↓ 减少 ${formatMoney(Math.abs(row.amountGap), currency)}`,
      className: 'text-[var(--color-market-down)]',
    };
  }
  if (row.direction === 'balanced') return { text: '无需调整', className: 'text-muted-foreground' };
  return { text: '暂无建议', className: 'text-muted-foreground' };
};

const comparisonRows = (
  allocationRows: PerformanceAllocationRecord[],
  rebalanceRows: RebalanceGapRecord[],
  targets: Record<string, number>,
): ComparisonRow[] => {
  const allocationMap = new Map(allocationRows.map((row) => [row.category, row]));
  const rebalanceMap = new Map(rebalanceRows.map((row) => [row.category, row]));
  const categories = new Set<AllocationCategory>();
  for (const row of allocationRows) categories.add(row.category);
  for (const row of rebalanceRows) categories.add(row.category);
  const normalizedTargets = normalizeAllocationTargets(targets).targets;
  for (const category of Object.keys(normalizedTargets) as AllocationCategory[]) {
    if (category) {
      categories.add(category);
    }
  }
  return [...categories]
    .sort((left, right) => CATEGORY_ORDER.indexOf(left) - CATEGORY_ORDER.indexOf(right))
    .map((category) => {
      const allocation = allocationMap.get(category);
      const rebalance = rebalanceMap.get(category);
      return {
        category,
        value: allocation?.value ?? 0,
        currentWeight: allocation?.weight ?? rebalance?.currentWeight ?? null,
        targetWeight: rebalance?.targetWeight ?? normalizedTargets[category] ?? null,
        weightGap: rebalance?.weightGap ?? null,
        amountGap: rebalance?.amountGap ?? null,
        direction: rebalance?.direction ?? null,
      };
    });
};

export function PerformanceAllocationSection({
  refreshing = false,
  loadState,
  allocationRows,
  rebalanceRows,
  targets,
  dataQuality,
  targetsUnavailable = false,
  portfolioScope = false,
  targetScopeLabel,
  valuedAt,
  fx,
  currencyTotals = [],
  allocationUnavailable = false,
  targetVersion,
  targetCreatedAt,
  targetSaving = false,
  targetSaveError,
  onBeginTargetEdit,
  editDisabled,
  onRetry,
  onSaveTargets,
}: {
  refreshing?: boolean;
  loadState: 'loading' | 'error' | 'stale' | 'empty' | 'ready';
  allocationRows: PerformanceAllocationRecord[];
  rebalanceRows: RebalanceGapRecord[];
  targets: Record<string, number>;
  dataQuality: PerformanceDataQuality;
  targetsUnavailable?: boolean | undefined;
  portfolioScope?: boolean | undefined;
  targetScopeLabel?: string | undefined;
  valuedAt?: string | undefined;
  fx?: PerformanceFxMeta | undefined;
  currencyTotals?: PerformancePortfolioTotal[];
  allocationUnavailable?: boolean;
  targetVersion?: number | undefined;
  targetCreatedAt?: string | undefined;
  targetSaving?: boolean | undefined;
  targetSaveError?: string | null | undefined;
  onBeginTargetEdit?: (() => void) | undefined;
  editDisabled?: boolean | undefined;
  onRetry?: (() => void) | undefined;
  onSaveTargets: (targets: Record<AllocationCategory, number>) => Promise<boolean>;
}) {
  const rows = comparisonRows(allocationRows, rebalanceRows, targets);
  const displayCurrency =
    fx?.baseCurrency ?? (currencyTotals.length === 1 ? currencyTotals[0]?.currency : undefined);
  const hasTargets = !targetsUnavailable && Object.keys(targets).length > 0;
  const fxBlocked = fx?.status === 'blocked';
  const weightsUnavailable = dataQuality.partial || allocationUnavailable || fxBlocked;
  const hasLoadNotice = loadState === 'error' || loadState === 'stale';
  const hasStatusNotice =
    hasLoadNotice ||
    dataQuality.partial ||
    targetsUnavailable ||
    allocationUnavailable ||
    fxBlocked;
  const loadNoticeTitle = loadState === 'error' ? '数据读取失败' : '数据可能陈旧';
  const loadNoticeDescription =
    loadState === 'error'
      ? '当前配置数据未更新为正常值，请检查服务后重试。'
      : '部分来源不可用，当前结果会保留陈旧标记。';
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-xl font-semibold tracking-tight">配置与目标</h2>
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            估值计算时间 {formatDate(valuedAt)}
          </p>
          {fx?.status === 'stale' ? (
            <p className="m-0 mt-1 text-xs text-muted-foreground">
              按当前汇率回算 · 估算 · 使用陈旧汇率
            </p>
          ) : null}
          {targetVersion !== undefined ? (
            <p className="m-0 mt-1 text-xs text-muted-foreground">
              目标版本 v{targetVersion} · 生效于 {formatDate(targetCreatedAt)}
            </p>
          ) : null}
        </div>
        <PerformanceTargetEditor
          label={hasTargets ? '调整目标' : '设置目标'}
          scopeLabel={targetScopeLabel ?? (portfolioScope ? '全部账户' : '当前账户')}
          targets={targets}
          categories={rows.map(row => ({ category: row.category, currentWeight: weightsUnavailable ? null : row.currentWeight }))}
          saving={Boolean(targetSaving)} disabled={Boolean(editDisabled)} error={targetSaveError}
          onBeginEdit={onBeginTargetEdit} onSave={onSaveTargets}
        />
      </div>
      {hasStatusNotice ? (
        <div
          className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0 text-[color:var(--color-warning)]"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1 space-y-2 text-sm">
              {hasLoadNotice ? (
                <div>
                  <p className="m-0 font-medium">{loadNoticeTitle}</p>
                  <p className="m-0 mt-1 text-muted-foreground">{loadNoticeDescription}</p>
                </div>
              ) : null}
              {dataQuality.partial ? (
                <div>
                  <p className="m-0 font-medium">行情不完整</p>
                  <p className="m-0 mt-1 text-muted-foreground">
                    已保留可用金额，但权重暂不可用，再平衡建议已暂停。缺失标的或类别：
                    {dataQuality.missingSymbols.length > 0
                      ? dataQuality.missingSymbols.join('、')
                      : '未返回'}
                    。
                  </p>
                </div>
              ) : null}
              {targetsUnavailable ? (
                <div>
                  <p className="m-0 font-medium">
                    {portfolioScope ? '组合目标暂时无法读取' : '目标配置不可用'}
                  </p>
                  <p className="m-0 mt-1 text-muted-foreground">
                    当前配置仍可查看，当前权重保持可用；目标权重和再平衡建议暂不可用。
                    {portfolioScope
                      ? ' 你仍可以为全部账户设置组合目标，保存失败时会保留草稿。'
                      : ' 请先重新加载目标配置。'}
                  </p>
                </div>
              ) : null}
              {allocationUnavailable ? (
                <div>
                  <p className="m-0 font-medium">当前为分币种配置</p>
                  <p className="m-0 mt-1 text-muted-foreground">
                    不同币种没有共同权重分母，已按币种保留估值；开启汇率合并后才会计算全局目标偏差和再平衡。
                  </p>
                  {currencyTotals.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {currencyTotals.map((total) => (
                        <div
                          key={total.currency ?? 'unknown'}
                          className="rounded-md bg-background/70 px-3 py-1.5"
                        >
                          <span className="text-xs text-muted-foreground">
                            {total.currency ?? '未知币种'}
                          </span>
                          <span className="ml-2 font-medium">
                            {formatMoney(total.marketValue + total.cashValue, total.currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {fxBlocked && !allocationUnavailable ? (
                <div>
                  <p className="m-0 font-medium">无法获取汇率</p>
                  <p className="m-0 mt-1 text-muted-foreground">
                    已保留原币种金额，合并配置与再平衡暂不可用。重新获取汇率后重试。
                  </p>
                </div>
              ) : null}
            </div>
            {onRetry ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={onRetry}
              >
                重新加载
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      <ListRefreshRegion refreshing={refreshing && loadState !== 'loading'} label="正在刷新配置明细">
        {loadState === 'loading' && rows.length === 0 ? (
          <LoadingState label="配置数据加载中" />
        ) : rows.length > 0 && !allocationUnavailable && !fxBlocked ? (
          <div
            data-list-frame="composite"
            className="overflow-hidden rounded-md border border-border bg-card"
          >
            <div className="table-wrap">
              <table className="min-w-[680px] md:min-w-0">
                <TableHeader>
                  <tr>
                    <TableHead>分类</TableHead>
                    <TableHead className="text-right">当前金额</TableHead>
                    <TableHead className="text-right">当前权重</TableHead>
                    <TableHead className="text-right">目标权重</TableHead>
                    <TableHead className="text-right">权重偏差</TableHead>
                    <TableHead className="text-right">再平衡建议</TableHead>
                  </tr>
                </TableHeader>
                <tbody>
                  {rows.map((row) => {
                    const adjustment = adjustmentLabel(
                      row,
                      weightsUnavailable,
                      targetsUnavailable,
                      displayCurrency,
                    );
                    return (
                      <tr key={row.category}>
                        <td>{CATEGORY_LABELS[row.category]}</td>
                        <td className="text-right text-muted-foreground">
                          {formatMoney(row.value, displayCurrency)}
                        </td>
                        <td className="text-right">
                          <WeightBar
                            value={row.currentWeight}
                            label={`${CATEGORY_LABELS[row.category]}当前权重`}
                            unavailable={weightsUnavailable}
                          />
                        </td>
                        <td className="text-right">
                          <WeightBar
                            value={row.targetWeight}
                            label={`${CATEGORY_LABELS[row.category]}目标权重`}
                            unavailable={weightsUnavailable}
                          />
                        </td>
                        <td className="text-right">
                          {formatWeight(weightsUnavailable ? null : row.weightGap)}
                        </td>
                        <td className={cn('text-right text-sm', adjustment.className)}>
                          {adjustment.text}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          (loadState === 'ready' || loadState === 'empty') &&
          !targetsUnavailable && (
            <Empty
              className="min-h-[120px] rounded-md border border-border bg-muted/20 px-4 py-6"
              aria-live="polite"
            >
              <EmptyDescription>
                {hasTargets ? '当前范围暂无可估值配置。' : '先设置目标配置，保存后可在这里比较。'}
              </EmptyDescription>
            </Empty>
          )
        )}
      </ListRefreshRegion>
    </section>
  );
}
