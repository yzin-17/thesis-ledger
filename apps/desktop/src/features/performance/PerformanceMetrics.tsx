import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { performanceReturnDisplay } from './performance-return-display.js';
import { formatMoney, formatDate, signedMoney, signedPercent } from './performance-display.js';
import type {
  Currency,
  PerformanceFxMeta,
  PerformancePortfolioTotal,
  PerformanceSummary,
  SnapshotRecord,
} from './performance.types.js';
const snapshotValue = (snapshot: SnapshotRecord) => snapshot.marketValue + snapshot.cashValue;

const performanceToneClass = (tone: 'up' | 'down' | undefined) => {
  if (tone === 'up') return 'm-0 text-xs text-[var(--color-market-up)]';
  if (tone === 'down') return 'm-0 text-xs text-[var(--color-market-down)]';
  return 'm-0 text-xs text-muted-foreground';
};

const PerformanceKpiCard = ({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: 'up' | 'down' | undefined;
}) => (
  <Card className="h-[120px] rounded-xl border border-border/70 bg-muted/25 py-0 shadow-none ring-0">
    <CardContent className="flex h-full flex-col justify-between p-4">
      <p className="m-0 text-xs text-muted-foreground">{label}</p>
      <strong className="block text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </strong>
      <p className={performanceToneClass(tone)}>{detail}</p>
    </CardContent>
  </Card>
);

type PerformanceMetricsProps = {
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
  includeAssets?: boolean;
};

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
  includeAssets = true,
}: PerformanceMetricsProps) {
  const resolvedFx = fx ?? summary?.fx;
  const hasCurrentValue = currentValue !== undefined && Number.isFinite(currentValue);
  const hasSnapshotValue = latest !== undefined && !latest.partial;
  const snapshotPartial = latestPartial ?? latest?.partial === true;
  let assetValue = '—';
  if (hasCurrentValue) assetValue = formatMoney(currentValue, currentCurrency);
  else if (hasSnapshotValue) assetValue = formatMoney(snapshotValue(latest), latest.currency);

  const assetDetail = performanceAssetDetail(
    { currentValuePartial, currentPnl, currentPnlRate, currentCurrency, latest },
    hasCurrentValue,
    hasSnapshotValue,
    snapshotPartial,
    currencyTotals.length,
  );
  let assetTone: 'up' | 'down' | undefined;
  if (currentPnlRate !== null && currentPnlRate !== undefined) {
    if (currentPnlRate > 0) assetTone = 'up';
    else if (currentPnlRate < 0) assetTone = 'down';
  }
  const { ttwrorValue, ttwrorDetail, xirrValue, xirrDetail } = performanceReturnDisplay(
    summary,
    snapshotCount,
    summaryError,
    resolvedFx,
  );
  return (
    <>
      <div
        className={cn(
          'grid grid-cols-1 gap-4',
          includeAssets ? 'sm:grid-cols-3' : 'sm:grid-cols-2',
        )}
      >
        {includeAssets && (
          <PerformanceKpiCard
            label="总资产"
            value={assetValue}
            detail={assetDetail}
            tone={assetTone}
          />
        )}
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
      {includeAssets && currencyTotals.length > 1 ? (
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

function performanceAssetDetail(
  {
    currentValuePartial,
    currentPnl,
    currentPnlRate,
    currentCurrency,
    latest,
  }: Pick<
    PerformanceMetricsProps,
    'currentValuePartial' | 'currentPnl' | 'currentPnlRate' | 'currentCurrency' | 'latest'
  >,
  hasCurrentValue: boolean,
  hasSnapshotValue: boolean,
  snapshotPartial: boolean,
  currencyCount: number,
) {
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
      assetDetail = `最近完整快照 ${formatDate(latest!.capturedAt)} · 最新快照缺行情`;
    } else {
      assetDetail = `最近完整快照 ${formatDate(latest!.capturedAt)}`;
    }
  } else if (currencyCount > 1) assetDetail = '分币种估值 · 开启汇率合并查看合计';
  else if (snapshotPartial) assetDetail = '行情不完整，尚无完整估值';
  return assetDetail;
}
