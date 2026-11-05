import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  nonNegativeDecimalStringSchema,
  positiveDecimalStringSchema,
  positiveRatioStringSchema,
} from '../src/monetary-values.js';
import { sizingRuleSchema, riskRuleSchema } from '../src/backtest-strategy.js';

const candidates = [
  '',
  '0',
  '0.0',
  '0.000',
  '-0',
  '-0.0',
  '-1',
  '-0.1',
  '+1',
  '01',
  '.1',
  '1.',
  '1',
  '1.0',
  '1.00000000000000000001',
  '0.00000000000000000001',
  '1e-9',
  'NaN',
  '0.1000',
  '1.000',
  '10',
  '10000000000000000000000000000000000000000.1',
  ...Array.from({ length: 60 }, (_, n) => `${n % 4}.${String(n * 17).padStart(4, '0')}`),
];
const legacy = (value: string, positive: boolean, ratio: boolean) => {
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) || value.startsWith('-')) return false;
  if (positive && !/[1-9]/.test(value)) return false;
  const [whole, fraction = ''] = value.split('.');
  return !ratio || whole === '0' || (whole === '1' && /^0*$/.test(fraction));
};

describe('生成合同的十进制约束', () => {
  it.each([
    { schema: nonNegativeDecimalStringSchema, positive: false, ratio: false },
    { schema: positiveDecimalStringSchema, positive: true, ratio: false },
    { schema: positiveRatioStringSchema, positive: true, ratio: true },
  ])(
    '应用校验与输出JSON Schema保持既有接受集合 $positive/$ratio',
    ({ schema, positive, ratio }) => {
      const document = z.toJSONSchema(schema);
      expect(document.type).toBe('string');
      expect(document.pattern).toBeTypeOf('string');
      const pattern = new RegExp(document.pattern!);
      for (const value of candidates) {
        const expected = legacy(value, positive, ratio);
        expect(schema.safeParse(value).success, value).toBe(expected);
        expect(pattern.test(value), value).toBe(expected);
      }
    },
  );

  it('完整仓位和风险输出携带范围，精度不丢失', () => {
    for (const value of ['0', '1.00000000000000000001', '-0.1', '1e-9']) {
      expect(sizingRuleSchema.safeParse({ type: 'percentOfEquity', percent: value }).success).toBe(
        false,
      );
      expect(riskRuleSchema.safeParse({ type: 'fixedStop', percent: value }).success).toBe(false);
    }
    expect(
      sizingRuleSchema.parse({ type: 'percentOfEquity', percent: '0.00000000000000000001' }),
    ).toHaveProperty('percent', '0.00000000000000000001');
    const json = JSON.stringify(z.toJSONSchema(sizingRuleSchema));
    expect(json).toContain('pattern');
    expect(riskRuleSchema.parse({ type: 'fixedStop', percent: '1.000' })).toHaveProperty(
      'percent',
      '1.000',
    );
  });
});
