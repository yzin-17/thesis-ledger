import { useEffect, useMemo, useState } from 'react';
import type { BarPointV2 } from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { MarketChartAttribution } from './MarketChartAttribution.js';
import { MarketChartNavigationControls } from './MarketChartNavigationControls.js';
import { MarketChartReadout } from './MarketChartReadout.js';
import { MarketChartToolbar } from './MarketChartToolbar.js';
import { MarketIndicatorSettingsMenu } from './MarketIndicatorSettingsMenu.js';
import {
  LightweightMarketChart,
  rangeCoverage,
  rangeMonths,
  visibleBarsForRange,
} from './MarketPriceLightweightChart.js';
import { buildChartPoints, type ChartPoint } from './market-chart-model.js';
import type { MarketChartBar, MarketChartIndicator } from './market-chart-types.js';
import {
  defaultPreference,
  normalizeMacdParams,
  preferenceKey,
  readPreference,
  type ChartPreference,
  type MarketIndicatorParams,
} from './market-chart-preferences.js';
export { FundNavHistoryChart } from './MarketNavChart.js';
export type { ChartPreference, MarketIndicatorParams } from './market-chart-preferences.js';

const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 });

const rangeLabel = (range: number) => {
  if (range === 0) return '全部已加载';
  if (range === 30) return '1月';
  if (range === 90) return '3月';
  if (range === 180) return '6月';
  return '1年';
};

const completionLabel = (status: BarPointV2['completionStatus'] | undefined) => {
  if (status === 'incomplete') return '当日未完成';
  if (status === 'unknown') return '收盘状态未知';
  if (status === 'complete') return '已收盘';
  return '收盘状态未声明';
};

const timestampOf = (timestamp: string) => timestamp.slice(0, 10);

