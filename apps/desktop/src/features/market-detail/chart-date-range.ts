export type ChartDateRange = { from: string; to: string };
export type ChartRange = number | ChartDateRange;

export const chartRangeOptions = [
  { value: 1, label: '今日' }, { value: 7, label: '一周' },
  { value: 30, label: '一月' }, { value: 180, label: '半年' },
  { value: 365, label: '一年' }, { value: 1095, label: '三年' },
] as const;

export function isChartDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function isChartDateRange(value: unknown): value is ChartDateRange {
  if (!value || typeof value !== 'object' || !('from' in value) || !('to' in value)) return false;
  return isChartDate(value.from) && isChartDate(value.to) && value.from <= value.to;
}

export function chartMarketDate(timestamp: string, symbol?: string): string {
  if (timestamp.length === 10) return timestamp;
  const zone = symbol?.endsWith('.US') ? 'America/New_York' : 'Asia/Shanghai';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(timestamp));
}

export function chartDateInterval(range: ChartRange, anchor: string): ChartDateRange | null {
  if (typeof range !== 'number') return range;
  if (![1, 7, 30, 90, 180, 365, 1095].includes(range)) return null;
  const date = new Date(`${anchor}T00:00:00Z`);
  if (range === 7) date.setUTCDate(date.getUTCDate() - 6);
  else if (range !== 1) {
    const months = ({ 30: 1, 90: 3, 180: 6, 365: 12, 1095: 36 } as Record<number, number>)[range]!;
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - months);
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, last));
  }
  return { from: date.toISOString().slice(0, 10), to: anchor };
}

export function chartRangeLabel(range: ChartRange, timeframe?: string): string {
  void timeframe;
  if (typeof range !== 'number') return '自定义区间';
  if (range === 0) return '全部已加载';
  if (range === 90) return '三月';
  return chartRangeOptions.find((option) => option.value === range)?.label ?? '自定义区间';
}

export function chartHistoryPointLimit(current: number, start: string | undefined, latest: string | undefined, timeframe: string) {
  const days = typeof start === 'string' && isChartDate(start) && latest ? Math.max(0, (Date.parse(latest) - Date.parse(start)) / 86_400_000) : 0;
  let requested = days + 90;
  if (/^(1|5|15|30|60)m$/.test(timeframe)) requested = days * 390 / Number.parseInt(timeframe, 10) + 90;
  else if (timeframe === '1w') requested = days / 7 + 90;
  else if (timeframe === '1mo') requested = days / 28 + 90;
  else if (timeframe === '1y') requested = days / 365 + 90;
  return Math.min(3000, Math.max(current + 90, Math.ceil(requested)));
}
