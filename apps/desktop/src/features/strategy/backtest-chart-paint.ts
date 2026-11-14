import { formatRatioPercent, formatDecimalNumber } from '@thesis-ledger/domain';
import type { IChartApi, ISeriesMarkersPluginApi, Time, UTCTimestamp } from 'lightweight-charts';
import { formatDateTimeInTimeZone } from '@/lib/date-display';
import type { BacktestChartModel } from './strategy-backtest-chart.model.js';

type SeriesApi = ReturnType<IChartApi['addSeries']>;

export const backtestChartTime = (milliseconds: number) =>
  Math.floor(milliseconds / 1_000) as UTCTimestamp;

const currencyFormatter = (currency: BacktestChartModel['currency']) => {
  if (!currency)
    return (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  const formatter = new Intl.NumberFormat('zh-CN', {
    style: 'currency', currency, maximumFractionDigits: 2,
  });
  return (value: number) => formatter.format(value);
};

/** 将完整模型与当前主题写入序列；不改变窗口、选中时点或资源生命周期。 */
export function paintBacktestChart(
  chart: IChartApi,
  equitySeries: SeriesApi,
  drawdownSeries: SeriesApi,
  tradeMarkers: ISeriesMarkersPluginApi<Time> | null,
  model: BacktestChartModel,
  instrumentSeries?: SeriesApi | null,
) {
  const css = (name: string, fallback: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  chart.applyOptions({
    layout: {
      background: { color: 'transparent' },
      textColor: css('--muted-foreground', '#64748b'),
      attributionLogo: false,
    },
    localization: {
      timeFormatter: (time: Time) => typeof time === 'number' && Number.isFinite(time)
        ? formatDateTimeInTimeZone(time * 1_000, model.timezone, '') : '',
    },
    leftPriceScale: { visible: model.instrument?.status === 'available' },
  });
  const instrument = model.instrument?.status === 'available' ? model.instrument : null;
  instrumentSeries?.applyOptions({
    color: '#8b5cf6', lineWidth: 2, visible: Boolean(instrument),
    pointMarkersVisible: instrument?.points.length === 1, title: '标的',
    priceFormat: { type: 'custom', formatter: (value: number) => formatDecimalNumber(String(value)) },
  });
  instrumentSeries?.setData((instrument?.points ?? []).map((point) => point.value === null
    ? { time: backtestChartTime(point.time) }
    : { time: backtestChartTime(point.time), value: point.value }));
  equitySeries.applyOptions({
    color: css('--chart-1', '#2563eb'),
    lineWidth: 2,
    pointMarkersVisible: model.equity.length <= 1,
    priceFormat: { type: 'custom', formatter: currencyFormatter(model.currency) },
    title: `${model.priceResearch ? '研究权益' : '组合权益'} ${model.currency ?? ''}`.trim(),
  });
  drawdownSeries.applyOptions({
    color: css('--muted-foreground', '#64748b'),
    lineWidth: 2,
    pointMarkersVisible: model.drawdown.length <= 1,
    priceFormat: { type: 'custom', formatter: formatRatioPercent },
    title: model.drawdownSource === 'authoritative' ? '回撤' : '回撤（展示派生）',
  });
  equitySeries.setData(model.equity.map(point => ({ time: backtestChartTime(point.time), value: point.value })));
  drawdownSeries.setData(model.drawdown.map(point => ({ time: backtestChartTime(point.time), value: point.value })));
  tradeMarkers?.setMarkers(model.tradeMarkers.map((group) => ({
    id: group.id,
    time: backtestChartTime(group.time),
    position: group.side === 'buy' ? 'belowBar' : 'aboveBar',
    shape: group.side === 'buy' ? 'arrowUp' : 'arrowDown',
    color: group.side === 'buy' ? css('--color-market-up', '#c7393c') : css('--color-market-down', '#2f7a66'),
    text: `${group.side === 'buy' ? '买' : '卖'}${group.fills.length > 1 ? ` ${group.fills.length}笔` : ''}`,
  })));
}
