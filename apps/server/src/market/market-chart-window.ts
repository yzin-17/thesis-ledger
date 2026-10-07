import { dateInMarket } from './market-window-selector-v3.js';

const chartDate = (value: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
      throw new Error('图表日期无效');
    return value;
  }
  const date = dateInMarket(value, 'CN');
  if (!date) throw new Error('图表日期无效');
  return date;
};

/** Planning and acquisition must use the same calendar window, including indicator warmup. */
export function planMarketChartWindow(window: { start?: string; end?: string; limit?: number }) {
  const limit = window.limit ?? 90;
  if (!Number.isInteger(limit) || limit < 1 || limit > 3650) throw new Error('图表条数无效');
  const end = chartDate(window.end ?? new Date().toISOString());
  const defaultStart = new Date(`${end}T00:00:00Z`);
  defaultStart.setUTCDate(defaultStart.getUTCDate() - Math.max(365, limit * 3));
  const start = window.start ? chartDate(window.start) : defaultStart.toISOString().slice(0, 10);
  if (start > end) throw new Error('图表日期窗口无效');
  return { start, end };
}
