import { describe, expect, it } from 'vitest';
import { DecimalValue } from '../src/decimal.js';

describe('有限 number 的显式十进制入口', () => {
  it.each([
    [0, '0'],
    [-0, '0'],
    [1 / 3, '0.3333333333333333'],
    [-12.345, '-12.345'],
    [1.234e-7, '0.0000001234'],
    [1e21, '1000000000000000000000'],
    [Number.MIN_VALUE, '0.' + '0'.repeat(323) + '5'],
    [-Number.MIN_VALUE, '-0.' + '0'.repeat(323) + '5'],
    [Number.MAX_VALUE, '17976931348623157' + '0'.repeat(292)],
  ])('将 %s 的规范十进制表示保持为 %s', (value, expected) => {
    expect(DecimalValue.fromNumber(value as number).toString()).toBe(expected);
  });

  it.each([NaN, Infinity, -Infinity])('拒绝非有限数值 %s', (value) => {
    expect(() => DecimalValue.fromNumber(value)).toThrow('有限');
  });

  it('科学计数的数值参与现有精确运算', () => {
    expect(DecimalValue.fromNumber(1e-9).times(DecimalValue.fromNumber(1e8)).toString()).toBe(
      '0.1',
    );
    expect(
      DecimalValue.fromNumber(Number.MIN_VALUE)
        .plus(DecimalValue.fromNumber(Number.MIN_VALUE))
        .toString(),
    ).toBe('0.' + '0'.repeat(322) + '1');
  });

  it('原始十进制字符串保留精度和既有语法', () => {
    const raw = '12345678901234567890.12345678901234567890123456789';
    expect(DecimalValue.from(raw).toString()).toBe(raw);
    expect(() => DecimalValue.from('1e-9')).toThrow('非法十进制值');
  });
});