export function MarketPriceChart({
  bars,
  indicators = [],
  chartPoints: providedChartPoints,
  onIndicatorParamsChange,
  onLoadEarlier,
  canLoadEarlier,
  historyLoading,
  historyError,
  onRetryEarlier,
}: {
  bars: MarketChartBar[];
  indicators?: MarketChartIndicator[];
  chartPoints?: ChartPoint[];
  onIndicatorParamsChange?: (params: MarketIndicatorParams) => void;
  onLoadEarlier?: () => void;
  canLoadEarlier?: boolean;
  historyLoading?: boolean;
  historyError?: string | null;
  onRetryEarlier?: () => void;
}) {
  const [preference, setPreference] = useState<ChartPreference>(readPreference);
  const [expanded, setExpanded] = useState(false);
  const [macdDraft, setMacdDraft] = useState<Record<'fast' | 'slow' | 'signal', string>>(() => ({
    fast: String(defaultPreference.macdParams.fast),
    slow: String(defaultPreference.macdParams.slow),
    signal: String(defaultPreference.macdParams.signal),
  }));
  const [macdDraftError, setMacdDraftError] = useState<string | null>(null);
  const [hoveredTimestamp, setHoveredTimestamp] = useState<string | null>(null);
  const [lockedTimestamp, setLockedTimestamp] = useState<string | null>(null);
  const [viewport, setViewport] = useState<{ from: string; to: string } | null>(null);
  const [rangeNotice, setRangeNotice] = useState<string | null>(null);
  const [focusLatestRevision, setFocusLatestRevision] = useState(0);
  const [resetRevision, setResetRevision] = useState(0);
  const [viewAction, setViewAction] = useState<{
    type: 'zoomIn' | 'zoomOut' | 'panEarlier' | 'panLater';
    revision: number;
  }>();
  const visible = useMemo(
    () => visibleBarsForRange(bars, preference.visibleRange),
    [bars, preference.visibleRange],
  );
  const chartPoints = useMemo(
    () => providedChartPoints ?? buildChartPoints(bars, indicators),
    [bars, indicators, providedChartPoints],
  );
  const viewportBars = useMemo(() => {
    if (!viewport) return visible;
    return bars.filter((bar) => {
      const date = timestampOf(bar.timestamp);
      return date >= viewport.from && date <= viewport.to;
    });
  }, [bars, viewport, visible]);
  const first = viewportBars[0];
  const last = viewportBars.at(-1);
  const latestBar = bars.at(-1);
  const currency = latestBar?.symbol?.match(/\.(SH|SZ|BJ)$/) ? 'CNY' : undefined;
  const change = first && last && first.close !== 0 ? last.close / first.close - 1 : null;
  const selectedTimestamp = lockedTimestamp ?? hoveredTimestamp;
  const selectedBar = bars.find((bar) => timestampOf(bar.timestamp) === selectedTimestamp) ?? last;
  const selectedChartPoint = chartPoints.find(
    (point) => point.date === timestampOf(selectedBar?.timestamp ?? ''),
  );

  useEffect(() => {
    onIndicatorParamsChange?.({
      ...preference.macdParams,
      short: 6,
      mid: 12,
      long: 24,
    });
  }, [onIndicatorParamsChange, preference.macdParams]);

  useEffect(() => {
    setMacdDraft({
      fast: String(preference.macdParams.fast),
      slow: String(preference.macdParams.slow),
      signal: String(preference.macdParams.signal),
    });
  }, [preference.macdParams]);

  useEffect(() => {
    const coverage = rangeCoverage(bars, preference.visibleRange);
    if (!coverage || coverage.available) {
      setRangeNotice(null);
      return;
    }
    const action = canLoadEarlier ? '可加载更早数据以覆盖' : '当前数据源未覆盖';
    setRangeNotice(
      `当前仅已加载 ${coverage.earliest} 至 ${coverage.latest}，${action}${rangeLabel(preference.visibleRange)}。`,
    );
  }, [bars, canLoadEarlier, preference.visibleRange]);

  const updatePreference = (next: Partial<ChartPreference>) => {
    setPreference((current) => {
      const updated = { ...current, ...next };
      try {
        window.localStorage.setItem(preferenceKey, JSON.stringify(updated));
      } catch {
        // 浏览器存储不可用时仍保留当前会话偏好。
      }
      return updated;
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || (!lockedTimestamp && !expanded)) return;
      if (
        event.target instanceof Element &&
        event.target.closest('[data-slot="dropdown-menu-content"]')
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setHoveredTimestamp(null);
      if (lockedTimestamp) {
        setLockedTimestamp(null);
        setFocusLatestRevision((value) => value + 1);
      } else {
        setExpanded(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [expanded, lockedTimestamp]);

  const chooseRange = (range: number) => {
    const earliest = bars[0];
    const latest = bars.at(-1);
    const months = rangeMonths(range);
    if (earliest && latest && months !== null) {
      const cutoff = new Date(latest.timestamp);
      cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
      if (Date.parse(earliest.timestamp) > cutoff.getTime()) {
        if (canLoadEarlier) {
          setRangeNotice('正在补充该范围所需的更早日线，请加载完成后再次选择。');
          onLoadEarlier?.();
        } else {
          setRangeNotice('当前数据源没有覆盖该范围，已保留当前可用范围。');
        }
        return;
      }
    }
    setRangeNotice(null);
    updatePreference({ visibleRange: range });
  };

  const triggerViewAction = (type: NonNullable<typeof viewAction>['type']) =>
    setViewAction((current) => ({ type, revision: (current?.revision ?? 0) + 1 }));

  const panel = (
    <div className="grid gap-3 rounded-lg bg-muted/30 p-3">
      <div className="flex flex-col gap-3">
        <div>
          <h4 className="m-0 text-sm font-medium">日线走势</h4>
          <p className="m-0 text-xs text-muted-foreground">K线、均线、成交量与指标共用日期轴</p>
        </div>
        <MarketChartToolbar
          chartControls={
            <ToggleGroup
              value={[preference.chartMode]}
              onValueChange={(value) =>
                value[0] && updatePreference({ chartMode: value[0] as 'candles' | 'close' })
              }
              aria-label="图形类型"
            >
              <ToggleGroupItem value="candles">K线</ToggleGroupItem>
              <ToggleGroupItem value="close">收盘线</ToggleGroupItem>
            </ToggleGroup>
          }
          rangeControls={
            <ToggleGroup
              value={[String(preference.visibleRange)]}
              onValueChange={(value) => value[0] && chooseRange(Number(value[0]))}
              aria-label="日线范围"
            >
              {[0, 30, 90, 180, 365].map((range) => (
                <ToggleGroupItem key={range} value={String(range)}>
                  {rangeLabel(range)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          }
          indicatorControls={
            <>
              <MarketIndicatorSettingsMenu
                visibleIndicators={preference.visibleIndicators}
                visibleMA={preference.visibleMA}
                rsiPeriod={preference.rsiPeriod}
                macdDraft={macdDraft}
                macdDraftError={macdDraftError}
                onIndicatorChange={(name, checked) =>
                  updatePreference({
                    visibleIndicators: checked
                      ? [...new Set([...preference.visibleIndicators, name])]
                      : preference.visibleIndicators.filter((item) => item !== name),
                  })
                }
                onVisibleMAChange={(name, checked) =>
                  updatePreference({
                    visibleMA: checked
                      ? [...new Set([...preference.visibleMA, name])]
                      : preference.visibleMA.filter((item) => item !== name),
                  })
                }
                onRsiPeriodChange={(rsiPeriod) => updatePreference({ rsiPeriod })}
                onMacdDraftChange={(name, value) =>
                  setMacdDraft((current) => ({ ...current, [name]: value }))
                }
                onApplyMacdParams={() => {
                  const next = normalizeMacdParams({
                    fast: Number(macdDraft.fast),
                    slow: Number(macdDraft.slow),
                    signal: Number(macdDraft.signal),
                  });
                  const valid =
                    next.fast === Number(macdDraft.fast) &&
                    next.slow === Number(macdDraft.slow) &&
                    next.signal === Number(macdDraft.signal);
                  if (valid) {
                    setMacdDraftError(null);
                    updatePreference({ macdParams: next });
                  } else {
                    setMacdDraftError('MACD 参数必须为 2–200 的整数，且快线小于慢线。');
                  }
                }}
                onResetMacdParams={() =>
                  updatePreference({ macdParams: { fast: 12, slow: 26, signal: 9 } })
                }
              />
              {preference.visibleIndicators.includes('MACD') ||
              preference.visibleIndicators.includes('RSI') ? (
                <ToggleGroup
                  value={[preference.activePane]}
                  onValueChange={(value) =>
                    value[0] && updatePreference({ activePane: value[0] as 'MACD' | 'RSI' })
                  }
                  aria-label="技术副图"
                >
                  <ToggleGroupItem
                    value="MACD"
                    disabled={!indicators.some((item) => item.name === 'MACD')}
                  >
                    MACD
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="RSI"
                    disabled={!indicators.some((item) => item.name === 'RSI')}
                  >
                    RSI
                  </ToggleGroupItem>
                </ToggleGroup>
              ) : null}
            </>
          }
          viewControls={
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setLockedTimestamp(null);
                  setHoveredTimestamp(null);
                  setFocusLatestRevision((value) => value + 1);
                }}
              >
                回到最新
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setLockedTimestamp(null);
                  setHoveredTimestamp(null);
                  updatePreference(defaultPreference);
                  setResetRevision((value) => value + 1);
                }}
              >
                重置
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? '退出全屏' : '全屏'}
              </Button>
              <MarketChartNavigationControls
                onZoomIn={() => triggerViewAction('zoomIn')}
                onZoomOut={() => triggerViewAction('zoomOut')}
                onPanEarlier={() => triggerViewAction('panEarlier')}
                onPanLater={() => triggerViewAction('panLater')}
              />
            </>
          }
        />
      </div>
      {visible.length > 0 ? (
        <LightweightMarketChart
          bars={bars}
          indicators={indicators}
          {...(providedChartPoints ? { chartPoints: providedChartPoints } : {})}
          visibleRange={preference.visibleRange}
          chartMode={preference.chartMode}
          activePane={preference.activePane}
          visibleIndicators={preference.visibleIndicators}
          visibleMA={preference.visibleMA}
          rsiPeriod={preference.rsiPeriod}
          focusLatestRevision={focusLatestRevision}
          resetRevision={resetRevision}
          showBothPanes={expanded}
          {...(viewAction ? { viewAction } : {})}
          onVisibleRangeChange={setViewport}
          onLoadEarlier={onLoadEarlier}
          onRetryEarlier={onRetryEarlier}
          canLoadEarlier={canLoadEarlier}
          historyLoading={historyLoading}
          historyError={historyError}
          onHover={setHoveredTimestamp}
          onClick={setLockedTimestamp}
          lockedTimestamp={lockedTimestamp}
        />
      ) : (
        <p className="empty-inline">当前没有可用日线。</p>
      )}
      {rangeNotice ? (
        <p className="m-0 text-xs text-muted-foreground" role="status">
          {rangeNotice}
        </p>
      ) : null}
      <MarketChartReadout
        selectedBar={selectedBar}
        selectedPoint={selectedChartPoint}
        selectedTimestamp={selectedTimestamp}
        lockedTimestamp={lockedTimestamp}
        visibleIndicators={preference.visibleIndicators}
        visibleMA={preference.visibleMA}
        rsiPeriod={preference.rsiPeriod}
        activePane={preference.activePane}
        showBothPanes={expanded}
      />
      {historyError ? (
        <p className="m-0 text-xs text-destructive" role="alert">
          {historyError}
        </p>
      ) : null}
    </div>
  );
  const caption = (
    <figcaption className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
      <span>
        {first ? new Date(first.timestamp).toLocaleDateString('zh-CN') : '—'} 至{' '}
        {last ? new Date(last.timestamp).toLocaleDateString('zh-CN') : '—'}
      </span>
      <span>
        最新行情 {number.format(latestBar?.close ?? 0)} · 币种 {currency ?? '未声明'}
        {last && latestBar && last.timestamp !== latestBar.timestamp
          ? ` · 区间末值 ${number.format(last.close)}`
          : ''}
        {change === null
          ? ''
          : ` · 可视区间 ${change >= 0 ? '+' : ''}${(change * 100).toFixed(2)}%`}
      </span>
      <span>
        数据来源 {last?.provider ?? '未知'} · 复权 {last?.adjustment ?? '未声明'} ·{' '}
        {completionLabel(last?.completionStatus)}
      </span>
      <MarketChartAttribution />
    </figcaption>
  );

  return (
    <figure className="m-0 grid gap-2" data-market-price-chart>
      {expanded ? (
        <Dialog open onOpenChange={setExpanded}>
          <DialogContent
            className="h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-none sm:max-w-none overflow-y-auto p-4"
            showCloseButton
          >
            <DialogHeader>
              <DialogTitle>日线走势</DialogTitle>
            </DialogHeader>
            {panel}
          </DialogContent>
        </Dialog>
      ) : (
        panel
      )}
      {caption}
    </figure>
  );
}
