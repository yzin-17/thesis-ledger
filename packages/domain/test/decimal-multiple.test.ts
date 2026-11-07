import { describe, expect, it } from 'vitest';
import { DecimalValue } from '../src/decimal.js';

describe('十进制精确倍数', () => {
  it.each([
    ['0.1', '0.005', true],
    ['0.1000000000000000001', '0.005', false],
    ['0.0999999999999999999', '0.005', false],
    ['1.2', '0.03', true],
    ['-0.1', '0.005', true],
    ['-0.11', '0.05', false],
    ['0', '-2.5', true],
    ['1000000000000000000000000000000.000001', '0.0000001', true],
    ['0.000000000000000000000000000001', '0.000000000000000000000000000002', false],
  ] as const)('%s 是否为 %s 的倍数：%s', (value, step, expected) => {
    expect(DecimalValue.from(value).isMultipleOf(step)).toBe(expected);
  });

  it('支持已有 DecimalValue 及规范化尺度', () => {
    expect(DecimalValue.from('1.2000').isMultipleOf(DecimalValue.from('0.03000'))).toBe(true);
    expect(DecimalValue.fromNumber(Number.MIN_VALUE).isMultipleOf('0.1')).toBe(false);
  });

  it('明确拒绝零除数', () => {
    expect(() => DecimalValue.from('0').isMultipleOf('0.000')).toThrow('不能除以零');
    expect(() => DecimalValue.from('1').isMultipleOf('0')).toThrow('不能除以零');
  });
});
