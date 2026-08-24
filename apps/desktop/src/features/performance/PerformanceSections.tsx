import { useMemo, useState, type ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Progress, ProgressIndicator, ProgressTrack } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AlertTriangle, LoaderCircle, Plus } from 'lucide-react';
import { normalizeAllocationCategory, normalizeAllocationTargets } from '@thesis-ledger/domain';

import type { Account } from '../portfolio/portfolio.types.js';
import { money } from '../shared/display.js';
import { DataStateBanner } from '../shared/DesktopPrimitives.js';
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

const signedMoney = (value: number) =>
  value >= 0 ? `+${money.format(value)}` : money.format(value);

const signedPercent = (value: number) => {
  const formatted = `${Math.abs(value * 100).toFixed(2)}%`;
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
};

type SnapshotRange = '1M' | '3M' | 'YTD' | '1Y' | 'ALL';

const snapshotRangeOptions: Array<{ value: SnapshotRange; label: string }> = [
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: 'YTD', label: 'YTD' },
  { value: '1Y', label: '1Y' },
  { value: 'ALL', label: '全部' },
];

const snapshotsForRange = (snapshots: SnapshotRecord[], range: SnapshotRange) => {
  if (range === 'ALL' || snapshots.length === 0) return snapshots;
  const anchor = new Date(snapshots.at(-1)?.capturedAt ?? '');
  if (Number.isNaN(anchor.getTime())) return snapshots;
  const cutoff = new Date(anchor);
  if (range === 'YTD') {
    cutoff.setMonth(0, 1);
    cutoff.setHours(0, 0, 0, 0);
  } else {
    let months = 12;
    if (range === '1M') months = 1;
    else if (range === '3M') months = 3;
    cutoff.setMonth(cutoff.getMonth() - months);
  }
  return snapshots.filter((snapshot) => new Date(snapshot.capturedAt) >= cutoff);
};

