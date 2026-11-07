import { describe, expect, it } from 'vitest';
import { formatMarketNumber, formatMarketQuotePrice } from '../src/market-number-display.js';
import { formatPercentValue } from '../src/ratio-percent.js';
import samples from './market-number-samples.json';
describe('Market 数字事实的精度与零值', () => {
  it.each(samples)('$name：三种精度保持合同', (sample) => {
    expect(formatMarketNumber(sample.value)).toBe(sample.compact);
    expect(formatMarketNumber(sample.value, 'valuation')).toBe(sample.valuation);
    expect(formatMarketNumber(sample.value, 'measurement')).toBe(sample.measurement);
  });
  it.each(samples)('$name：报价币种及未知原因', (sample) => {
    expect(formatMarketQuotePrice(sample.value, 'CNY')).toBe(sample.quote);
    expect(formatMarketQuotePrice(sample.value, 'HKD')).toBe(sample.quote.replace('¥', 'HK$'));
    expect(formatMarketQuotePrice(sample.value, 'USD')).toBe(sample.quote.replace('¥', 'US$'));
    expect(formatMarketQuotePrice(sample.value, undefined)).toBe(
      sample.value === null ? '—' : sample.quote.slice(1) + '（币种未知）',
    );
  });
  it.each([undefined, null, NaN, Infinity, -Infinity])('缺失或非法 %s 保持未知', (value) => {
    expect(formatMarketNumber(value)).toBe('—');
    expect(formatMarketNumber(value, 'valuation')).toBe('—');
    expect(formatMarketNumber(value, 'measurement')).toBe('—');
    expect(formatMarketQuotePrice(value, 'CNY')).toBe('—');
    expect(formatMarketQuotePrice(value, undefined)).toBe('—');
  });
  it.each([
    [-1e-8, '-1E-8', '-1E-8', '-¥0.00000001'],
    [-Number.MIN_VALUE, '-5E-324', '-5E-324', '-¥5E-324'],
    [-Number.MAX_VALUE, '-1.797693E308', '-1.797693E308', '-¥1.797693E308'],
    [-0, '0', '0.0000', '¥0.00'],
  ] as const)('负值与负零 %s', (value, compact, valuation, quote) => {
    expect(formatMarketNumber(value)).toBe(compact);
    expect(formatMarketNumber(value, 'measurement')).toBe(compact);
    expect(formatMarketNumber(value, 'valuation')).toBe(valuation);
    expect(formatMarketQuotePrice(value, 'CNY')).toBe(quote);
  });
  it.each([
    [0.000049, 'compact', '4.9E-5'],
    [0.00005, 'compact', '0.0001'],
    [0.00000049, 'measurement', '4.9E-7'],
    [0.0000005, 'measurement', '0.000001'],
  ] as const)('舍入边界 %s / %s', (value, precision, expected) => {
    expect(formatMarketNumber(value, precision)).toBe(expected);
  });
  it.each([
    [1e-21, '¥1E-21'],
    [1e-20, '¥0.00000000000000000001'],
  ] as const)('报价二十位边界 %s', (value, expected) => {
    expect(formatMarketQuotePrice(value, 'CNY')).toBe(expected);
  });
  it.each([
    [0.123456789, '0.123457%'],
    [1e-8, '1E-8%'],
    [Number.MIN_VALUE, '5E-324%'],
    [Number.MAX_VALUE, '1.797693E308%'],
    [0, '0%'],
    [null, '—'],
    [Infinity, '—'],
  ] as const)('测量百分数值 %s 保留最多六位', (value, expected) => {
    expect(formatPercentValue(value, 'auto', 6)).toBe(expected);
  });
});
