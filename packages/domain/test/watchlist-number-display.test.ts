import { describe, expect, it } from 'vitest';
import { watchlistPriceDisplay } from '../src/watchlist-display.js';
import samples from './watchlist-number-samples.json';
const quote = (sample: (typeof samples)[number]) => ({
  kind: 'quote' as const,
  quote: {
    price: sample.price,
    previousClose: sample.previousClose,
    open: sample.open,
    high: sample.high,
    low: sample.low,
    marketTime: '2026-11-06T08:00:00Z',
    stale: false,
    units: { priceCurrency: 'CNY' },
  },
});
describe('自选数字展示保留非零事实', () => {
  it.each(samples)('$name：价格、涨跌、区间只读投影', (sample) => {
    const input = quote(sample),
      before = structuredClone(input);
    const projection = watchlistPriceDisplay(input);
    for (const field of [
      'value',
      'change',
      'changeAmount',
      'open',
      'previousClose',
      'high',
      'low',
    ] as const)
      expect(projection[field]).toBe(sample.expected[field]);
    expect(input).toEqual(before);
  });
  it.each([
    [1e-7, '1E-7'],
    [Number.MIN_VALUE, '5E-324'],
    [Number.MAX_VALUE, '1.797693E308'],
    [1.2, '1.2'],
    [0, '0'],
    [-0, '0'],
  ] as const)('正式净值 %s 保留日期与原值', (unitNav, expected) => {
    const price = {
      kind: 'nav' as const,
      nav: { unitNav, navDate: '2026-11-06T00:00:00Z', freshness: 'delayed' },
    };
    expect(watchlistPriceDisplay(price)).toMatchObject({
      value: expected,
      change: '—',
      time: '2026-11-06',
      status: '正式净值',
    });
    expect(Object.is(price.nav.unitNav, unitNav)).toBe(true);
  });
  it.each([
    [0.000049, '4.9E-5'],
    [0.00005, '0.0001'],
    [100000000000000000000, '100,000,000,000,000,000,000'],
  ] as const)('四位格式边界 %s', (unitNav, expected) => {
    expect(
      watchlistPriceDisplay({
        kind: 'nav',
        nav: { unitNav, navDate: '2026-11-06', freshness: 'delayed' },
      }).value,
    ).toBe(expected);
  });
  it('负零报价统一零，前收无效仍无涨跌', () => {
    const price = quote(samples[0]!);
    Object.assign(price.quote, { price: -0, previousClose: -0, open: -0, high: -0, low: -0 });
    expect(watchlistPriceDisplay(price)).toMatchObject({
      value: '0 CNY',
      change: '—',
      changeAmount: '—',
      open: '0',
      high: '0',
      low: '0',
      previousClose: '0',
    });
    expect(Object.is(price.quote.price, -0)).toBe(true);
  });
  it.each([NaN, Infinity, -Infinity])('非法数值 %s 不显示为数字事实', (value) => {
    const price = quote(samples[0]!);
    Object.assign(price.quote, {
      price: value,
      previousClose: value,
      open: value,
      high: value,
      low: value,
    });
    expect(watchlistPriceDisplay(price)).toMatchObject({
      value: '— CNY',
      change: '—',
      changeAmount: '—',
      open: '—',
      previousClose: '—',
      high: '—',
      low: '—',
    });
    expect(
      watchlistPriceDisplay({
        kind: 'nav',
        nav: { unitNav: value, navDate: '2026-11-06', freshness: 'stale' },
      }),
    ).toMatchObject({ value: '—', status: '净值陈旧' });
  });
  it('极小金额与未知字段分开，原商数越界不猜测', () => {
    const price = quote(samples[0]!);
    Object.assign(price.quote, {
      price: Number.MIN_VALUE,
      previousClose: 0,
      open: undefined,
      high: undefined,
      low: undefined,
    });
    expect(watchlistPriceDisplay(price)).toMatchObject({
      value: '5E-324 CNY',
      open: '—',
      high: '—',
      low: '—',
      change: '—',
    });
    price.quote.price = 1;
    price.quote.previousClose = Number.MIN_VALUE;
    expect(watchlistPriceDisplay(price).change).toBe('—');
    expect(watchlistPriceDisplay().value).toBe('—');
  });
});
