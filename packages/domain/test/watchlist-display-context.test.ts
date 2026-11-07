import { expect, it } from 'vitest';
import { watchlistPriceDisplay } from '../src/watchlist-display.js';
const price = {
  kind: 'quote' as const,
  quote: {
    price: 4.124,
    previousClose: 4.195,
    open: 4.113,
    high: 4.169,
    low: 4.095,
    marketTime: '2026-11-06T08:14:52Z',
    fetchedAt: '2026-11-06T17:00:00Z',
    provider: 'tencent',
    stale: true,
  },
};
it('休市上下文与原时效、刷新失败分开，数值不受格式化改变', () => {
  const result = watchlistPriceDisplay(
    { ...price, quote: { ...price.quote, refreshFailure: 'fetch_failed' } },
    { session: 'closed_snapshot' },
  );
  expect(result).toMatchObject({
    value: '4.124',
    change: '-1.69%',
    changeAmount: '-0.071',
    source: '腾讯财经',
    status: '休市 · 最近时段快照',
    refresh: '刷新失败，沿用上次报价',
  });
  expect(result.quality).toContain('非官方收盘价');
  expect(price.quote.price).toBe(4.124);
  expect(watchlistPriceDisplay(price, { session: 'older_snapshot' }).status).toBe(
    '未覆盖最近交易时段',
  );
  expect(watchlistPriceDisplay(price).status).toBe('行情陈旧');
});
it('未知来源时间、缺报价、净值分开表达', () => {
  expect(
    watchlistPriceDisplay({ ...price, quote: { ...price.quote, marketTime: null } }).status,
  ).toBe('行情时间未知');
  expect(watchlistPriceDisplay({ kind: 'unavailable', reason: 'not_eligible' }).status).toBe(
    '行情来源不符合条件',
  );
  expect(
    watchlistPriceDisplay({
      kind: 'nav',
      nav: { unitNav: 1.2, navDate: '2026-11-06', freshness: 'delayed' },
    }),
  ).toMatchObject({ value: '1.2', change: '—', status: '正式净值', time: '2026-11-06' });
});
