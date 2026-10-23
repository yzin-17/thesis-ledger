import type { Time, UTCTimestamp, DeepPartial, ChartOptions } from 'lightweight-charts';
import type { MarketChartBar } from './market-chart-types.js';

export const chartPointKey = (timestamp: string, timeframe?: string) =>
  timeframe === '1m' ? new Date(timestamp).toISOString() : timestamp.slice(0, 10);

export function chartCursorForKey(bars: readonly MarketChartBar[], selected: string | null, key: string) {
  if (!bars.length || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return undefined;
  let index = selected ? bars.findIndex(bar => chartPointKey(bar.timestamp, bar.timeframe) === selected) : bars.length - 1;
  if (index < 0) index = bars.length - 1;
  if (key === 'Home') index = 0;
  else if (key === 'End') index = bars.length - 1;
  else if (key === 'ArrowLeft') index = Math.max(0, index - 1);
  else index = Math.min(bars.length - 1, index + 1);
  const bar = bars[index];
  return bar ? chartPointKey(bar.timestamp, bar.timeframe) : undefined;
}

export function toChartTime(key: string): Time {
  if (key.length === 10) return key;
  const value = Date.parse(key);
  if (!Number.isFinite(value)) throw new Error('图表分钟时间无效');
  return (value / 1000) as UTCTimestamp;
}

export function chartInteractionKey(time: unknown): string | null {
  if (typeof time === 'number' && Number.isFinite(time)) return new Date(time * 1000).toISOString();
  if (typeof time === 'string') return time;
  if (time && typeof time === 'object' && 'year' in time && 'month' in time && 'day' in time &&
      typeof time.year === 'number' && typeof time.month === 'number' && typeof time.day === 'number') {
    return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`;
  }
  return null;
}

export const chartTimeData = (data: readonly unknown[]) => data.map((point) =>
  point && typeof point === 'object' && 'time' in point && typeof point.time === 'string'
    ? { ...point, time: toChartTime(point.time) } : point);

const marketZone = (bar: MarketChartBar) =>
  bar.symbol?.endsWith('.HK') ? 'Asia/Hong_Kong' : 'America/New_York';

export function formatChartBarTime(bar: MarketChartBar) {
  if (bar.timeframe !== '1m') return new Date(bar.timestamp.slice(0, 10)).toLocaleDateString('zh-CN');
  const text = new Intl.DateTimeFormat('zh-CN', {
    timeZone: marketZone(bar), year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(bar.timestamp));
  return `${text} ${bar.symbol?.endsWith('.HK') ? '香港时间' : '美东时间'}`;
}

export function marketChartTimeOptions(bar: MarketChartBar | undefined): DeepPartial<ChartOptions> {
  if (bar?.timeframe !== '1m') return { timeScale: { timeVisible: false } };
  const zone = marketZone(bar);
  const tick = new Intl.DateTimeFormat('zh-CN', {
    timeZone: zone, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const dateFor = (value: Time) => new Date(typeof value === 'number' ? value * 1000 : chartInteractionKey(value) ?? '');
  return {
    timeScale: { timeVisible: true, secondsVisible: false, tickMarkFormatter: (value: Time) => tick.format(dateFor(value)) },
    localization: { timeFormatter: (value: Time) => tick.format(dateFor(value)) },
  };
}
