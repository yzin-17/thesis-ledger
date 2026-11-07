import { describe, expect, it } from 'vitest';
import {
  formatPercentValue,
  formatRatioPercent,
  formatDecimalRatioPercent,
} from '../src/ratio-percent.js';
describe('百分数值保留自身单位和符号', () => {
  it.each([
    [12.3456, '12.35%', '+12.35%', '+12.35%'],
    [1e-7, '1E-7%', '+1E-7%', '+1E-7%'],
    [-1e-7, '-1E-7%', '-1E-7%', '-1E-7%'],
    [Number.MIN_VALUE, '5E-324%', '+5E-324%', '+5E-324%'],
    [-Number.MIN_VALUE, '-5E-324%', '-5E-324%', '-5E-324%'],
    [Number.MAX_VALUE, '1.797693E308%', '+1.797693E308%', '+1.797693E308%'],
    [-Number.MAX_VALUE, '-1.797693E308%', '-1.797693E308%', '-1.797693E308%'],
    [0, '0.00%', '+0.00%', '0.00%'],
    [-0, '0.00%', '+0.00%', '0.00%'],
    [null, '—', '—', '—'],
    [undefined, '—', '—', '—'],
    [NaN, '—', '—', '—'],
    [Infinity, '—', '—', '—'],
    [-Infinity, '—', '—', '—'],
    [0.0049, '4.9E-3%', '+4.9E-3%', '+4.9E-3%'],
    [0.005, '0.01%', '+0.01%', '+0.01%'],
  ] as const)('%s 的普通/始终/非零正号', (value, auto, always, exceptZero) => {
    expect(formatPercentValue(value)).toBe(auto);
    expect(formatPercentValue(value, 'always')).toBe(always);
    expect(formatPercentValue(value, 'exceptZero')).toBe(exceptZero);
  });
  it.each([
    [0.123456, '12.35%', '+12.35%', '+12.35%'],
    [1e-9, '1E-7%', '+1E-7%', '+1E-7%'],
    [-1e-9, '-1E-7%', '-1E-7%', '-1E-7%'],
    [Number.MIN_VALUE, '5E-322%', '+5E-322%', '+5E-322%'],
    [Number.MAX_VALUE, '1.797693E310%', '+1.797693E310%', '+1.797693E310%'],
    [0, '0.00%', '+0.00%', '0.00%'],
    [-0, '0.00%', '+0.00%', '0.00%'],
    [Infinity, '—', '—', '—'],
  ] as const)('比例 %s 保留原单位', (value, auto, always, exceptZero) => {
    expect(formatRatioPercent(value)).toBe(auto);
    expect(formatRatioPercent(value, 'always')).toBe(always);
    expect(formatRatioPercent(value, 'exceptZero')).toBe(exceptZero);
  });
  it('同一数值的不同单位不混用，旧文本三种精度保持', () => {
    expect(formatRatioPercent(1e-7)).toBe('1E-5%');
    expect(formatPercentValue(1e-7)).toBe('1E-7%');
    expect(formatDecimalRatioPercent('0.123456')).toBe('12.35%');
    expect(formatDecimalRatioPercent('0.123456', 3)).toBe('12.346%');
    expect(formatDecimalRatioPercent('0.123456', 6)).toBe('12.3456%');
  });
});