const PerformanceHistoryChart = ({ snapshots }: { snapshots: SnapshotRecord[] }) => {
  const values = snapshots.map(snapshotValue);
  const width = 640;
  const height = 220;
  const padding = { top: 18, right: 18, bottom: 28, left: 18 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = Math.max(maxValue - minValue, 1);
  const points = values.map((value, index) => {
    let x = padding.left + (index / (snapshots.length - 1)) * chartWidth;
    if (snapshots.length === 1) x = padding.left + chartWidth / 2;
    const y = padding.top + (1 - (value - minValue) / valueRange) * chartHeight;
    return { x, y };
  });
  const pointsValue = points.map((point) => `${point.x},${point.y}`).join(' ');
  const first = snapshots[0];
  const last = snapshots.at(-1);

  return (
    <div className="rounded-lg bg-muted/30 px-3 py-3" aria-label="资产走势">
      <svg
        className="h-52 w-full text-primary"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Snapshot 资产价值走势"
      >
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={height - padding.bottom}
          y2={height - padding.bottom}
          className="stroke-border"
          strokeWidth="1"
        />
        <polyline
          points={pointsValue}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
        {points.map((point, index) => (
          <circle
            key={`${snapshots[index]?.id ?? index}`}
            cx={point.x}
            cy={point.y}
            r="4"
            fill="currentColor"
          />
        ))}
      </svg>
      <div className="flex justify-between gap-3 text-xs text-muted-foreground">
        <span>{first ? formatDate(first.capturedAt) : '尚无数据时点'}</span>
        <span>
          {last ? `${formatDate(last.capturedAt)} · ${money.format(snapshotValue(last))}` : ''}
        </span>
      </div>
    </div>
  );
};

export function PerformanceAccountSelector({
  accounts,
  mode,
  accountId,
  mixedCurrencies,
  latestSnapshotAt,
  valuedAt,
  onAccountChange,
}: {
  accounts: Account[];
  mode: PortfolioMode;
  accountId: string;
  mixedCurrencies: boolean;
  latestSnapshotAt?: string | undefined;
  valuedAt?: string | undefined;
  onAccountChange: (accountId: string) => void;
}) {
  const modeAccounts = accounts.filter(
    (account) => account.mode === mode && account.active !== false,
  );
  const selectedAccount = modeAccounts.find((account) => account.id === accountId);
  const statusDate = latestSnapshotAt ?? valuedAt;
  const statusLabel = statusDate
    ? `数据截至 ${formatDate(statusDate)} · ${latestSnapshotAt ? '有收益快照' : '暂无收益快照'}`
    : '数据截至 -- · 暂无估值快照';
  return (
    <div className="flex flex-wrap items-end gap-4 border-b border-border/70 pb-3">
      <label className="flex min-w-0 basis-full items-center gap-2 text-sm text-muted-foreground md:flex-1 md:basis-auto md:max-w-md">
        <span className="shrink-0">账户</span>
        <Select
          value={accountId || ALL_ACCOUNTS_VALUE}
          onValueChange={(value) => {
            onAccountChange(value === ALL_ACCOUNTS_VALUE ? '' : (value ?? ''));
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {mixedCurrencies && !accountId ? '请选择账户' : (selectedAccount?.name ?? '全部账户')}
            </SelectValue>
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
      <p className="m-0 basis-full text-xs text-muted-foreground md:basis-auto md:ml-auto">
        {statusLabel}
      </p>
      {mixedCurrencies ? (
        <p className="basis-full m-0 text-xs text-destructive">
          当前模式包含多个币种。没有 FX 契约，不能直接合并金额，请选择单个账户。
        </p>
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
  <Card className="rounded-lg border-0 bg-muted/35 py-0 shadow-none ring-0">
    <CardContent className="p-4">
      <p className="m-0 text-xs text-muted-foreground">{label}</p>
      <strong className="mt-3 block text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </strong>
      <p className={tone ? `m-0 mt-2 text-xs ${tone}` : 'm-0 mt-2 text-xs text-muted-foreground'}>
        {detail}
      </p>
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
}) {
  const hasCurrentValue = currentValue !== undefined && Number.isFinite(currentValue);
  const hasSnapshotValue = latest !== undefined && !latest.partial;
  const snapshotPartial = latestPartial ?? latest?.partial === true;
  let assetValue = '—';
  if (hasCurrentValue) assetValue = money.format(currentValue);
  else if (hasSnapshotValue) assetValue = money.format(snapshotValue(latest));

  let assetDetail = '暂无即时估值';
  if (currentValuePartial) assetDetail = '当前估值，行情不完整';
  else if (hasCurrentValue) {
    if (
      currentPnl !== null &&
      currentPnl !== undefined &&
      currentPnlRate !== null &&
      currentPnlRate !== undefined
    ) {
      assetDetail = `较持仓成本 ${signedMoney(currentPnl)} · ${signedPercent(currentPnlRate)}`;
    } else {
      assetDetail = '当前估值';
    }
  } else if (hasSnapshotValue) {
    if (snapshotPartial) {
      assetDetail = `最近完整 Snapshot ${formatDate(latest.capturedAt)} · 最新快照缺行情`;
    } else {
      assetDetail = `最近完整 Snapshot ${formatDate(latest.capturedAt)}`;
    }
  } else if (snapshotPartial) assetDetail = '行情不完整，尚无完整估值';
  let assetTone: 'positive' | 'negative' | undefined;
  if (currentPnlRate !== null && currentPnlRate !== undefined) {
    if (currentPnlRate > 0) assetTone = 'positive';
    else if (currentPnlRate < 0) assetTone = 'negative';
  }
  const canCalculateTtwror = summary !== null && snapshotCount >= 2;
  let ttwrorValue = '—';
  if (canCalculateTtwror) ttwrorValue = `${(summary.ttwror * 100).toFixed(2)}%`;
  let ttwrorDetail = '需要 ≥ 2 个快照';
  if (summaryError) ttwrorDetail = summaryError;
  else if (canCalculateTtwror) ttwrorDetail = '不混入外部现金流';
  const canDisplayXirr = summary?.xirr !== null && summary?.xirr !== undefined;
  let xirrValue = '—';
  if (summary && summary.xirr !== null && summary.xirr !== undefined) {
    xirrValue = `${(summary.xirr * 100).toFixed(2)}%`;
  }
  let xirrDetail = '现金流不足或无法收敛';
  if (summaryError) xirrDetail = summaryError;
  else if (canDisplayXirr) xirrDetail = '基于 Ledger 现金流';
  else if (snapshotCount < 2) xirrDetail = '需要 ≥ 2 个现金流节点';
  else if (summary?.xirrReason) xirrDetail = summary.xirrReason;
  return (
    <div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <PerformanceKpiCard label="总资产" value={assetValue} detail={assetDetail} tone={assetTone} />
      <PerformanceKpiCard
        label="TTWROR"
        value={ttwrorValue}
        detail={ttwrorDetail}
        tone={undefined}
      />
      <PerformanceKpiCard label="XIRR" value={xirrValue} detail={xirrDetail} tone={undefined} />
    </div>
  );
}

export function PerformanceSnapshotTable({
  loadState,
  snapshots,
  refreshing,
  onRetry,
  onCompleteDataSetup,
}: {
  loadState: 'loading' | 'error' | 'stale' | 'empty' | 'ready';
  snapshots: SnapshotRecord[];
  refreshing?: boolean;
  onRetry?: (() => void) | undefined;
  onCompleteDataSetup?: (() => void) | undefined;
}) {
  const hasSnapshots = snapshots.length > 0;
  const [range, setRange] = useState<SnapshotRange>('ALL');
  const [showCalculationInfo, setShowCalculationInfo] = useState(false);
  const visibleSnapshots = useMemo(() => snapshotsForRange(snapshots, range), [snapshots, range]);
  let content: ReactNode;
  if (loadState === 'loading' && !hasSnapshots) {
    content = <Skeleton className="h-52 w-full rounded-lg" aria-label="资产走势加载中" />;
  } else if (hasSnapshots && visibleSnapshots.length > 0) {
    content = (
      <>
        <PerformanceHistoryChart snapshots={visibleSnapshots} />
        <details className="mt-3 rounded-lg bg-muted/20 px-3 py-2 text-sm">
          <summary className="cursor-pointer text-muted-foreground">查看 Snapshot 明细</summary>
          <div className="table-wrap mt-2">
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
                {visibleSnapshots.map((snapshot) => (
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
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </>
    );
  } else if (hasSnapshots) {
    content = (
      <Empty className="min-h-20 rounded-lg border-0 bg-muted/30 px-4 py-6" aria-live="polite">
        <EmptyDescription>该时间范围暂无 Snapshot。</EmptyDescription>
      </Empty>
    );
  } else {
    content = (
      <Empty
        className="items-start rounded-lg border-0 bg-muted/30 px-5 py-6 text-left"
        aria-live="polite"
      >
        <EmptyTitle>暂无收益历史</EmptyTitle>
        <EmptyDescription>
          创建第一个 Snapshot 后即可查看资产曲线、TTWROR 和 XIRR。
        </EmptyDescription>
        <div className="flex flex-wrap items-center gap-2">
          {onCompleteDataSetup ? (
            <Button type="button" size="sm" onClick={onCompleteDataSetup}>
              完成数据配置
            </Button>
          ) : null}
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => setShowCalculationInfo((current) => !current)}
          >
            了解收益计算
          </Button>
        </div>
        {showCalculationInfo ? (
          <p className="m-0 text-xs text-muted-foreground" role="note">
            TTWROR 使用完整 Snapshot 计算，XIRR 还会结合 Ledger 的外部现金流。
          </p>
        ) : null}
      </Empty>
    );
  }
  return (
    <section className="mt-8">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-xl font-semibold tracking-tight">资产走势</h2>
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            市值、现金和数据时点按 Snapshot 回放。
          </p>
        </div>
        {hasSnapshots ? (
          <ToggleGroup
            value={[range]}
            aria-label="收益走势时间范围"
            onValueChange={(value) => {
              const nextRange = value[0] as SnapshotRange | undefined;
              if (nextRange) setRange(nextRange);
            }}
          >
            {snapshotRangeOptions.map((option) => (
              <ToggleGroupItem key={option.value} value={option.value} aria-label={option.label}>
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : null}
        {refreshing ? <Badge variant="secondary">正在更新</Badge> : null}
      </div>
      {loadState !== 'ready' && loadState !== 'empty' && loadState !== 'loading' ? (
        <DataStateBanner state={loadState} onRetry={onRetry} />
      ) : null}
      {content}
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

const adjustmentLabel = (
  row: ComparisonRow,
  weightsUnavailable: boolean,
  targetsUnavailable: boolean,
) => {
  if (weightsUnavailable) return { text: '暂不可用', className: 'text-muted-foreground' };
  if (targetsUnavailable) return { text: '目标不可用', className: 'text-muted-foreground' };
  if (row.direction === 'increase' && row.amountGap !== null) {
    return { text: `↑ 买入 ${money.format(Math.abs(row.amountGap))}`, className: 'positive' };
  }
  if (row.direction === 'decrease' && row.amountGap !== null) {
    return { text: `↓ 减少 ${money.format(Math.abs(row.amountGap))}`, className: 'negative' };
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
  valuedAt,
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
  valuedAt?: string | undefined;
  targetVersion?: number | undefined;
  targetCreatedAt?: string | undefined;
  targetSaving?: boolean | undefined;
  targetSaveError?: string | null | undefined;
  editDisabled?: boolean | undefined;
  onRetry?: (() => void) | undefined;
  onSaveTargets: (targets: Record<AllocationCategory, number>) => Promise<boolean>;
}) {
  const rows = comparisonRows(allocationRows, rebalanceRows, targets);
  const hasTargets = !targetsUnavailable && Object.keys(targets).length > 0;
  const weightsUnavailable = dataQuality.partial || targetsUnavailable;
  const [editingTargets, setEditingTargets] = useState(false);
  const [draftRows, setDraftRows] = useState<TargetRow[]>([]);
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
  const validation = useMemo(() => {
    const categories = draftRows.map((row) => normalizeAllocationCategory(row.category));
    const duplicate = categories.some(
      (category, index) => category !== null && categories.indexOf(category) !== index,
    );
    const unknown = categories.some((category) => category === null);
    const invalidNumber = draftRows.some(
      (row) => row.percent === null || !Number.isFinite(row.percent) || row.percent < 0,
    );
    const total = draftRows.reduce(
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
      valid: draftRows.length > 0 && !duplicate && !unknown && !invalidNumber && totalValid,
    };
  }, [draftRows]);
  const updateDraftRow = (id: string, patch: Partial<TargetRow>) => {
    setDraftRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };
  const removeDraftRow = (id: string) => {
    setDraftRows((current) => current.filter((row) => row.id !== id));
  };
  const saveDraft = async () => {
    if (!validation.valid) return;
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
  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-xl font-semibold tracking-tight">配置与目标</h2>
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            估值于 {formatDate(valuedAt)}；现金来自 Ledger Cash Balance，仅提供建议，不会自动下单。
          </p>
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
          disabled={editDisabled}
          onClick={() => {
            if (editingTargets) setEditingTargets(false);
            else beginEdit();
          }}
        >
          {targetButtonLabel}
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
        <Skeleton className="h-32 w-full rounded-lg" aria-label="配置数据加载中" />
      ) : rows.length > 0 ? (
        <div className="table-wrap">
          <table className="min-w-[680px] md:min-w-0">
            <thead>
              <tr>
                <th>分类</th>
                <th>当前金额</th>
                <th>当前权重</th>
                <th>目标权重</th>
                <th>权重偏差</th>
                <th>调整</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const adjustment = adjustmentLabel(row, weightsUnavailable, targetsUnavailable);
                const draftRow = draftRows.find(
                  (draft) => normalizeAllocationCategory(draft.category) === row.category,
                );
                return (
                  <tr key={row.category}>
                    <td>{CATEGORY_LABELS[row.category]}</td>
                    <td className="text-muted-foreground">{money.format(row.value)}</td>
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
                    <td className={`font-medium ${adjustment.className}`}>{adjustment.text}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty className="min-h-20 rounded-lg border-0 bg-muted/30 px-4 py-6" aria-live="polite">
          <EmptyDescription>
            {hasTargets ? '当前范围暂无可估值配置。' : '先设置目标配置，保存后可在这里比较。'}
          </EmptyDescription>
        </Empty>
      )}
      {editingTargets && validation.unknown ? (
        <div className="mt-3 rounded-lg bg-muted/30 p-3">
          <p className="m-0 text-xs text-destructive">旧分类需要重新选择后才能保存。</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {draftRows
              .filter((draft) => normalizeAllocationCategory(draft.category) === null)
              .map((draft) => (
                <div key={draft.id} className="flex items-center gap-2">
                  <Select
                    value=""
                    onValueChange={(value) => updateDraftRow(draft.id, { category: value ?? '' })}
                  >
                    <SelectTrigger className="min-w-0 flex-1">
                      <SelectValue placeholder={draft.category || '选择分类'} />
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
                    aria-label="旧分类目标权重百分比"
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
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditingTargets(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!validation.valid || targetSaving}
              onClick={() => void saveDraft()}
            >
              {targetSaving ? (
                <LoaderCircle
                  data-icon="inline-start"
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              保存目标
            </Button>
          </div>
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
