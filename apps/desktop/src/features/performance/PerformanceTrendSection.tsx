import { pnlReasonLabels, type PnlChartPoint } from './performance-pnl-model.js';
import { TableContainer } from '@/components/ui/table';
import { useMemo, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

import { money } from '../shared/display.js';
import { DataStateBanner } from '../shared/DesktopPrimitives.js';
import { PerformanceTrendChart, performanceSeriesQualityLabel } from './PerformanceTrendChart.js';
import type {
  Currency,
  PerformanceSeriesInterval,
  PerformanceSeriesPoint,
  PerformanceSeriesRange,
  PerformanceSeriesResponse,
  SnapshotRecord,
} from './performance.types.js';

const moneyByCurrency: Record<Currency, Intl.NumberFormat> = {
  CNY: money,
  HKD: new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'HKD' }),
  USD: new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'USD' }),
};
const formatMoney = (value: number, currency: Currency) => moneyByCurrency[currency].format(value);
const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '尚无数据时点' : date.toLocaleString('zh-CN');
};
const formatCoverage = (value: number) => `${(value * 100).toFixed(2)}%`;

const rangeOptions: Array<{ value: PerformanceSeriesRange; label: string }> = [
  { value: '1D', label: '1日' },
  { value: '5D', label: '5日' },
  { value: '1M', label: '近1月' },
  { value: '3M', label: '近3月' },
  { value: 'YTD', label: '年初至今' },
  { value: '1Y', label: '近1年' },
  { value: '5Y', label: '近5年' },
  { value: 'ALL', label: '全部' },
];
const intervalOptions: Array<{ value: PerformanceSeriesInterval; label: string }> = [
  { value: '1min', label: '分线' },
  { value: '1h', label: '时线' },
  { value: '1d', label: '日线' },
  { value: '1w', label: '周线' },
  { value: '1mo', label: '月线' },
  { value: '1y', label: '年线' },
];
const defaultIntervals: Record<PerformanceSeriesRange, PerformanceSeriesInterval> = {
  '1D': '1min',
  '5D': '1h',
  '1M': '1d',
  '3M': '1d',
  YTD: '1d',
  '1Y': '1d',
  '5Y': '1mo',
  ALL: '1mo',
};
const intervalsByRange: Record<PerformanceSeriesRange, readonly PerformanceSeriesInterval[]> = {
  '1D': ['1min', '1h'],
  '5D': ['1min', '1h', '1d'],
  '1M': ['1h', '1d', '1w'],
  '3M': ['1h', '1d', '1w', '1mo'],
  YTD: ['1d', '1w', '1mo'],
  '1Y': ['1d', '1w', '1mo'],
  '5Y': ['1w', '1mo', '1y'],
  ALL: ['1mo', '1y'],
};

const snapshotsForRange = (snapshots: SnapshotRecord[], range: PerformanceSeriesRange) => {
  if (range === 'ALL' || snapshots.length === 0) return snapshots;
  const anchor = new Date(snapshots.at(-1)?.capturedAt ?? '');
  if (Number.isNaN(anchor.getTime())) return snapshots;
  const cutoff = new Date(anchor);
  if (range === 'YTD') {
    cutoff.setMonth(0, 1);
    cutoff.setHours(0, 0, 0, 0);
  } else if (range === '1D' || range === '5D') {
    cutoff.setDate(cutoff.getDate() - (range === '1D' ? 1 : 5));
  } else {
    const months = { '1M': 1, '3M': 3, '1Y': 12, '5Y': 60 }[range];
    cutoff.setMonth(cutoff.getMonth() - months);
  }
  return snapshots.filter((snapshot) => new Date(snapshot.capturedAt) >= cutoff);
};

const snapshotSeriesPoint = (snapshot: SnapshotRecord): PerformanceSeriesPoint => ({
  at: snapshot.capturedAt,
  value: snapshot.marketValue + snapshot.cashValue,
  currency: snapshot.currency ?? 'CNY',
  valuationBasis: 'ESTIMATED',
  disclosureCoverage: snapshot.partial ? 0 : 1,
  pricedCoverage: snapshot.partial ? 0 : 1,
  dataQuality: snapshot.partial ? 'PARTIAL' : 'COMPLETE',
  sourceSnapshotId: snapshot.id,
});

