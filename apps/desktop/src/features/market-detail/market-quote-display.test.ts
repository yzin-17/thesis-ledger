import { describe, expect, it } from 'vitest';
import {
  formatQuoteChangePercent,
  quoteChangePercent,
  quoteChangeTone,
} from './market-quote-display.js';

const quote = (price: number, previousClose: number) => ({ price, previousClose });

describe('market quote change display', () => {
  it('按前收计算上涨百分比并使用上涨语义', () => {
    const value = quote(105, 100);

    expect(quoteChangePercent(value)).toBe(5);
    expect(formatQuoteChangePercent(value)).toBe('+5.00%');
    expect(quoteChangeTone(value)).toBe('up');
  });

  it('按前收计算下跌百分比并使用下跌语义', () => {
    const value = quote(4.53, 4.55);

    expect(quoteChangePercent(value)).toBeCloseTo(-0.4395604, 6);
    expect(formatQuoteChangePercent(value)).toBe('-0.44%');
    expect(quoteChangeTone(value)).toBe('down');
  });

  it('持平显示零值且使用中性色', () => {
    const value = quote(100, 100);

    expect(formatQuoteChangePercent(value)).toBe('0.00%');
    expect(quoteChangeTone(value)).toBeUndefined();
  });

  it('前收无效时 fail-closed', () => {
    const value = quote(100, 0);

    expect(quoteChangePercent(value)).toBeNull();
    expect(formatQuoteChangePercent(value)).toBe('--');
    expect(quoteChangeTone(value)).toBeUndefined();
  });
});
