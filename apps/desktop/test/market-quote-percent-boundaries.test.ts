import { expect, it } from 'vitest';
import {
  formatQuoteChangePercent,
  quoteChangePercent,
  quoteChangeTone,
} from '../src/features/market-detail/market-quote-display';
it.each([
  [1.000000001, 1, '+1E-7%', 'up'],
  [0.999999999, 1, '-1E-7%', 'down'],
  [Number.MAX_VALUE, 1, '+1.797693E310%', 'up'],
  [1, 1, '0.00%', undefined],
  [1, 0, '--', undefined],
  [1, Number.MIN_VALUE, '--', 'up'],
] as const)('报价 %s / %s 的文本和颜色', (price, previousClose, expected, tone) => {
  const quote = { price, previousClose },
    before = structuredClone(quote);
  expect(formatQuoteChangePercent(quote)).toBe(expected);
  expect(quoteChangeTone(quote)).toBe(tone);
  expect(quote).toEqual(before);
});
it('保留现有数值接口的普通值和范围，不让文本回写数值', () => {
  expect(quoteChangePercent({ price: 105, previousClose: 100 })).toBe(5);
  expect(quoteChangePercent({ price: Number.MAX_VALUE, previousClose: 1 })).toBe(Infinity);
  expect(quoteChangePercent({ price: Infinity, previousClose: 1 })).toBe(null);
});
