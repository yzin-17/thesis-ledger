import { useEffect, useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Progress, ProgressIndicator, ProgressTrack } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import { normalizeAllocationCategory, normalizeAllocationTargets } from '@thesis-ledger/domain';

import type { Account } from '../portfolio/portfolio.types.js';
import { money, isDataLoaded } from '../shared/display.js';
import { EmptyTableRow } from '../shared/EmptyStates.js';
import { DataStateBanner, Metric } from '../shared/DesktopPrimitives.js';
import type {
  AllocationCategory,
  PerformanceAllocationRecord,
  PerformanceDataQuality,
  PerformanceSummary,
  PortfolioMode,
  RebalanceGapRecord,
  SnapshotRecord,
} from './performance.types.js';

const ALL_ACCOUNTS_VALUE = '__all_accounts__';
const CATEGORY_ORDER: AllocationCategory[] = ['stock', 'etf', 'fund', 'index', 'cash'];
const CATEGORY_LABELS: Record<AllocationCategory, string> = {
  stock: '股票',
  etf: 'ETF',
  fund: '基金',
  index: '指数',
  cash: '现金',
};

const categoryLabel = (value: string) => {
  const category = normalizeAllocationCategory(value);
  return category ? CATEGORY_LABELS[category] : value;
};

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
    return <span>{formatWeight(null)}</span>;
  }
  const progressValue = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="min-w-24">
      <div className="mb-1 text-right text-xs text-muted-foreground">{formatWeight(value)}</div>
      <Progress value={progressValue} aria-label={`${label}${formatWeight(value)}`}>
        <ProgressTrack>
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

const snapshotTimeLabel = (value?: string | null) => (value ? formatDate(value) : '尚无收益历史');

export function PerformanceAccountSelector({
  accounts,
  mode,
  accountId,
  mixedCurrencies,
  latestSnapshotAt,
  valuedAt,
  onModeChange,
  onAccountChange,
}: {
  accounts: Account[];
  mode: PortfolioMode;
  accountId: string;
  mixedCurrencies: boolean;
  latestSnapshotAt?: string | undefined;
  valuedAt?: string | undefined;
  onModeChange: (mode: PortfolioMode) => void;
  onAccountChange: (accountId: string) => void;
}) {
  const modeAccounts = accounts.filter(
    (account) => account.mode === mode && account.active !== false,
  );
  const selectedAccount = modeAccounts.find((account) => account.id === accountId);
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
      <div className="flex min-h-9 items-center">
        <Tabs
          value={mode}
          onValueChange={(value) => onModeChange(value as PortfolioMode)}
          aria-label="收益范围"
        >
          <TabsList variant="line">
            <TabsTrigger value="actual">实际组合</TabsTrigger>
            <TabsTrigger value="shadow">影子组合</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <label className="inline-control min-w-56">
        <span>账户范围</span>
        <Select
          value={accountId || ALL_ACCOUNTS_VALUE}
          onValueChange={(value) => {
            onAccountChange(value === ALL_ACCOUNTS_VALUE ? '' : (value ?? ''));
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue>{selectedAccount?.name ?? '全部账户'}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL_ACCOUNTS_VALUE} disabled={mixedCurrencies}>
                全部账户
              </SelectItem>
              {modeAccounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name} · {account.currency}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </label>
      <div className="min-w-64 text-sm text-muted-foreground">
        <p>收益截止：{snapshotTimeLabel(latestSnapshotAt)}</p>
        <p>配置估值：{formatDate(valuedAt)}</p>
      </div>
      {mixedCurrencies ? (
        <p className="max-w-xl text-sm text-muted-foreground">
          当前模式包含多个币种。没有 FX 契约，不能直接合并金额，请选择单个账户。
        </p>
      ) : null}
    </div>
  );
}

