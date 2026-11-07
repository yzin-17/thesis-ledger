import { describe, expect, it } from 'vitest';
import {
  allocationWeightFromPercent,
  allocationWeightToPercent,
} from '../src/allocation-targets.js';

describe('配置权重与百分比文本', () => {
  it.each([
    0,
    1,
    1 / 3,
    2 / 3,
    0.12345678901234566,
    0.8765432109876543,
    1e-9,
    1e-100,
    Number.MIN_VALUE,
  ])('已有有限权重 %s 往返保持原值', (weight) => {
    const percent = allocationWeightToPercent(weight);
    expect(allocationWeightFromPercent(percent)).toBe(weight);
    if (weight > 0) expect(/[1-9]/.test(percent)).toBe(true);
  });
  it('完整百分比文本不引入二进制乘法尾数', () => {
    expect(allocationWeightToPercent(1e-9)).toBe('0.0000001');
    expect(allocationWeightToPercent(0.3333333333333333)).toBe('33.33333333333333');
    expect(allocationWeightToPercent(0.26645084677376735)).toBe('26.645084677376735');
    expect(allocationWeightFromPercent('26.645084677376735')).toBe(0.26645084677376735);
  });
  it.each([
    '',
    ' ',
    'abc',
    '0x10',
    'NaN',
    'Infinity',
    '1e999',
    '1e-999',
    '0.00000000000000000000000000000000000001e-999',
  ])('拒绝非法或无法表达的非零输入 %s', (input) => {
    expect(allocationWeightFromPercent(input)).toBeNull();
  });
  it('接受输入中的完整小数及合法科学计数，范围留给目标校验', () => {
    expect(allocationWeightFromPercent(' 00.10 ')).toBe(0.001);
    expect(allocationWeightFromPercent('.5')).toBe(0.005);
    expect(allocationWeightFromPercent('1.')).toBe(0.01);
    expect(allocationWeightFromPercent('1e-7')).toBe(1e-9);
    expect(allocationWeightFromPercent('-1')).toBe(-0.01);
    expect(allocationWeightFromPercent('101')).toBe(1.01);
    expect(allocationWeightFromPercent('0e-999')).toBe(0);
  });
});
