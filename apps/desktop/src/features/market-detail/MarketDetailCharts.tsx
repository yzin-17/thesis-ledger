import { MarketChartFullscreen, useChartFullscreen } from './MarketChartFullscreen.js';
import { MarketChartViewActions } from './MarketChartViewActions.js';
import { chartOverlayHandlesEscape } from './market-chart-keyboard.js';
import { MarketChartRangeOverlay } from './MarketChartRangeOverlay.js';
import type { ChartRange } from './chart-date-range.js';
import { chartBarDate } from './market-chart-range.js';
import { useChartRangeHistory } from './useChartRangeHistory.js';
import { formatMarketNumber, formatRatioPercent } from '@thesis-ledger/domain';
import { ArenaPriceLayer } from '../model-arena/ArenaPriceLayer.js';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { MarketChartAttribution } from './MarketChartAttribution.js';
import { MarketChartReadout } from './MarketChartReadout.js';
import { chartPointKey as timestampOf, formatChartBarDate } from './market-chart-time.js';
import { MarketChartToolbar } from './MarketChartToolbar.js';
import { MarketChartRangeSelect } from './MarketChartRangeSelect.js';
import {
  chartPeriodTitle,
  chartPeriodSourceLabel,
  chartCompletionLabel,
} from './market-chart-period-label.js';
import { MarketIndicatorSettingsMenu } from './MarketIndicatorSettingsMenu.js';
import { MarketTradingOverlayControls } from './MarketTradingOverlayControls.js';
import type { MarketTradingOverlayState } from './useMarketTradingOverlays.js';
import { visibleBarsForRange } from './MarketPriceLightweightChart.js';
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
const emptyIndicators: MarketChartIndicator[] = [];

export function MarketPriceChart(props: MarketPriceChartProps) {
  const control = useMarketPriceChart(props);
  const {
    expanded,
    setExpanded,
    latestBar,
    preference,
    historyError,
    onRetryLater,
    lockedTimestamp,
    rangeNotice,
    latestNotice,
    selectedBar,
    selectedChartPoint,
    selectedTimestamp,
    latestError,
  } = control;

  const panel = (
    <div className="grid min-w-0 grid-cols-1 gap-3 rounded-lg bg-muted/30 p-3">
      <div className="flex flex-col gap-3">
        <div>
          <h4 className="m-0 pr-8 text-sm font-medium">{chartPeriodTitle(latestBar)}</h4>
          <p className="sr-only">K线、均线、成交量与指标共用日期轴</p>
        </div>
        <MarketPriceToolbar control={control} />
      </div>
      <MarketPricePlot control={control} />
      {rangeNotice ? (
        <p className="m-0 text-xs text-muted-foreground" role="status">
          {rangeNotice}
        </p>
      ) : null}
      {latestNotice ? (
        <p className="m-0 text-xs text-muted-foreground" role="status" data-market-latest-notice>
          {latestNotice}
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
      {latestError ? (
        <p className="m-0 text-xs text-destructive" role="alert" data-market-latest-error>
          {latestError}{' '}
          <Button
            type="button"
            size="sm"
            variant="link"
            className="h-auto p-0"
            onClick={() => onRetryLater?.()}
          >
            重试
          </Button>
        </p>
      ) : null}
    </div>
  );
  const caption = <MarketPriceCaption control={control} />;
  return (
    <figure className="m-0 grid min-w-0 grid-cols-1 gap-2" data-market-price-chart>
      <MarketChartFullscreen
        expanded={expanded}
        onOpenChange={setExpanded}
        title={chartPeriodTitle(latestBar)}
      >
        {panel}
      </MarketChartFullscreen>
      {caption}
    </figure>
  );
}

type MarketPriceChartProps = {
  bars: MarketChartBar[];
  indicators?: MarketChartIndicator[];
  chartPoints?: ChartPoint[];
  onIndicatorParamsChange?: (params: MarketIndicatorParams) => void;
  onLoadEarlier?: (start?: string) => void;
  canLoadEarlier?: boolean;
  historyLoading?: boolean;
  historyError?: string | null;
  onRetryEarlier?: () => void;
  onLoadLater?: () => void;
  onRetryLater?: () => void;
  canLoadLater?: boolean;
  latestLoading?: boolean;
  latestNotice?: string | null;
  latestError?: string | null;
  tradingOverlay?: MarketTradingOverlayState | undefined;
};

function useMarketPriceChart({
  bars,
  indicators = emptyIndicators,
  chartPoints: providedChartPoints,
  onIndicatorParamsChange,
  onLoadEarlier,
  canLoadEarlier,
  historyLoading,
  historyError,
  onRetryEarlier,
  onLoadLater,
  onRetryLater,
  canLoadLater,
  latestLoading,
  latestNotice,
  latestError,
  tradingOverlay,
}: MarketPriceChartProps) {
  const [preference, setPreference] = useState<ChartPreference>(readPreference);
  const { expanded, setExpanded, trigger: fullscreenTrigger } = useChartFullscreen();
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
      const date = timestampOf(bar.timestamp, bar.timeframe);
      return date >= viewport.from && date <= viewport.to;
    });
  }, [bars, viewport, visible]);
  const first = viewportBars[0];
  const last = viewportBars.at(-1);
  const latestBar = bars.at(-1);
  const currency = latestBar?.symbol?.match(/\.(SH|SZ|BJ)$/) ? 'CNY' : undefined;
  const change = first && last && first.close !== 0 ? last.close / first.close - 1 : null;
  const selectedTimestamp = lockedTimestamp ?? hoveredTimestamp;
  const selectedBar =
    bars.find((bar) => timestampOf(bar.timestamp, bar.timeframe) === selectedTimestamp) ?? last;
  const selectedChartPoint = chartPoints.find(
    (point) => point.date === timestampOf(selectedBar?.timestamp ?? '', selectedBar?.timeframe),
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
      if (chartOverlayHandlesEscape(event.target)) return;
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

  useChartRangeHistory({
    bars,
    range: preference.visibleRange,
    canLoadEarlier,
    historyLoading,
    historyError,
    onLoadEarlier,
    onDataReady: () => setResetRevision((value) => value + 1),
    onNotice: setRangeNotice,
  });
  const chooseRange = (range: ChartRange) => updatePreference({ visibleRange: range });

  const triggerViewAction = (type: NonNullable<typeof viewAction>['type']) =>
    setViewAction((current) => ({ type, revision: (current?.revision ?? 0) + 1 }));

  return {
    expanded,
    setExpanded,
    latestBar,
    preference,
    updatePreference,
    chooseRange,
    macdDraft,
    macdDraftError,
    setMacdDraft,
    setMacdDraftError,
    indicators,
    fullscreenTrigger,
    triggerViewAction,
    setLockedTimestamp,
    setHoveredTimestamp,
    setFocusLatestRevision,
    tradingOverlay,
    setResetRevision,
    bars,
    providedChartPoints,
    focusLatestRevision,
    resetRevision,
    viewAction,
    setViewport,
    onLoadEarlier,
    onRetryEarlier,
    canLoadEarlier,
    historyLoading,
    historyError,
    onLoadLater,
    onRetryLater,
    canLoadLater,
    latestLoading,
    lockedTimestamp,
    rangeNotice,
    latestNotice,
    selectedBar,
    selectedChartPoint,
    selectedTimestamp,
    latestError,
    first,
    last,
    currency,
    change,
  };
}