export function PerformanceMetrics({
  latest,
  summary,
  snapshotCount,
  summaryError,
  latestPartial,
}: {
  latest: SnapshotRecord | undefined;
  summary: PerformanceSummary | null;
  snapshotCount: number;
  summaryError?: string | undefined;
  latestPartial?: boolean | undefined;
}) {
  let latestValue = '—';
  let latestDetail = '尚无 Snapshot';
  const hasPartialLatest = latestPartial ?? latest?.partial === true;
  if (latest?.partial === true) {
    latestDetail = '行情不完整，暂不显示总资产';
  } else if (latest) {
    latestValue = money.format(latest.marketValue + latest.cashValue);
    latestDetail = hasPartialLatest
      ? `最近 Snapshot 行情不完整；显示最近完整 Snapshot ${formatDate(latest.capturedAt)}`
      : `Snapshot 截止 ${formatDate(latest.capturedAt)}`;
  } else if (hasPartialLatest) {
    latestDetail = '行情不完整，尚无完整 Snapshot';
  }
  const canCalculateTtwror = summary !== null && snapshotCount >= 2;
  const ttwrorValue = canCalculateTtwror ? `${(summary.ttwror * 100).toFixed(2)}%` : '—';
  let ttwrorDetail = '至少需要两个完整快照';
  if (summaryError) ttwrorDetail = summaryError;
  else if (canCalculateTtwror) ttwrorDetail = '时间加权收益，不混入外部现金流';
  const xirrValue =
    summary?.xirr === null || summary?.xirr === undefined
      ? '—'
      : `${(summary.xirr * 100).toFixed(2)}%`;
  const xirrDetail = summary?.xirrReason ?? summaryError ?? '现金流不足或无法收敛';
  return (
    <div className="metrics">
      <Metric label="最新总资产" value={latestValue} detail={latestDetail} />
      <Metric label="TTWROR" value={ttwrorValue} detail={ttwrorDetail} />
      <Metric label="XIRR" value={xirrValue} detail={xirrDetail} />
    </div>
  );
}

