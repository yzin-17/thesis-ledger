import { describe, expect, it } from 'vitest';
import { quoteSchema } from '../src/market.js';

const quote = {
  version: 3,
  symbol: '510300.SH',
  open: 4.1,
  high: 4.3,
  low: 4,
  price: 4.2,
  previousClose: 4.15,
  volume: null,
  amount: null,
  marketTime: '2026-09-30T08:14:43+00:00',
  fetchedAt: '2026-10-06T08:12:29+00:00',
  provider: 'hithink',
  upstreamSource: 'fund-market-snapshot',
  freshness: 'stale',
  stale: true,
  units: { priceCurrency: 'CNY', volume: 'unknown', turnoverCurrency: 'unknown' },
};

describe('基础 Quote 可空量额合同', () => {
  it('保留价格、双时钟和未知单位，不将缺失量额补零', () => {
    expect(quoteSchema.parse(quote)).toEqual(quote);
    expect(
      quoteSchema.parse({ ...quote, marketTime: null, freshness: 'unknown', stale: false }),
    ).toMatchObject({ marketTime: null, freshness: 'unknown', volume: null, amount: null });
  });

  it.each([0, 123.45])('既有数值 %s 原样通过', (value) => {
    expect(quoteSchema.parse({ ...quote, volume: value, amount: value })).toMatchObject({
      volume: value,
      amount: value,
    });
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, true, '--'])(
    '非法量额 %s 必须由生产者规范为空',
    (value) => {
      expect(quoteSchema.safeParse({ ...quote, volume: value }).success).toBe(false);
      expect(quoteSchema.safeParse({ ...quote, amount: value }).success).toBe(false);
    },
  );

  it('不放宽必要价格、OHLC、证券和时间约束', () => {
    for (const invalid of [
      { price: Number.NaN },
      { price: -1 },
      { high: 3 },
      { low: 5 },
      { symbol: '510300.OF' },
      { fetchedAt: 'unknown' },
    ])
      expect(quoteSchema.safeParse({ ...quote, ...invalid }).success).toBe(false);
  });
});
