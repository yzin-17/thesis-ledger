import { useMemo, useState } from 'react';
import { formatRatioPercent, formatDecimalNumber } from '@thesis-ledger/domain';
import { ArrowLeft, ArrowRight, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BacktestChartTradeReadout, BacktestTradeVisibility } from './BacktestChartTrades.js';
import { formatDateTimeInTimeZone } from '@/lib/date-display';
import type { BacktestChartModel } from './strategy-backtest-chart.model.js';
import { backtestRangePresets } from './strategy-backtest-chart.model.js';
import { useStrategyBacktestChart } from './useStrategyBacktestChart.js';
import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import {
  backtestAdjustmentLabels,
  type BacktestInstrumentChartRequest,
} from './backtest-instrument-chart.model.js';

const currencyFormatter = (currency: BacktestChartModel['currency']) => {
  if (!currency)
    return (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  const formatter = new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  });
  return (value: number) => formatter.format(value);
};

export function StrategyBacktestEquityChart({
  model,
  resetKey,
  onRangeChange,
  instrumentRequest,
}: {
  model: BacktestChartModel;
  resetKey: string;
  onRangeChange: (range: { from: number; to: number } | null) => void;
  instrumentRequest?: BacktestInstrumentChartRequest | undefined;
}) {
  const [showTrades, setShowTrades] = useState(true);
  const visibleModel = useMemo(
    () => (showTrades ? model : { ...model, tradeMarkers: [], unmappedFillCount: 0 }),
    [model, showTrades],
  );
  const equityByTime = useMemo(
    () => new Map(model.equity.map((point) => [point.time, point])),
    [model.equity],
  );
  const drawdownByTime = useMemo(
    () => new Map(model.drawdown.map((point) => [point.time, point])),
    [model.drawdown],
  );
  const chart = useStrategyBacktestChart({ model: visibleModel, resetKey, onRangeChange });
  const instrument = model.instrument?.status === 'available' ? model.instrument : null;

  if (model.equity.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        没有可绘制的权益时点。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {instrument && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-5 bg-violet-500" />
              {instrument.source.symbol} 收盘价 {instrument.source.currency ?? ''}（
              {backtestAdjustmentLabels[instrument.source.adjustment]} · 左轴）
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-5 bg-chart-1" />
            {model.priceResearch ? '研究权益' : '组合权益'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-5 bg-muted-foreground" />
            {model.drawdownSource === 'authoritative' ? '权威回撤' : '展示派生回撤'}
          </span>
          <span>时区 {model.timezone}</span>
          <BacktestTradeVisibility
            markers={model.tradeMarkers}
            checked={showTrades}
            onCheckedChange={setShowTrades}
          />
        </div>
        <ChartControls
          model={model}
          onPreset={chart.selectPreset}
          onAction={chart.changeRange}
          onReset={chart.reset}
        />
      </div>
      <ListRefreshRegion
        refreshing={instrumentRequest?.fetching ?? false}
        label="正在读取冻结标的走势"
        className="rounded-lg border bg-card"
      >
        <div
          ref={chart.containerRef}
          tabIndex={0}
          role="region"
          aria-label="标的走势、权益与回撤联动图表。上下键逐点查看，左右键平移，加减键缩放，Home 键重置。"
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp') chart.stepPoint(-1);
            else if (event.key === 'ArrowDown') chart.stepPoint(1);
            else if (event.key === 'Escape') chart.clearPoint();
            else if (event.key === '+' || event.key === '=') chart.changeRange('zoomIn');
            else if (event.key === '-') chart.changeRange('zoomOut');
            else if (event.key === 'ArrowLeft') chart.changeRange('earlier');
            else if (event.key === 'ArrowRight') chart.changeRange('later');
            else if (event.key === 'Home') chart.reset();
            else return;
            event.preventDefault();
          }}
          className="h-[430px] w-full min-w-0 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-ring [&_table]:h-auto [&_table]:min-w-0 [&_table]:w-auto [&_td]:min-w-0 [&_td]:p-0"
        />
        {chart.activeTime !== null && (
          <BacktestChartPointReadout
            model={model}
            visibleModel={visibleModel}
            chart={chart}
            equityByTime={equityByTime}
            drawdownByTime={drawdownByTime}
          />
        )}
      </ListRefreshRegion>
      <BacktestChartNotes
        model={model}
        visibleModel={visibleModel}
        instrumentRequest={instrumentRequest}
      />
    </div>
  );
}

