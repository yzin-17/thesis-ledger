import { validateTargetDraft, type TargetRow } from './performance.target-draft.js';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Progress, ProgressIndicator, ProgressTrack } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch, SwitchThumb } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, Plus } from 'lucide-react';
import { normalizeAllocationCategory, normalizeAllocationTargets } from '@thesis-ledger/domain';

import { accountDisplayLabel, type Account } from '../portfolio/portfolio.types.js';
import { PerformanceTargetActions } from './PerformanceTargetActions.js';
import { useDraftCloseGuard } from '../shared/useDraftCloseGuard.js';
import { money } from '../shared/display.js';
import { StickyTableActionCell, StickyTableActionHeader } from '../shared/StickyTableActions.js';
import type {
  AllocationCategory,
  PerformanceAllocationRecord,
  PerformanceDataQuality,
  PerformanceFxMeta,
  PerformancePortfolioTotal,
  PerformanceSummary,
  PortfolioMode,
  RebalanceGapRecord,
  SnapshotRecord,
  Currency,
} from './performance.types.js';

export { PerformanceSnapshotTable } from './PerformanceTrendSection.js';

const ALL_ACCOUNTS_VALUE = '__all_accounts__';
const CATEGORY_ORDER: AllocationCategory[] = ['stock', 'etf', 'fund', 'index', 'cash'];
const CATEGORY_LABELS: Record<AllocationCategory, string> = {
  stock: '股票',
  etf: 'ETF',
  fund: '基金',
  index: '指数',
  cash: '现金',
};

const moneyByCurrency: Record<Currency, Intl.NumberFormat> = {
  CNY: money,
  HKD: new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'HKD' }),
  USD: new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'USD' }),
};

const formatMoney = (value: number, currency?: Currency) =>
  (currency ? moneyByCurrency[currency] : money).format(value);

const formatWeight = (weight: number | null | undefined) => {
  if (weight === null || weight === undefined || !Number.isFinite(weight)) return '—';
  return `${(weight * 100).toFixed(2)}%`;
};

const WeightBar = ({
  value,
  label,
  unavailable = false,
}: {
  value: number | null | undefined;
  label: string;
  unavailable?: boolean;
}) => {
  if (unavailable || value === null || value === undefined || !Number.isFinite(value)) {
    return (
      <div className="min-w-32 text-right text-sm text-muted-foreground">{formatWeight(null)}</div>
    );
  }
  const progressValue = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="flex min-w-32 items-center justify-end gap-2">
      <div className="shrink-0 text-xs text-muted-foreground">{formatWeight(value)}</div>
      <Progress
        className="w-20 shrink-0"
        value={progressValue}
        aria-label={`${label}${formatWeight(value)}`}
      >
        <ProgressTrack className="h-1">
          <ProgressIndicator />
        </ProgressTrack>
      </Progress>
    </div>
  );
};

const formatDate = (value?: string | null) => {
  if (!value) return '尚无数据时点';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '尚无数据时点' : date.toLocaleString('zh-CN');
};

const snapshotValue = (snapshot: SnapshotRecord) => snapshot.marketValue + snapshot.cashValue;

const signedMoney = (value: number, currency?: Currency) =>
  value >= 0 ? `+${formatMoney(value, currency)}` : formatMoney(value, currency);

const signedPercent = (value: number) => {
  const formatted = `${Math.abs(value * 100).toFixed(2)}%`;
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
};