export function PerformanceSnapshotTable({
  loadState,
  snapshots,
  refreshing,
  onRetry,
}: {
  loadState: 'loading' | 'error' | 'stale' | 'empty' | 'ready';
  snapshots: SnapshotRecord[];
  refreshing?: boolean;
  onRetry?: (() => void) | undefined;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>历史 Snapshot</h2>
          <p>市值、成本、现金和数据时点可回放。</p>
        </div>
        {refreshing ? <Badge variant="secondary">正在更新</Badge> : null}
      </div>
      {loadState !== 'ready' && loadState !== 'empty' && loadState !== 'loading' ? (
        <DataStateBanner state={loadState} onRetry={onRetry} />
      ) : null}
      {loadState === 'loading' && snapshots.length === 0 ? (
        <Skeleton className="h-28 w-full" aria-label="历史 Snapshot 加载中" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>市值</th>
                <th>成本</th>
                <th>现金</th>
                <th>质量</th>
              </tr>
            </thead>
            <tbody>
              {isDataLoaded(loadState) && snapshots.length === 0 ? (
                <EmptyTableRow colSpan={5} />
              ) : (
                snapshots.map((snapshot) => (
                  <tr key={snapshot.id}>
                    <td>{formatDate(snapshot.capturedAt)}</td>
                    <td>{money.format(snapshot.marketValue)}</td>
                    <td>{money.format(snapshot.costValue)}</td>
                    <td>{money.format(snapshot.cashValue)}</td>
                    <td>
                      {snapshot.partial ? (
                        <Badge variant="destructive">缺行情</Badge>
                      ) : (
                        <Badge variant="secondary">完整</Badge>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
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

const directionLabel = (direction: ComparisonRow['direction']) => {
  if (direction === 'increase') return '增配';
  if (direction === 'decrease') return '减配';
  if (direction === 'balanced') return '平衡';
  return '—';
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
  valuedAt,
  editDisabled,
  onRetry,
  onEditTargets,
}: {
  loadState: 'loading' | 'error' | 'stale' | 'empty' | 'ready';
  allocationRows: PerformanceAllocationRecord[];
  rebalanceRows: RebalanceGapRecord[];
  targets: Record<string, number>;
  dataQuality: PerformanceDataQuality;
  targetsUnavailable?: boolean | undefined;
  valuedAt?: string | undefined;
  editDisabled?: boolean | undefined;
  onRetry?: (() => void) | undefined;
  onEditTargets: () => void;
}) {
  const rows = comparisonRows(allocationRows, rebalanceRows, targets);
  const hasTargets = !targetsUnavailable && Object.keys(targets).length > 0;
  const weightsUnavailable = dataQuality.partial || targetsUnavailable;
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>当前配置与目标</h2>
          <p>
            配置估值于 {formatDate(valuedAt)}；现金来自 Ledger Cash
            Balance，仅提供建议，不会自动下单。
          </p>
        </div>
        <Button type="button" variant="outline" disabled={editDisabled} onClick={onEditTargets}>
          {hasTargets ? '调整目标' : '设置目标'}
        </Button>
      </div>
      {dataQuality.partial ? (
        <Alert variant="default" className="mb-4">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>行情不完整</AlertTitle>
          <AlertDescription>
            已保留可用金额，但权重暂不可用，再平衡建议已暂停。缺失标的或类别：
            {dataQuality.missingSymbols.length > 0
              ? dataQuality.missingSymbols.join('、')
              : '未返回'}
            。
          </AlertDescription>
        </Alert>
      ) : null}
      {targetsUnavailable ? (
        <Alert variant="default" className="mb-4">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>目标配置不可用</AlertTitle>
          <AlertDescription>
            当前配置仍可查看，但目标权重和再平衡建议暂不可用。请先重新加载目标配置。
          </AlertDescription>
        </Alert>
      ) : null}
      {loadState !== 'ready' && loadState !== 'empty' && loadState !== 'loading' ? (
        <DataStateBanner state={loadState} onRetry={onRetry} />
      ) : null}
      {loadState === 'loading' && rows.length === 0 ? (
        <Skeleton className="h-28 w-full" aria-label="配置数据加载中" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>分类</th>
                <th>当前金额</th>
                <th>当前权重</th>
                <th>目标权重</th>
                <th>权重偏差</th>
                <th>缺口金额</th>
                <th>建议</th>
              </tr>
            </thead>
            <tbody>
              {isDataLoaded(loadState) && rows.length === 0 ? (
                <EmptyTableRow colSpan={7} />
              ) : (
                rows.map((row) => {
                  let recommendation = directionLabel(row.direction);
                  if (dataQuality.partial) recommendation = '暂停';
                  else if (targetsUnavailable) recommendation = '不可用';
                  return (
                    <tr key={row.category}>
                      <td>{CATEGORY_LABELS[row.category]}</td>
                      <td>{money.format(row.value)}</td>
                      <td>
                        <WeightBar
                          value={row.currentWeight}
                          label={`${CATEGORY_LABELS[row.category]}当前权重`}
                          unavailable={weightsUnavailable}
                        />
                      </td>
                      <td>
                        <WeightBar
                          value={row.targetWeight}
                          label={`${CATEGORY_LABELS[row.category]}目标权重`}
                          unavailable={weightsUnavailable}
                        />
                      </td>
                      <td>{formatWeight(weightsUnavailable ? null : row.weightGap)}</td>
                      <td>
                        {weightsUnavailable || row.amountGap === null
                          ? '—'
                          : money.format(Math.abs(row.amountGap))}
                      </td>
                      <td>
                        <Badge
                          variant={
                            row.direction === 'balanced' &&
                            !dataQuality.partial &&
                            !targetsUnavailable
                              ? 'secondary'
                              : 'outline'
                          }
                        >
                          {recommendation}
                        </Badge>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type TargetRow = { id: string; category: string; percent: number | null };

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

const rowsKey = (rows: TargetRow[]) =>
  JSON.stringify(rows.map(({ category, percent }) => ({ category, percent })));

export function PerformanceTargetSheet({
  open,
  onOpenChange,
  targets,
  version,
  createdAt,
  saving,
  error,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targets: Record<string, number> | undefined;
  version?: number | undefined;
  createdAt?: string | undefined;
  saving: boolean;
  error?: string | null | undefined;
  onSave: (targets: Record<AllocationCategory, number>) => Promise<void>;
}) {
  const [rows, setRows] = useState<TargetRow[]>([]);
  const [baseline, setBaseline] = useState('[]');
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    if (!open) return;
    const nextRows = rowsFromTargets(targets);
    setRows(nextRows);
    setBaseline(rowsKey(nextRows));
    setConfirmClose(false);
  }, [open, targets]);

  const dirty = rowsKey(rows) !== baseline;
  const validation = useMemo(() => {
    const categories = rows.map((row) => normalizeAllocationCategory(row.category));
    const duplicate = categories.some(
      (category, index) => category !== null && categories.indexOf(category) !== index,
    );
    const unknown = rows.some((row) => normalizeAllocationCategory(row.category) === null);
    const invalidNumber = rows.some(
      (row) => row.percent === null || !Number.isFinite(row.percent) || row.percent < 0,
    );
    const total = rows.reduce(
      (sum, row) => sum + (row.percent !== null && Number.isFinite(row.percent) ? row.percent : 0),
      0,
    );
    const totalValid = Math.abs(total - 100) < 0.001;
    return {
      duplicate,
      unknown,
      invalidNumber,
      total,
      totalValid,
      valid: rows.length > 0 && !duplicate && !unknown && !invalidNumber && totalValid,
    };
  }, [rows]);

  const requestClose = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    if (dirty) {
      setConfirmClose(true);
      return;
    }
    onOpenChange(false);
  };

  const updateRow = (id: string, patch: Partial<TargetRow>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const submit = async () => {
    if (!validation.valid) return;
    const nextTargets = {} as Record<AllocationCategory, number>;
    for (const row of rows) {
      const category = normalizeAllocationCategory(row.category);
      if (category && row.percent !== null) nextTargets[category] = row.percent / 100;
    }
    await onSave(nextTargets);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={requestClose}>
        <SheetContent side="right" className="w-full sm:max-w-[520px]">
          <SheetHeader>
            <SheetTitle>目标配置</SheetTitle>
            <SheetDescription>
              用配置类别设置权重。现金来自 Ledger Cash Balance，指数目标可以在没有持仓时保存。
            </SheetDescription>
            <p className="text-xs text-muted-foreground">
              当前版本：{version === undefined ? '尚未保存' : `v${version}`} · 生效时间：
              {formatDate(createdAt)}
            </p>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4">
            <FieldGroup>
              {rows.map((row) => {
                const category = normalizeAllocationCategory(row.category);
                const duplicate =
                  category !== null &&
                  rows.some(
                    (other) =>
                      other.id !== row.id &&
                      normalizeAllocationCategory(other.category) === category,
                  );
                let rowError: string | undefined;
                if (!category) {
                  rowError = '需要重新选择分类';
                } else if (duplicate) {
                  rowError = '分类不能重复';
                } else if (
                  row.percent === null ||
                  !Number.isFinite(row.percent) ||
                  row.percent < 0
                ) {
                  rowError = '请输入非负数字';
                }
                return (
                  <Field key={row.id} invalid={Boolean(rowError)}>
                    <div className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-end gap-2">
                      <div>
                        <FieldLabel>分类</FieldLabel>
                        <Select
                          value={category}
                          onValueChange={(value) => updateRow(row.id, { category: value ?? '' })}
                        >
                          <SelectTrigger aria-invalid={Boolean(rowError)} className="w-full">
                            <SelectValue>
                              {category ? CATEGORY_LABELS[category] : row.category || '选择分类'}
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
                      </div>
                      <div>
                        <FieldLabel>权重 %</FieldLabel>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={row.percent ?? ''}
                          aria-label="权重百分比"
                          aria-invalid={Boolean(rowError)}
                          onChange={(event) => {
                            const value = event.target.value;
                            updateRow(row.id, { percent: value === '' ? null : Number(value) });
                          }}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`删除${categoryLabel(row.category)}目标`}
                        onClick={() =>
                          setRows((current) => current.filter((item) => item.id !== row.id))
                        }
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                    <FieldError>{rowError}</FieldError>
                  </Field>
                );
              })}
            </FieldGroup>
            <Button
              type="button"
              variant="outline"
              className="mt-4 w-full"
              onClick={() => {
                const next = CATEGORY_ORDER.find(
                  (category) =>
                    !rows.some((row) => normalizeAllocationCategory(row.category) === category),
                );
                setRows((current) => [
                  ...current,
                  { id: `${next ?? 'custom'}-${Date.now()}`, category: next ?? '', percent: 0 },
                ]);
              }}
            >
              <Plus data-icon="inline-start" aria-hidden="true" />
              新增分类
            </Button>
            <div className="mt-4 rounded-md border border-border bg-muted/30 p-3 text-sm">
              当前合计 <strong>{validation.total.toFixed(2)}%</strong>，
              {(() => {
                if (validation.total < 100) return `还差 ${(100 - validation.total).toFixed(2)}%`;
                if (validation.total > 100) return `超出 ${(validation.total - 100).toFixed(2)}%`;
                return '已完成';
              })()}
            </div>
            {validation.unknown ? (
              <p className="mt-2 text-sm text-destructive">存在未知旧分类，请重新选择后保存。</p>
            ) : null}
            {validation.duplicate ? (
              <p className="mt-2 text-sm text-destructive">存在重复分类，请合并后保存。</p>
            ) : null}
            {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
          </div>
          <SheetFooter>
            <Button
              type="button"
              disabled={!validation.valid || saving}
              onClick={() => void submit()}
            >
              {saving ? (
                <LoaderCircle
                  data-icon="inline-start"
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              {saving ? '保存中…' : '保存目标'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>放弃未保存修改？</AlertDialogTitle>
            <AlertDialogDescription>
              当前目标草稿尚未保存，关闭后这些修改会丢失。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>继续编辑</AlertDialogClose>
            <AlertDialogClose
              render={
                <Button
                  variant="destructive"
                  onClick={() => {
                    setConfirmClose(false);
                    onOpenChange(false);
                  }}
                />
              }
            >
              放弃修改
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
