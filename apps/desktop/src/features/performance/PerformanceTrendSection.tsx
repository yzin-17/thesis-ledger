import { pnlReasonLabels, type PnlChartPoint } from './performance-pnl-model.js';
import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import { PerformanceTrendControls } from './PerformanceTrendControls.js';
import { ListRefreshRegion } from '@/components/ui/list-refresh-region';

import { money } from '../shared/display.js';
import { DataStateBanner } from '../shared/DesktopPrimitives.js';
import { PerformanceTrendChart } from './PerformanceTrendChart.js';
import type {
  Currency,
  PortfolioMode,
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
  mode = 'actual',
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
  mode?: PortfolioMode;
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
  const { groups, chartLoading, missingPnl, pnlReasons } = snapshotChartMaterials(
    visibleSnapshots,
    groupedByCurrency,
    pnl,
    refreshing,
    loadState,
  );
  const content = snapshotChartContent({
    groups,
    seriesPoints,
    interval,
    pnl,
    chartLoading,
    loadState,
    snapshots,
    series,
    onCompleteDataSetup,
  });

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
        <PerformanceTrendControls
          mode={mode}
          range={range}
          interval={interval}
          series={series}
          onRangeChange={onRangeChange}
          onIntervalChange={onIntervalChange}
        />
      </div>
      {loadState !== 'ready' && loadState !== 'empty' && loadState !== 'loading' ? (
        <DataStateBanner
          state="error"
          title="资产走势读取失败"
          description={
            loadState === 'stale'
              ? '刷新失败，当前保留上次读取的估值数据。'
              : '暂时无法读取资产走势，请重新加载。'
          }
          onRetry={onRetry}
        />
      ) : null}
      {pnl?.error && (
        <DataStateBanner
          state="error"
          title="历史盈亏读取失败"
          description="暂时无法读取历史盈亏，已保留可用数据。"
          onRetry={pnl.onRetry}
        />
      )}
      <ListRefreshRegion
        refreshing={chartLoading}
        label={pnl?.loading ? '正在读取盈亏历史' : '资产走势加载中'}
      >
        {content}
      </ListRefreshRegion>
      {showAssetEmptyAlongsidePnl(pnl, seriesPoints, visibleSnapshots, loadState) && (
        <EmptyTrend
          hasHistory={snapshots.length > 0 || series !== undefined}
          onCompleteDataSetup={onCompleteDataSetup}
        />
      )}
      {pnl && <SnapshotPnlNotes pnl={pnl} missingPnl={missingPnl} pnlReasons={pnlReasons} />}
    </section>
  );
}

type SnapshotTableProps = Parameters<typeof PerformanceSnapshotTable>[0];
type SnapshotPnl = NonNullable<SnapshotTableProps['pnl']>;
function snapshotChartMaterials(
  visibleSnapshots: SnapshotRecord[],
  groupedByCurrency: boolean,
  pnl: SnapshotPnl | undefined,
  refreshing: boolean | undefined,
  loadState: SnapshotTableProps['loadState'],
) {
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
  const chartLoading = Boolean((refreshing ?? loadState === 'loading') || pnl?.loading);
  const missingPnl = pnl?.points.filter((point) => point.value === null) ?? [];
  const pnlReasons = [
    ...new Set(
      missingPnl.flatMap((point) => (point.reason ? [pnlReasonLabels[point.reason]] : [])),
    ),
  ];

  return { groups, chartLoading, missingPnl, pnlReasons };
}
function snapshotChartContent({
  groups,
  seriesPoints,
  interval,
  pnl,
  chartLoading,
  loadState,
  snapshots,
  series,
  onCompleteDataSetup,
}: {
  [
    K in 'interval' | 'pnl' | 'loadState' | 'snapshots' | 'series' | 'onCompleteDataSetup'
  ]: SnapshotTableProps[K];
} & {
  groups: Map<string, SnapshotRecord[]>;
  seriesPoints: PerformanceSeriesPoint[];
  chartLoading: boolean;
}): ReactNode {
  let content: ReactNode;
  if (groups.size > 0) {
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
      <PerformanceTrendChart
        seriesPoints={seriesPoints}
        interval={interval}
        pnlPoints={pnl?.points}
        pnlCurrency={pnl?.currency}
      />
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
  } else if (chartLoading) {
    content = <div className="h-76" aria-hidden="true" />;
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
  return content;
}
function SnapshotPnlNotes({
  pnl,
  missingPnl,
  pnlReasons,
}: {
  pnl: SnapshotPnl;
  missingPnl: PnlChartPoint[];
  pnlReasons: string[];
}) {
  return (
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
  );
}

function showAssetEmptyAlongsidePnl(
  pnl: SnapshotPnl | undefined,
  seriesPoints: PerformanceSeriesPoint[],
  visibleSnapshots: SnapshotRecord[],
  loadState: SnapshotTableProps['loadState'],
) {
  return (
    pnl &&
    pnl.points.length > 0 &&
    seriesPoints.length === 0 &&
    visibleSnapshots.length === 0 &&
    (loadState === 'empty' || loadState === 'ready')
  );
}