export function PerformanceAccountSelector({
  accounts,
  mode,
  accountId,
  mixedCurrencies,
  latestSnapshotAt,
  valuedAt,
  onAccountChange,
  fxMerge,
  baseCurrency,
  onFxMergeChange,
  onBaseCurrencyChange,
  onRetry,
  fx,
}: {
  accounts: Account[];
  mode: PortfolioMode;
  accountId: string;
  mixedCurrencies: boolean;
  latestSnapshotAt?: string | undefined;
  valuedAt?: string | undefined;
  onAccountChange: (accountId: string) => void;
  fxMerge?: boolean;
  baseCurrency?: 'CNY' | 'HKD' | 'USD';
  onFxMergeChange?: (checked: boolean) => void;
  onBaseCurrencyChange?: (currency: 'CNY' | 'HKD' | 'USD') => void;
  onRetry?: (() => void) | undefined;
  fx?: PerformanceFxMeta | undefined;
}) {
  const resolvedFxMerge = fxMerge ?? false;
  const resolvedBaseCurrency = baseCurrency ?? 'CNY';
  const handleFxMergeChange = onFxMergeChange ?? (() => undefined);
  const handleBaseCurrencyChange = onBaseCurrencyChange ?? (() => undefined);
  const fxAvailable = mixedCurrencies && !accountId;
  const modeAccounts = accounts.filter(
    (account) => account.mode === mode && account.active !== false,
  );
  const selectedAccount = modeAccounts.find((account) => account.id === accountId);
  const statusDate = latestSnapshotAt ?? valuedAt;
  const statusLabel = statusDate
    ? `数据截至 ${formatDate(statusDate)} · ${latestSnapshotAt ? '有收益快照' : '暂无收益快照'}`
    : '数据截至 -- · 暂无估值快照';
  const fxDate = fx?.asOf ? formatDate(fx.asOf) : undefined;
  let fxStatusLabel = '当前无需换算';
  if (fxAvailable && !resolvedFxMerge) fxStatusLabel = '分币种显示 · 未合并';
  else if (fx?.status === 'ready') fxStatusLabel = `已换算至 ${resolvedBaseCurrency}`;
  else if (fx?.status === 'stale')
    fxStatusLabel = `已换算至 ${resolvedBaseCurrency} · 使用陈旧汇率`;
  else if (fx?.status === 'blocked') fxStatusLabel = '无法获取汇率，保留分币种结果';
  let mixedCurrencyHint = '';
  if (mixedCurrencies && !fxAvailable)
    mixedCurrencyHint = '当前模式包含多个币种；当前已选择单个账户，金额使用该账户原币种。';
  else if (fxAvailable && resolvedFxMerge)
    mixedCurrencyHint = '合并仅影响收益分析展示，不改变账本、持仓或目标配置的原始币种。';
  else if (fxAvailable)
    mixedCurrencyHint =
      '当前模式包含多个币种；关闭汇率合并时按币种分组展示，不计算跨币种目标偏差或再平衡。';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 basis-full items-center gap-2 text-sm text-muted-foreground sm:basis-auto">
          <span className="shrink-0">账户</span>
          <Select
            value={accountId || ALL_ACCOUNTS_VALUE}
            onValueChange={(value) => {
              onAccountChange(value === ALL_ACCOUNTS_VALUE ? '' : (value ?? ''));
            }}
          >
            <SelectTrigger aria-label="账户" className="w-full sm:w-72">
              <SelectValue>
                {selectedAccount ? accountDisplayLabel(selectedAccount) : '全部账户'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={ALL_ACCOUNTS_VALUE}>全部账户</SelectItem>
                {modeAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {accountDisplayLabel(account)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
          <span>汇率合并</span>
          <Switch
            variant="risk"
            checked={resolvedFxMerge}
            disabled={!fxAvailable}
            aria-label={fxAvailable ? '汇率合并' : '当前范围无需汇率换算'}
            onCheckedChange={handleFxMergeChange}
          >
            <SwitchThumb variant="risk" aria-hidden="true" />
          </Switch>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
          <span>基准币种</span>
          <Select
            value={resolvedBaseCurrency}
            disabled={!fxAvailable || !resolvedFxMerge}
            onValueChange={(value) => {
              if (value === 'CNY' || value === 'HKD' || value === 'USD')
                handleBaseCurrencyChange(value);
            }}
          >
            <SelectTrigger aria-label="基准币种" className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="CNY">CNY</SelectItem>
                <SelectItem value="HKD">HKD</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground sm:justify-end">
        <p className="m-0">
          {fxStatusLabel}
          {fxDate ? ` · 汇率截至 ${fxDate}` : ''}
          {resolvedFxMerge && fx?.estimated ? ' · 按当前汇率回算 · 估算' : ''}
          {` · ${statusLabel}`}
        </p>
        {fxAvailable && resolvedFxMerge && fx?.status === 'blocked' && onRetry ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-7 px-0 text-xs"
            onClick={onRetry}
          >
            重新获取汇率
          </Button>
        ) : null}
      </div>
      {mixedCurrencies ? (
        <p className="m-0 text-xs text-muted-foreground">{mixedCurrencyHint}</p>
      ) : null}
    </div>
  );
}

const PerformanceKpiCard = ({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: 'positive' | 'negative' | undefined;
}) => (
  <Card className="h-[120px] rounded-xl border border-border/70 bg-muted/25 py-0 shadow-none ring-0">
    <CardContent className="flex h-full flex-col justify-between p-4">
      <p className="m-0 text-xs text-muted-foreground">{label}</p>
      <strong className="block text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </strong>
      <p className={tone ? `m-0 text-xs ${tone}` : 'm-0 text-xs text-muted-foreground'}>{detail}</p>
    </CardContent>
  </Card>
);

export function PerformanceMetrics({
  latest,
  summary,
  snapshotCount,
  summaryError,
  latestPartial,
  currentValue,
  currentValuePartial,
  currentPnl,
  currentPnlRate,
  currentCurrency,
  currencyTotals = [],
  fx,
}: {
  latest: SnapshotRecord | undefined;
  summary: PerformanceSummary | null;
  snapshotCount: number;
  summaryError?: string | undefined;
  latestPartial?: boolean | undefined;
  currentValue?: number | undefined;
  currentValuePartial?: boolean | undefined;
  currentPnl?: number | null | undefined;
  currentPnlRate?: number | null | undefined;
  currentCurrency?: Currency | undefined;
  currencyTotals?: PerformancePortfolioTotal[];
  fx?: PerformanceFxMeta | undefined;
}) {
  const resolvedFx = fx ?? summary?.fx;
  const hasCurrentValue = currentValue !== undefined && Number.isFinite(currentValue);
  const hasSnapshotValue = latest !== undefined && !latest.partial;
  const snapshotPartial = latestPartial ?? latest?.partial === true;
  let assetValue = '—';
  if (hasCurrentValue) assetValue = formatMoney(currentValue, currentCurrency);
  else if (hasSnapshotValue) assetValue = formatMoney(snapshotValue(latest), latest.currency);

  let assetDetail = '暂无即时估值';
  if (currentValuePartial) assetDetail = '当前估值，行情不完整';
  else if (hasCurrentValue) {
    if (
      currentPnl !== null &&
      currentPnl !== undefined &&
      currentPnlRate !== null &&
      currentPnlRate !== undefined
    ) {
      assetDetail = `较持仓成本 ${signedMoney(currentPnl, currentCurrency)} · ${signedPercent(currentPnlRate)}`;
    } else {
      assetDetail = '当前估值';
    }
  } else if (hasSnapshotValue) {
    if (snapshotPartial) {
      assetDetail = `最近完整快照 ${formatDate(latest.capturedAt)} · 最新快照缺行情`;
    } else {
      assetDetail = `最近完整快照 ${formatDate(latest.capturedAt)}`;
    }
  } else if (currencyTotals.length > 1) assetDetail = '分币种估值 · 开启汇率合并查看合计';
  else if (snapshotPartial) assetDetail = '行情不完整，尚无完整估值';
  let assetTone: 'positive' | 'negative' | undefined;
  if (currentPnlRate !== null && currentPnlRate !== undefined) {
    if (currentPnlRate > 0) assetTone = 'positive';
    else if (currentPnlRate < 0) assetTone = 'negative';
  }
  const canCalculateTtwror = summary !== null && summary.ttwror !== null && snapshotCount >= 2;
  let ttwrorValue = '—';
  if (summary && summary.ttwror !== null && snapshotCount >= 2)
    ttwrorValue = `${(summary.ttwror * 100).toFixed(2)}%`;
  let ttwrorDetail = '需要 ≥ 2 个快照';
  if (summaryError) ttwrorDetail = summaryError;
  else if (canCalculateTtwror) ttwrorDetail = '不混入外部现金流';
  else if (summary?.xirrReason) ttwrorDetail = summary.xirrReason;
  if (resolvedFx?.status === 'stale') ttwrorDetail = '按当前汇率回算 · 估算 · 使用陈旧汇率';
  if (resolvedFx?.status === 'blocked') ttwrorDetail = '无法获取汇率，暂不可计算合并收益';
  const canDisplayXirr = summary?.xirr !== null && summary?.xirr !== undefined;
  let xirrValue = '—';
  if (summary && summary.xirr !== null && summary.xirr !== undefined) {
    xirrValue = `${(summary.xirr * 100).toFixed(2)}%`;
  }
  let xirrDetail = '现金流不足或无法收敛';
  if (summaryError) xirrDetail = summaryError;
  else if (canDisplayXirr) xirrDetail = '基于账本现金流';
  else if (snapshotCount < 2) xirrDetail = '需要 ≥ 2 个现金流节点';
  else if (summary?.xirrReason) xirrDetail = summary.xirrReason;
  if (resolvedFx?.status === 'stale') xirrDetail = '按当前汇率回算 · 估算 · 使用陈旧汇率';
  if (resolvedFx?.status === 'blocked') xirrDetail = '无法获取汇率，暂不可计算合并收益';
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <PerformanceKpiCard
          label="总资产"
          value={assetValue}
          detail={assetDetail}
          tone={assetTone}
        />
        <PerformanceKpiCard
          label="时间加权收益率"
          value={ttwrorValue}
          detail={ttwrorDetail}
          tone={undefined}
        />
        <PerformanceKpiCard
          label="资金加权收益率"
          value={xirrValue}
          detail={xirrDetail}
          tone={undefined}
        />
      </div>
      {currencyTotals.length > 1 ? (
        <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="分币种总资产">
          {currencyTotals.map((total) => (
            <Card
              key={total.currency ?? 'unknown'}
              className="rounded-lg border border-border/60 bg-muted/15 py-0 shadow-none ring-0"
            >
              <CardContent className="p-3">
                <p className="m-0 text-xs text-muted-foreground">{total.currency ?? '未知币种'}</p>
                <strong className="mt-1 block text-base font-semibold">
                  {formatMoney(total.marketValue + total.cashValue, total.currency)}
                </strong>
                <p className="m-0 mt-1 text-xs text-muted-foreground">原币种估值</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </>
  );
}

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
  if (row.direction === 'increase' && row.amountGap !== null) {
    return {
      text: `↑ 买入 ${formatMoney(Math.abs(row.amountGap), currency)}`,
      className: 'positive',
    };
  }
  if (row.direction === 'decrease' && row.amountGap !== null) {
    return {
      text: `↓ 减少 ${formatMoney(Math.abs(row.amountGap), currency)}`,
      className: 'negative',
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
  loadState,
  allocationRows,
  rebalanceRows,
  targets,
  dataQuality,
  targetsUnavailable = false,
  portfolioScope = false,
  valuedAt,
  fx,
  currencyTotals = [],
  allocationUnavailable = false,
  targetVersion,
  targetCreatedAt,
  targetSaving = false,
  targetSaveError,
  editDisabled,
  onRetry,
  onSaveTargets,
}: {
  loadState: 'loading' | 'error' | 'stale' | 'empty' | 'ready';
  allocationRows: PerformanceAllocationRecord[];
  rebalanceRows: RebalanceGapRecord[];
  targets: Record<string, number>;
  dataQuality: PerformanceDataQuality;
  targetsUnavailable?: boolean | undefined;
  portfolioScope?: boolean | undefined;
  valuedAt?: string | undefined;
  fx?: PerformanceFxMeta | undefined;
  currencyTotals?: PerformancePortfolioTotal[];
  allocationUnavailable?: boolean;
  targetVersion?: number | undefined;
  targetCreatedAt?: string | undefined;
  targetSaving?: boolean | undefined;
  targetSaveError?: string | null | undefined;
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
  const [editingTargets, setEditingTargets] = useState(false);
  const [draftRows, setDraftRows] = useState<TargetRow[]>([]);
  const requestClose = useDraftCloseGuard({
    open: editingTargets,
    draft: draftRows,
    busy: Boolean(targetSaving),
    onOpenChange: setEditingTargets,
  });
  const beginEdit = () => {
    const existingRows = rowsFromTargets(targets);
    const existingCategories = new Set(
      existingRows.map((row) => normalizeAllocationCategory(row.category)),
    );
    const currentRows = rows
      .filter((row) => !existingCategories.has(row.category))
      .map((row) => ({ id: row.category, category: row.category, percent: null }));
    setDraftRows([...existingRows, ...currentRows]);
    setEditingTargets(true);
  };
  const validation = useMemo(() => validateTargetDraft(draftRows), [draftRows]);
  const updateDraftRow = (id: string, patch: Partial<TargetRow>) => {
    setDraftRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };
  const removeDraftRow = (id: string) => {
    setDraftRows((current) => current.filter((row) => row.id !== id));
  };
  const saveDraft = async () => {
    if (!validation.valid || targetSaving) return;
    const nextTargets = {} as Record<AllocationCategory, number>;
    for (const row of draftRows) {
      const category = normalizeAllocationCategory(row.category);
      if (category && row.percent !== null) nextTargets[category] = row.percent / 100;
    }
    if (await onSaveTargets(nextTargets)) setEditingTargets(false);
  };
  const addDraftCategory = () => {
    const nextCategory = CATEGORY_ORDER.find(
      (category) =>
        !draftRows.some((row) => normalizeAllocationCategory(row.category) === category),
    );
    if (!nextCategory) return;
    setDraftRows((current) => [
      ...current,
      { id: `${nextCategory}-${Date.now()}`, category: nextCategory, percent: null },
    ]);
  };
  let targetButtonLabel = '设置目标';
  if (editingTargets) targetButtonLabel = '取消';
  else if (hasTargets) targetButtonLabel = '调整目标';
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
            估值于 {formatDate(valuedAt)}；现金来自账本现金余额，仅提供建议，不会自动下单。
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
        <Button
          type="button"
          variant={editingTargets ? 'ghost' : 'outline'}
          size="sm"
          className="shrink-0"
          disabled={editDisabled || targetSaving}
          onClick={() => {
            if (editingTargets) void requestClose(false);
            else beginEdit();
          }}
        >
          {targetButtonLabel}
        </Button>
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
      {loadState === 'loading' && rows.length === 0 ? (
        <Skeleton className="h-[120px] w-full rounded-xl" aria-label="配置数据加载中" />
      ) : rows.length > 0 && !allocationUnavailable && !fxBlocked ? (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
          <div className="table-wrap px-4">
            <table className="min-w-[680px] md:min-w-0">
              <thead>
                <tr>
                  <th>分类</th>
                  <th>当前金额</th>
                  <th>当前权重</th>
                  <th>目标权重</th>
                  <th>权重偏差</th>
                  <StickyTableActionHeader>调整</StickyTableActionHeader>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const adjustment = adjustmentLabel(
                    row,
                    weightsUnavailable,
                    targetsUnavailable,
                    displayCurrency,
                  );
                  const draftRow = draftRows.find(
                    (draft) => normalizeAllocationCategory(draft.category) === row.category,
                  );
                  return (
                    <tr key={row.category}>
                      <td>{CATEGORY_LABELS[row.category]}</td>
                      <td className="text-muted-foreground">
                        {formatMoney(row.value, displayCurrency)}
                      </td>
                      <td>
                        <WeightBar
                          value={row.currentWeight}
                          label={`${CATEGORY_LABELS[row.category]}当前权重`}
                          unavailable={weightsUnavailable}
                        />
                      </td>
                      <td>
                        {editingTargets ? (
                          draftRow ? (
                            <div className="flex min-w-40 items-center justify-end gap-1">
                              <Input
                                className="h-8 w-20 text-right"
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={draftRow.percent ?? ''}
                                aria-label={`${CATEGORY_LABELS[row.category]}目标权重百分比`}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  updateDraftRow(draftRow.id, {
                                    percent: value === '' ? null : Number(value),
                                  });
                                }}
                              />
                              <span className="text-xs text-muted-foreground">%</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="px-1.5 text-xs text-muted-foreground"
                                aria-label={`移除${CATEGORY_LABELS[row.category]}目标`}
                                onClick={() => removeDraftRow(draftRow.id)}
                              >
                                移除
                              </Button>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">未设置</span>
                          )
                        ) : (
                          <WeightBar
                            value={row.targetWeight}
                            label={`${CATEGORY_LABELS[row.category]}目标权重`}
                            unavailable={weightsUnavailable}
                          />
                        )}
                      </td>
                      <td>{formatWeight(weightsUnavailable ? null : row.weightGap)}</td>
                      <StickyTableActionCell className={`font-medium ${adjustment.className}`}>
                        {adjustment.text}
                      </StickyTableActionCell>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <Empty
          className="min-h-[120px] rounded-xl border border-border/60 bg-muted/20 px-4 py-6"
          aria-live="polite"
        >
          <EmptyDescription>
            {hasTargets ? '当前范围暂无可估值配置。' : '先设置目标配置，保存后可在这里比较。'}
          </EmptyDescription>
        </Empty>
      )}
      {editingTargets &&
      draftRows.some(
        (draft) =>
          !rows.some((row) => row.category === normalizeAllocationCategory(draft.category)) ||
          allocationUnavailable ||
          fxBlocked,
      ) ? (
        <div className="mt-3 rounded-lg bg-muted/30 p-3">
          <p className="m-0 text-xs text-destructive">
            {validation.unknown ? '旧分类需要重新选择后才能保存。' : '设置分类与目标权重。'}
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {draftRows
              .filter(
                (draft) =>
                  !rows.some(
                    (row) => row.category === normalizeAllocationCategory(draft.category),
                  ) ||
                  allocationUnavailable ||
                  fxBlocked,
              )
              .map((draft) => (
                <div key={draft.id} className="flex items-center gap-2">
                  <Select
                    value={normalizeAllocationCategory(draft.category) ?? ''}
                    onValueChange={(value) => updateDraftRow(draft.id, { category: value ?? '' })}
                  >
                    <SelectTrigger className="min-w-0 flex-1">
                      <SelectValue placeholder={draft.category || '选择分类'}>
                        {CATEGORY_LABELS[draft.category as AllocationCategory] ?? draft.category}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {CATEGORY_ORDER.map((option) => (
                          <SelectItem key={option} value={option}>
                            {CATEGORY_LABELS[option]}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-8 w-20 text-right"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={draft.percent ?? ''}
                    aria-label={`${CATEGORY_LABELS[draft.category as AllocationCategory] ?? '旧分类'}目标权重百分比`}
                    onChange={(event) => {
                      const value = event.target.value;
                      updateDraftRow(draft.id, { percent: value === '' ? null : Number(value) });
                    }}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="px-1.5 text-xs text-muted-foreground"
                    onClick={() => removeDraftRow(draft.id)}
                  >
                    移除
                  </Button>
                </div>
              ))}
          </div>
        </div>
      ) : null}
      {editingTargets ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/30 p-3">
          <div className="text-sm">
            <span>合计 {validation.total.toFixed(2)}%</span>
            {validation.totalValid ? (
              <span className="ml-2 positive">已完成</span>
            ) : (
              <span className="ml-2 text-destructive">
                目标权重合计 {validation.total.toFixed(2)}%，请调整至 100%。
              </span>
            )}
            {validation.duplicate ? (
              <p className="m-0 mt-1 text-xs text-destructive">分类不能重复。</p>
            ) : null}
            {validation.unknown ? (
              <p className="m-0 mt-1 text-xs text-destructive">存在未知旧分类，请重新选择。</p>
            ) : null}
            {validation.invalidNumber ? (
              <p className="m-0 mt-1 text-xs text-destructive">请输入非负数字。</p>
            ) : null}
            {targetSaveError ? (
              <p className="m-0 mt-1 text-xs text-destructive">{targetSaveError}</p>
            ) : null}
          </div>
          <PerformanceTargetActions
            saving={Boolean(targetSaving)}
            valid={validation.valid}
            onCancel={() => void requestClose(false)}
            onSave={() => void saveDraft()}
          />
          <Button
            type="button"
            variant="link"
            size="sm"
            className="basis-full justify-start px-0"
            onClick={addDraftCategory}
          >
            <Plus data-icon="inline-start" aria-hidden="true" />
            新增分类
          </Button>
        </div>
      ) : null}
    </section>
  );
}

const rowsFromTargets = (targets: Record<string, number> | undefined): TargetRow[] => {
  const known = new Map<AllocationCategory, number>();
  const unknown: TargetRow[] = [];
  for (const [index, [rawCategory, value]] of Object.entries(targets ?? {}).entries()) {
    const category = normalizeAllocationCategory(rawCategory);
    if (!category) {
      unknown.push({ id: `${rawCategory}-${index}`, category: rawCategory, percent: value * 100 });
      continue;
    }
    known.set(category, (known.get(category) ?? 0) + value * 100);
  }
  return [
    ...CATEGORY_ORDER.filter((category) => known.has(category)).map((category) => ({
      id: category,
      category,
      percent: known.get(category) ?? 0,
    })),
    ...unknown,
  ];
};
