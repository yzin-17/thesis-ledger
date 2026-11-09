import {
  createSeriesMarkers,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type Time,
} from 'lightweight-charts';
import { toChartTime } from './market-chart-time.js';
import type { TradingOverlayModel } from './market-trading-overlay-model.js';
import { createMeasurementPrimitive } from './market-measurement-primitive.js';
import { createArenaMarkerPrimitive } from './market-arena-marker-primitive.js';

const markerClock = (currency: string, occurredAt: string, precision: string) => {
  if (precision === 'DATE') return '（按日）';
  let timeZone = 'Asia/Shanghai';
  if (currency === 'HKD') timeZone = 'Asia/Hong_Kong';
  else if (currency === 'USD') timeZone = 'America/New_York';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(occurredAt));
};

/** 资源归一个价格Series；调用方在替换数据、作用域或卸载时释放。 */
export function attachTradingOverlays(
  chart: IChartApi,
  series: ISeriesApi<SeriesType, Time>,
  model: TradingOverlayModel,
) {
  if (!model.arenaMarkers?.length && !model.markers.length && !model.lines.length && !model.measurement) return () => {};
  const style = getComputedStyle(document.documentElement);
  const buyColor = style.getPropertyValue('--color-market-up').trim() || '#c7393c';
  const sellColor = style.getPropertyValue('--color-market-down').trim() || '#2f7a66';
  const markers = createSeriesMarkers(
    series,
    [...model.markers.map((marker) => ({
      time: toChartTime(marker.key),order:marker.key,
      position: marker.side === 'buy' ? ('belowBar' as const) : ('aboveBar' as const),
      color: marker.side === 'buy' ? buyColor : sellColor,
      shape: marker.side === 'buy' ? ('arrowUp' as const) : ('arrowDown' as const),
      text: `${marker.side === 'buy' ? '买' : '卖'} ${marker.quantity} @${marker.price} ${markerClock(marker.currency, marker.occurredAt, marker.timePrecision)}`,
    }))].sort((a,b)=>a.order.localeCompare(b.order)),
    { autoScale: false },
  );
  const arena = model.arenaMarkers?.length ? createArenaMarkerPrimitive(model.arenaMarkers, {
    buy: buyColor, sell: sellColor,
    background: style.getPropertyValue('--popover').trim() || '#fff',
    foreground: style.getPropertyValue('--popover-foreground').trim() || '#171717',
    border: style.getPropertyValue('--border').trim() || '#e5e7eb',
    font: style.fontFamily || 'sans-serif',
  }) : undefined;
  if (arena) series.attachPrimitive(arena);
  const lines = model.lines.map((line) =>
    series.createPriceLine({
      price: line.price,
      title: line.title,
      color: line.kind === 'cost' ? '#64748b' : '#b45309',
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
    }),
  );
  let measurement: ISeriesApi<'Line', Time> | undefined;
  const measurementArea = model.measurement ? createMeasurementPrimitive(model.measurement) : undefined;
  if (model.measurement) {
    if (measurementArea) series.attachPrimitive(measurementArea);
    measurement = chart.addSeries(LineSeries, {
      color: '#2563eb',
      priceScaleId: 'right',
      lineWidth: 3,
      pointMarkersVisible: true,
      pointMarkersRadius: 4,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    const data = [{ key: model.measurement.from, value: model.measurement.fromPrice }];
    if (model.measurement.to !== model.measurement.from)
      data.push({ key: model.measurement.to, value: model.measurement.toPrice });
    data.sort((left, right) => left.key.localeCompare(right.key));
    measurement.setData(data.map(({ key, value }) => ({ time: toChartTime(key), value })));
  }
  return () => {
    markers.detach();
    if (arena) series.detachPrimitive(arena);
    lines.forEach((line) => series.removePriceLine(line));
    if (measurementArea) series.detachPrimitive(measurementArea);
    if (measurement) chart.removeSeries(measurement);
  };
}
