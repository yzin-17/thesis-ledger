import { expect, it } from 'vitest';
import { resolveMarketNewsTimeRange } from '../src/features/market-data/MarketNewsTimeRangeField.js';

it.each(['1', '3', '7', '30'] as const)('最近 %s 天以本次读取时刻倒推', (preset) => {
  const now = new Date('2026-11-09T08:00:00Z');
  const range = resolveMarketNewsTimeRange({ preset, start: '', end: '' }, now);
  expect(range.publishedEnd).toBe(now.toISOString());
  expect(Date.parse(range.publishedEnd) - Date.parse(range.publishedStart)).toBe(Number(preset) * 86_400_000);
});

it('自定义日期包含本地起止日全天', () => {
  const range = resolveMarketNewsTimeRange({ preset: 'custom', start: '2026-11-08', end: '2026-11-09' });
  expect(range.publishedStart).toBe(new Date(2026, 10, 8, 0, 0, 0, 0).toISOString());
  expect(range.publishedEnd).toBe(new Date(2026, 10, 9, 23, 59, 59, 999).toISOString());
});

it.each([
  ['', '2026-11-09', '请选择起始日期和截止日期'],
  ['2026-11-09', '', '请选择起始日期和截止日期'],
  ['2026-11-09', '2026-11-08', '截止日期不能早于起始日期'],
  ['2026-02-30', '2026-03-02', '请选择有效的日期'],
  ['invalid', '2026-11-09', '请选择有效的日期'],
])('错误日期 %s 至 %s 不生成请求', (start, end, message) => {
  expect(() => resolveMarketNewsTimeRange({ preset: 'custom', start, end })).toThrow(message);
});