function TrendControls({
  range,
  interval,
  series,
  refreshing,
  onRangeChange,
  onIntervalChange,
}: {
  range: PerformanceSeriesRange;
  interval: PerformanceSeriesInterval;
  series?: PerformanceSeriesResponse | undefined;
  refreshing?: boolean | undefined;
  onRangeChange: (range: PerformanceSeriesRange, interval: PerformanceSeriesInterval) => void;
  onIntervalChange: (interval: PerformanceSeriesInterval) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={range}
        onValueChange={(value) => {
          if (!value) return;
          const nextInterval = intervalsByRange[value].includes(interval)
            ? interval
            : defaultIntervals[value];
          onRangeChange(value, nextInterval);
        }}
      >
        <SelectTrigger className="w-32" aria-label="走势区间">
          <SelectValue>
            {rangeOptions.find((option) => option.value === range)?.label ?? '区间'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {rangeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select value={interval} onValueChange={(value) => value && onIntervalChange(value)}>
        <SelectTrigger className="w-28" aria-label="走势粒度">
          <SelectValue>
            {intervalOptions.find((option) => option.value === interval)?.label ?? '粒度'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {intervalOptions.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                disabled={series !== undefined && !series.availableIntervals.includes(option.value)}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {refreshing ? <Badge variant="secondary">正在更新</Badge> : null}
    </div>
  );
}

function TrendPointDetails({ points }: { points: PerformanceSeriesPoint[] }) {
  return (
    <details className="mt-3 rounded-lg bg-muted/20 px-3 py-2 text-sm">
      <summary className="cursor-pointer text-muted-foreground">查看估值点明细</summary>
      <TableContainer className="mt-2">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th className="text-right">资产总值</th>
              <th>口径</th>
              <th>覆盖率</th>
              <th>质量</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={`${point.at}-${point.sourceSnapshotId ?? 'series'}`}>
                <td>{formatDate(point.at)}</td>
                <td className="text-right">{formatMoney(point.value, point.currency)}</td>
                <td>{point.valuationBasis === 'OFFICIAL' ? '正式' : '估算'}</td>
                <td>
                  披露 {formatCoverage(point.disclosureCoverage)} / 定价{' '}
                  {formatCoverage(point.pricedCoverage)}
                </td>
                <td>
                  {point.dataQuality === 'COMPLETE' ? (
                    <Badge variant="secondary">完整</Badge>
                  ) : (
                    <Badge variant="destructive">
                      {performanceSeriesQualityLabel(point.dataQuality)}
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableContainer>
    </details>
  );
}

const EmptyTrend = ({
  hasHistory,
  onCompleteDataSetup,
}: {
  hasHistory: boolean;
  onCompleteDataSetup?: (() => void) | undefined;
}) => {
  const [showCalculationInfo, setShowCalculationInfo] = useState(false);
  if (hasHistory) {
    return (
      <Empty className="min-h-20 rounded-lg border-0 bg-muted/30 px-4 py-6" aria-live="polite">
        <EmptyDescription>该区间暂无估值点。</EmptyDescription>
      </Empty>
    );
  }
  return (
    <Empty
      className="min-h-[176px] items-start justify-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-5 py-6 text-left"
      aria-live="polite"
    >
      <EmptyTitle>暂无收益历史</EmptyTitle>
      <EmptyDescription>自动估值快照生成后可查看收益。</EmptyDescription>
      <div className="mt-2 flex flex-wrap items-center gap-2">
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
          时间加权收益率基于完整快照；资金加权收益率结合外部现金流。
        </p>
      ) : null}
    </Empty>
  );
};

export function PerformanceSnapshotTable({
  loadState,
  snapshots,
  series,
  range,
  interval,
  onRangeChange,
  onIntervalChange,
  refreshing,
  onRetry,
  onCompleteDataSetup,
  groupedByCurrency = false,
  pnl,
}: {
  loadState: 'loading' | 'error' | 'stale' | 'empty' | 'ready';
  snapshots: SnapshotRecord[];
  series?: PerformanceSeriesResponse | undefined;
  range: PerformanceSeriesRange;
  interval: PerformanceSeriesInterval;
  onRangeChange: (range: PerformanceSeriesRange, interval: PerformanceSeriesInterval) => void;
  onIntervalChange: (interval: PerformanceSeriesInterval) => void;
  refreshing?: boolean;
  onRetry?: (() => void) | undefined;
  onCompleteDataSetup?: (() => void) | undefined;
  groupedByCurrency?: boolean;
  pnl?: {
    points: PnlChartPoint[];
    currency: Currency;
    loading: boolean;
    error: boolean;
    historyEmpty: boolean;
    truncated: boolean;
    currentUnavailable: boolean;
    onRetry: () => void;
  };
}) {
  const visibleSnapshots = useMemo(() => snapshotsForRange(snapshots, range), [snapshots, range]);
  const seriesPoints = series?.points ?? [];
  const groups = new Map<string, SnapshotRecord[]>();
  if (groupedByCurrency) {
    for (const snapshot of visibleSnapshots) {
      const currency = snapshot.currency ?? '未知币种';
      const current = groups.get(currency) ?? [];
      current.push(snapshot);
      groups.set(currency, current);
    }
  }
  if (groupedByCurrency && pnl && pnl.points.length > 0 && !groups.has(pnl.currency))
    groups.set(pnl.currency, []);
  const pnlAvailable = pnl?.points.some((point) => point.value !== null) === true;
  const missingPnl = pnl?.points.filter((point) => point.value === null) ?? [];
  const pnlReasons = [
    ...new Set(
      missingPnl.flatMap((point) => (point.reason ? [pnlReasonLabels[point.reason]] : [])),
    ),
  ];
  let content: ReactNode;
  if (loadState === 'loading' && seriesPoints.length === 0 && groups.size === 0 && !pnlAvailable) {
    content = <Skeleton className="h-52 w-full rounded-lg" aria-label="资产走势加载中" />;
  } else if (groups.size > 0) {
    content = (
      <div className="grid gap-3 lg:grid-cols-2">
        {[...groups.entries()].map(([currency, group]) => (
          <div key={currency} className="rounded-lg bg-muted/20 p-3">
            <p className="m-0 mb-2 text-sm font-medium">{currency} 资产走势</p>
            <PerformanceTrendChart
              seriesPoints={group.map(snapshotSeriesPoint)}
              interval={interval}
              pnlPoints={pnl?.currency === currency ? pnl.points : undefined}
              pnlCurrency={pnl?.currency}
            />
          </div>
        ))}
      </div>
    );
  } else if (seriesPoints.length > 0) {
    content = (
      <>
        <PerformanceTrendChart
          seriesPoints={seriesPoints}
          interval={interval}
          pnlPoints={pnl?.points}
          pnlCurrency={pnl?.currency}
        />
        <TrendPointDetails points={seriesPoints} />
      </>
    );
  } else if (pnl && pnl.points.length > 0) {
    content = (
      <PerformanceTrendChart
        seriesPoints={[]}
        interval={interval}
        pnlPoints={pnl.points}
        pnlCurrency={pnl.currency}
      />
    );
  } else if (loadState === 'empty' || loadState === 'ready') {
    content = (
      <EmptyTrend
        hasHistory={snapshots.length > 0 || series !== undefined}
        onCompleteDataSetup={onCompleteDataSetup}
      />
    );
  } else {
    content = null;
  }
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-xl font-semibold tracking-tight">
            {pnl ? '资产总值与累计盈亏' : '资产走势'}
          </h2>
          <details className="mt-1 text-xs text-muted-foreground">
            <summary className="cursor-pointer">计算口径</summary>
            <p className="mt-2">
              资产取周期末有效估值。
              {pnl ? '盈亏为收盘记录与当前估值。' : ''}
            </p>
          </details>
        </div>
        <TrendControls
          range={range}
          interval={interval}
          series={series}
          refreshing={refreshing}
          onRangeChange={onRangeChange}
          onIntervalChange={onIntervalChange}
        />
      </div>
      {loadState !== 'ready' && loadState !== 'empty' && loadState !== 'loading' ? (
        <DataStateBanner
          state={loadState}
          description={loadState === 'stale' ? '刷新失败，当前保留上次读取的估值数据。' : undefined}
          onRetry={onRetry}
        />
      ) : null}
      {pnl?.error && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm" role="alert">
          <span>历史盈亏读取失败，已保留可用数据。</span>
          <Button type="button" variant="outline" size="sm" onClick={pnl.onRetry}>
            重试盈亏历史
          </Button>
        </div>
      )}
      {pnl?.loading && (
        <p className="m-0 text-xs text-muted-foreground" aria-label="正在读取盈亏历史">
          正在读取盈亏历史…
        </p>
      )}
      {content}
      {pnl &&
        pnl.points.length > 0 &&
        seriesPoints.length === 0 &&
        visibleSnapshots.length === 0 &&
        (loadState === 'empty' || loadState === 'ready') && (
          <EmptyTrend
            hasHistory={snapshots.length > 0 || series !== undefined}
            onCompleteDataSetup={onCompleteDataSetup}
          />
        )}
      {pnl && (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground" aria-live="polite">
          {pnl.points.some((point) => point.current) && (
            <p className="m-0">
              当前累计盈亏{' '}
              <strong className="font-semibold text-foreground">
                {pnl.points.at(-1)?.value === null || pnl.points.at(-1)?.value === undefined
                  ? '—'
                  : formatMoney(pnl.points.at(-1)!.value!, pnl.currency)}
              </strong>
            </p>
          )}
          {pnl.currentUnavailable && <p className="m-0">当前盈亏不可用。</p>}
          {pnl.points.filter((point) => point.value !== null).length === 1 && (
            <p className="m-0">当前仅有一个可用盈亏点。</p>
          )}
          {missingPnl.length > 0 && (
            <p className="m-0">
              {missingPnl.length} 个盈亏时点{pnlReasons.join('、')}，已留空。
            </p>
          )}
          {pnl.historyEmpty && !pnl.error && !pnl.loading && pnl.points.length === 0 && (
            <p className="m-0">暂无历史盈亏记录。</p>
          )}
          {pnl.truncated && <p className="m-0">仅展示最近 2000 个收盘记录。</p>}
        </div>
      )}
    </section>
  );
}
