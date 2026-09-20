import { useMemo } from 'react';
import { ArrowLeft, ArrowRight, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BacktestChartModel } from './strategy-backtest-chart.model.js';
import { backtestRangePresets } from './strategy-backtest-chart.model.js';
import { useStrategyBacktestChart } from './useStrategyBacktestChart.js';

const formatTime = (time: number, timezone: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(time));

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
}: {
  model: BacktestChartModel;
  resetKey: string;
  onRangeChange: (range: { from: number; to: number } | null) => void;
}) {
  const equityByTime = useMemo(
    () => new Map(model.equity.map((point) => [point.time, point])),
    [model.equity],
  );
  const drawdownByTime = useMemo(
    () => new Map(model.drawdown.map((point) => [point.time, point])),
    [model.drawdown],
  );
  const chart = useStrategyBacktestChart({ model, resetKey, onRangeChange });
  const activeEquity =
    chart.activeTime === null ? null : (equityByTime.get(chart.activeTime) ?? null);
  const activeDrawdown =
    chart.activeTime === null ? null : (drawdownByTime.get(chart.activeTime) ?? null);
  const formatMoney = currencyFormatter(model.currency);

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
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-5 bg-chart-1" />
            组合权益
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-5 bg-[var(--color-market-down)]" />
            {model.drawdownSource === 'authoritative' ? '权威回撤' : '展示派生回撤'}
          </span>
          <span>时区 {model.timezone}</span>
        </div>
        <ChartControls
          model={model}
          onPreset={chart.selectPreset}
          onAction={chart.changeRange}
          onReset={chart.reset}
        />
      </div>
      <div className="relative rounded-lg border bg-card">
        <div
          ref={chart.containerRef}
          tabIndex={0}
          role="region"
          aria-label="权益与回撤联动图表。方向键平移，加减键缩放，Home 键重置。"
          onKeyDown={(event) => {
            if (event.key === '+' || event.key === '=') chart.changeRange('zoomIn');
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
          <div className="pointer-events-none absolute left-3 top-3 rounded-md border bg-popover/95 px-3 py-2 text-xs shadow-sm">
            <p className="font-medium">
              {formatTime(chart.activeTime, model.timezone)}
              {chart.lockedTime !== null ? ' · 已锁定' : ''}
            </p>
            <p className="mt-1">
              组合权益：{activeEquity ? formatMoney(activeEquity.value) : '该时点缺失'}
            </p>
            <p>
              回撤：
              {activeDrawdown ? `${(activeDrawdown.value * 100).toFixed(2)}%` : '该时点缺失'}
            </p>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        可拖动平移、捏合缩放或使用按钮与键盘；点按时点可锁定提示。页头指标始终保持全任务口径。
      </p>
    </div>
  );
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
