import { useMemo, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
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
  PerformanceFxMeta,
  PerformancePortfolioTotal,
  PerformanceSummary,
  PortfolioMode,
  RebalanceGapRecord,
  SnapshotRecord,
  Currency,
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
        aria-label="快照资产价值走势"
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
          {last
            ? `${formatDate(last.capturedAt)} · ${formatMoney(snapshotValue(last), last.currency)}`
            : ''}
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
              <SelectValue>{selectedAccount?.name ?? '全部账户'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={ALL_ACCOUNTS_VALUE}>全部账户</SelectItem>
                {modeAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name} · {account.currency}
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

export function PerformanceSnapshotTable({
  loadState,
  snapshots,
  refreshing,
  onRetry,
  onCompleteDataSetup,
  onCaptureSnapshot,
  capturingSnapshot = false,
  captureDisabled = false,
  groupedByCurrency = false,
}: {
  loadState: 'loading' | 'error' | 'stale' | 'empty' | 'ready';
  snapshots: SnapshotRecord[];
  refreshing?: boolean;
  onRetry?: (() => void) | undefined;
  onCompleteDataSetup?: (() => void) | undefined;
  onCaptureSnapshot?: (() => void) | undefined;
  capturingSnapshot?: boolean;
  captureDisabled?: boolean;
  groupedByCurrency?: boolean;
}) {
  const hasSnapshots = snapshots.length > 0;
  const [range, setRange] = useState<SnapshotRange>('ALL');
  const [showCalculationInfo, setShowCalculationInfo] = useState(false);
  const visibleSnapshots = useMemo(() => snapshotsForRange(snapshots, range), [snapshots, range]);
  let content: ReactNode;
  if (loadState === 'loading' && !hasSnapshots) {
    content = <Skeleton className="h-52 w-full rounded-lg" aria-label="资产走势加载中" />;
  } else if (groupedByCurrency && hasSnapshots && visibleSnapshots.length > 0) {
    const groups = new Map<string, SnapshotRecord[]>();
    for (const snapshot of visibleSnapshots) {
      const currency = snapshot.currency ?? '未知币种';
      const current = groups.get(currency) ?? [];
      current.push(snapshot);
      groups.set(currency, current);
    }
    content = (
      <div className="grid gap-3 lg:grid-cols-2">
        {[...groups.entries()].map(([currency, group]) => (
          <div key={currency} className="rounded-lg bg-muted/20 p-3">
            <p className="m-0 mb-2 text-sm font-medium">{currency} 资产走势</p>
            <PerformanceHistoryChart snapshots={group} />
          </div>
        ))}
      </div>
    );
  } else if (hasSnapshots && visibleSnapshots.length > 0) {
    content = (
      <>
        <PerformanceHistoryChart snapshots={visibleSnapshots} />
        <details className="mt-3 rounded-lg bg-muted/20 px-3 py-2 text-sm">
          <summary className="cursor-pointer text-muted-foreground">查看快照明细</summary>
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
                    <td>{formatMoney(snapshot.marketValue, snapshot.currency)}</td>
                    <td>{formatMoney(snapshot.costValue, snapshot.currency)}</td>
                    <td>{formatMoney(snapshot.cashValue, snapshot.currency)}</td>
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
        <EmptyDescription>该时间范围暂无快照。</EmptyDescription>
      </Empty>
    );
  } else {
    content = (
      <Empty
        className="min-h-[176px] items-start justify-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-5 py-6 text-left"
        aria-live="polite"
      >
        <EmptyTitle>暂无收益历史</EmptyTitle>
        <EmptyDescription>创建第一个快照后即可查看资产曲线、时间加权收益率和资金加权收益率。</EmptyDescription>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {onCompleteDataSetup ? (
            <Button type="button" size="sm" onClick={onCompleteDataSetup}>
              完成数据配置
            </Button>
          ) : null}
          {onCaptureSnapshot ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={capturingSnapshot || captureDisabled}
              aria-busy={capturingSnapshot}
              title={captureDisabled ? '当前模式暂无可拍摄账户' : undefined}
              onClick={onCaptureSnapshot}
            >
              {capturingSnapshot && (
                <LoaderCircle
                  data-icon="inline-start"
                  className="animate-spin"
                  aria-hidden="true"
                />
              )}
              {capturingSnapshot ? '拍摄中…' : '立即拍一个估值快照'}
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
            时间加权收益率使用完整快照计算，资金加权收益率还会结合账本的外部现金流。
          </p>
        ) : null}
      </Empty>
    );
  }
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-xl font-semibold tracking-tight">资产走势</h2>
          <p className="m-0 mt-1 text-sm text-muted-foreground">市值、现金和数据时点按快照回放。</p>
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
          disabled={editDisabled}
          onClick={() => {
            if (editingTargets) setEditingTargets(false);
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
                  <th>调整</th>
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
                      <td className={`font-medium ${adjustment.className}`}>{adjustment.text}</td>
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