function MarketPriceToolbar({ control }: { control: ReturnType<typeof useMarketPriceChart> }) {
  return (
    <>
      <MarketChartToolbar
        chartControls={
          <ToggleGroup
            value={[control.preference.chartMode]}
            onValueChange={(value) =>
              value[0] && control.updatePreference({ chartMode: value[0] as 'candles' | 'close' })
            }
            aria-label="图形类型"
          >
            <ToggleGroupItem value="candles">K线</ToggleGroupItem>
            <ToggleGroupItem value="close">收盘线</ToggleGroupItem>
          </ToggleGroup>
        }
        rangeControls={
          <MarketChartRangeSelect
            value={control.preference.visibleRange}
            anchorDate={control.latestBar ? chartBarDate(control.latestBar) : undefined}
            symbol={control.latestBar?.symbol}
            onValueChange={control.chooseRange}
          />
        }
        indicatorControls={
          <MarketIndicatorSettingsMenu
            visibleIndicators={control.preference.visibleIndicators}
            visibleMA={control.preference.visibleMA}
            rsiPeriod={control.preference.rsiPeriod}
            macdDraft={control.macdDraft}
            macdDraftError={control.macdDraftError}
            onIndicatorChange={(name, checked) =>
              control.updatePreference({
                visibleIndicators: checked
                  ? [...new Set([...control.preference.visibleIndicators, name])]
                  : control.preference.visibleIndicators.filter((item) => item !== name),
              })
            }
            onVisibleMAChange={(name, checked) =>
              control.updatePreference({
                visibleMA: checked
                  ? [...new Set([...control.preference.visibleMA, name])]
                  : control.preference.visibleMA.filter((item) => item !== name),
              })
            }
            onRsiPeriodChange={(rsiPeriod) => control.updatePreference({ rsiPeriod })}
            onMacdDraftChange={(name, value) =>
              control.setMacdDraft((current) => ({ ...current, [name]: value }))
            }
            onApplyMacdParams={() => {
              const next = normalizeMacdParams({
                fast: Number(control.macdDraft.fast),
                slow: Number(control.macdDraft.slow),
                signal: Number(control.macdDraft.signal),
              });
              const valid =
                next.fast === Number(control.macdDraft.fast) &&
                next.slow === Number(control.macdDraft.slow) &&
                next.signal === Number(control.macdDraft.signal);
              if (valid) {
                control.setMacdDraftError(null);
                control.updatePreference({ macdParams: next });
              } else {
                control.setMacdDraftError('MACD 参数必须为 2–200 的整数，且快线小于慢线。');
              }
            }}
            onResetMacdParams={() =>
              control.updatePreference({ macdParams: { fast: 12, slow: 26, signal: 9 } })
            }
            paneControls={
              control.preference.visibleIndicators.includes('MACD') ||
              control.preference.visibleIndicators.includes('RSI') ? (
                <ToggleGroup
                  value={[control.preference.activePane]}
                  onValueChange={(value) =>
                    value[0] && control.updatePreference({ activePane: value[0] as 'MACD' | 'RSI' })
                  }
                  aria-label="技术副图"
                >
                  <ToggleGroupItem
                    value="MACD"
                    disabled={!control.indicators.some((item) => item.name === 'MACD')}
                  >
                    MACD
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="RSI"
                    disabled={!control.indicators.some((item) => item.name === 'RSI')}
                  >
                    RSI
                  </ToggleGroupItem>
                </ToggleGroup>
              ) : null
            }
          />
        }
        viewControls={
          <>
            <MarketChartViewActions
              expanded={control.expanded}
              onToggleExpanded={() => control.setExpanded((value) => !value)}
              fullscreenTrigger={control.fullscreenTrigger}
              onNavigate={control.triggerViewAction}
              onLatest={() => {
                control.setLockedTimestamp(null);
                control.setHoveredTimestamp(null);
                control.setFocusLatestRevision((value) => value + 1);
              }}
              onReset={() => {
                control.setLockedTimestamp(null);
                control.setHoveredTimestamp(null);
                control.updatePreference(defaultPreference);
                control.tradingOverlay?.update({
                  trades: false,
                  cost: false,
                  risk: '',
                  measuring: false,
                  from: null,
                  to: null,
                });
                control.setResetRevision((value) => value + 1);
              }}
            />
          </>
        }
      />
    </>
  );
}
function MarketPricePlot({ control }: { control: ReturnType<typeof useMarketPriceChart> }) {
  const tradingOverlay = control.tradingOverlay;
  return (
    <>
      {control.bars.length > 0 ? (
        <div className="relative">
          <ArenaPriceLayer
            renderControls={
              tradingOverlay
                ? (modelToggle) => (
                    <MarketTradingOverlayControls
                      overlay={tradingOverlay}
                      extraControls={modelToggle}
                    />
                  )
                : undefined
            }
            bars={control.bars}
            indicators={control.indicators}
            {...(control.providedChartPoints ? { chartPoints: control.providedChartPoints } : {})}
            visibleRange={control.preference.visibleRange}
            chartMode={control.preference.chartMode}
            activePane={control.preference.activePane}
            visibleIndicators={control.preference.visibleIndicators}
            visibleMA={control.preference.visibleMA}
            rsiPeriod={control.preference.rsiPeriod}
            focusLatestRevision={control.focusLatestRevision}
            resetRevision={control.resetRevision}
            showBothPanes={control.expanded}
            {...(control.viewAction ? { viewAction: control.viewAction } : {})}
            onVisibleRangeChange={control.setViewport}
            onLoadEarlier={control.onLoadEarlier}
            onRetryEarlier={control.onRetryEarlier}
            canLoadEarlier={control.canLoadEarlier}
            historyLoading={control.historyLoading}
            historyError={control.historyError}
            {...(control.onLoadLater ? { onLoadLater: control.onLoadLater } : {})}
            {...(control.onRetryLater ? { onRetryLater: control.onRetryLater } : {})}
            {...(control.canLoadLater !== undefined ? { canLoadLater: control.canLoadLater } : {})}
            {...(control.latestLoading !== undefined
              ? { latestLoading: control.latestLoading }
              : {})}
            onHover={control.setHoveredTimestamp}
            onClick={(key) => {
              if (control.tradingOverlay?.consumeClick(key)) {
                control.setLockedTimestamp(null);
                control.setHoveredTimestamp(key);
              } else control.setLockedTimestamp(key);
            }}
            {...(control.tradingOverlay ? { tradingOverlays: control.tradingOverlay.model } : {})}
            lockedTimestamp={control.lockedTimestamp}
          />
          {!control.historyError && (
            <MarketChartRangeOverlay
              bars={control.bars}
              range={control.preference.visibleRange}
              loading={control.historyLoading}
            />
          )}
        </div>
      ) : (
        <p className="empty-inline">当前没有可用行情。</p>
      )}
    </>
  );
}
function MarketPriceCaption({ control }: { control: ReturnType<typeof useMarketPriceChart> }) {
  return (
    <>
      <figcaption className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {control.first ? formatChartBarDate(control.first) : '—'} 至{' '}
          {control.last ? formatChartBarDate(control.last) : '—'}
        </span>
        <span>
          最新行情 {formatMarketNumber(control.latestBar?.close)} · 币种{' '}
          {control.currency ?? '未声明'}
          {control.last &&
          control.latestBar &&
          control.last.timestamp !== control.latestBar.timestamp
            ? ` · 区间末值 ${formatMarketNumber(control.last.close)}`
            : ''}
          {control.change === null
            ? ''
            : ` · 可视区间 ${formatRatioPercent(control.change, 'always')}`}
        </span>
        <span>
          {chartPeriodSourceLabel(control.last)} · {chartCompletionLabel(control.last)}
        </span>
        <MarketChartAttribution />
      </figcaption>
    </>
  );
}