function BacktestChartPointReadout({
  model,
  visibleModel,
  chart,
  equityByTime,
  drawdownByTime,
}: {
  model: BacktestChartModel;
  visibleModel: BacktestChartModel;
  chart: ReturnType<typeof useStrategyBacktestChart>;
  equityByTime: Map<number, BacktestChartModel['equity'][number]>;
  drawdownByTime: Map<number, BacktestChartModel['drawdown'][number]>;
}) {
  const activeEquity =
    chart.activeTime === null ? null : (equityByTime.get(chart.activeTime) ?? null);
  const activeDrawdown =
    chart.activeTime === null ? null : (drawdownByTime.get(chart.activeTime) ?? null);
  const formatMoney = currencyFormatter(model.currency);
  const instrument = model.instrument?.status === 'available' ? model.instrument : null;
  const activeInstrument = instrument?.points.find((point) => point.time === chart.activeTime);

  return (
    <div
      role="status"
      className="pointer-events-none absolute left-3 right-3 top-3 z-10 rounded-md border bg-popover/95 px-3 py-2 text-xs shadow-sm sm:right-auto sm:max-w-sm"
    >
      <p className="font-medium">
        {formatDateTimeInTimeZone(chart.activeTime, model.timezone)}
        {chart.lockedTime !== null ? ' · 已锁定' : ''}
      </p>
      {instrument && (
        <p className="mt-1">
          标的收盘价：
          {instrumentCloseLabel(activeInstrument?.close, instrument.source.currency)}（
          {backtestAdjustmentLabels[instrument.source.adjustment]}）
        </p>
      )}
      <p>
        {model.priceResearch ? '研究权益' : '组合权益'}：
        {activeEquity ? formatMoney(activeEquity.value) : '该时点缺失'}
      </p>
      {activeEquity && (
        <>
          <p>
            {model.priceResearch ? '研究资金余额' : '现金'}：
            {activeEquity.cash === null ? '不可用' : formatMoney(activeEquity.cash)}
          </p>
          <p>
            {model.priceResearch ? '研究持仓价值' : '持仓市值'}：
            {activeEquity.positionsValue === null
              ? '不可用'
              : formatMoney(activeEquity.positionsValue)}
          </p>
        </>
      )}
      <p>
        回撤：
        {activeDrawdown ? formatRatioPercent(activeDrawdown.value) : '该时点缺失'}
      </p>
      <BacktestChartTradeReadout
        groups={visibleModel.tradeMarkers.filter((group) => group.time === chart.activeTime)}
        timezone={model.timezone}
        currency={model.currency}
        research={Boolean(model.priceResearch)}
      />
    </div>
  );
}

function BacktestChartNotes({
  model,
  visibleModel,
  instrumentRequest,
}: {
  model: BacktestChartModel;
  visibleModel: BacktestChartModel;
  instrumentRequest: BacktestInstrumentChartRequest | undefined;
}) {
  const instrument = model.instrument?.status === 'available' ? model.instrument : null;
  return (
    <>
      {' '}
      {instrumentRequest?.error && (
        <p role="alert" className="text-xs text-muted-foreground">
          冻结标的走势读取失败，可使用页面刷新重试。
        </p>
      )}
      {model.instrument?.status === 'unavailable' && (
        <p className="text-xs text-muted-foreground">标的走势不可用：{model.instrument.message}</p>
      )}
      <p className="text-xs text-muted-foreground">
        点按锁定时点，上下键逐点查看。拖动平移，捏合缩放。
        {instrument?.source.timeframe === '1d' && '日线收盘价按来源时区对齐同日期权益时点。'}
        {visibleModel.tradeMarkers.length > 0 && '买卖点标在标的走势线上，成交明细见时点读数。'}
      </p>
      {!instrumentRequest?.fetching && visibleModel.unmappedFillCount > 0 && (
        <p className="text-xs text-muted-foreground">
          有 {visibleModel.unmappedFillCount} 笔成交缺少可对齐的标的价格或有效成交信息，未显示点位。
        </p>
      )}
    </>
  );
}

function instrumentCloseLabel(
  close: string | null | undefined,
  currency: string | null | undefined,
) {
  if (close === null || close === undefined) return '该时点缺失';
  return `${formatDecimalNumber(close)} ${currency ?? ''}`;
}

function ChartControls({
  model,
  onPreset,
  onAction,
  onReset,
}: {
  model: BacktestChartModel;
  onPreset: (days: number | null) => void;
  onAction: (action: 'zoomIn' | 'zoomOut' | 'earlier' | 'later') => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {backtestRangePresets(model.equity).map((preset) => (
        <Button key={preset.label} size="sm" variant="ghost" onClick={() => onPreset(preset.days)}>
          {preset.label}
        </Button>
      ))}
      <Button
        size="icon-sm"
        variant="outline"
        aria-label="放大图表"
        onClick={() => onAction('zoomIn')}
      >
        <ZoomIn />
      </Button>
      <Button
        size="icon-sm"
        variant="outline"
        aria-label="缩小图表"
        onClick={() => onAction('zoomOut')}
      >
        <ZoomOut />
      </Button>
      <Button
        size="icon-sm"
        variant="outline"
        aria-label="向前平移"
        onClick={() => onAction('earlier')}
      >
        <ArrowLeft />
      </Button>
      <Button
        size="icon-sm"
        variant="outline"
        aria-label="向后平移"
        onClick={() => onAction('later')}
      >
        <ArrowRight />
      </Button>
      <Button size="icon-sm" variant="outline" aria-label="重置图表范围" onClick={onReset}>
        <RotateCcw />
      </Button>
    </div>
  );
}
