import { z } from 'zod';
import type { NumericExpression } from './backtest-expression.js';

const period = z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]);
const periodParams = z.strictObject({ period });
const closeInput = z.strictObject({
  type: z.literal('series'),
  sourceId: z.string().trim().min(1),
  field: z.literal('close'),
});

/** 参数和输出按指标名称关联；这些限制同时进入正式解析和实际原生JSON Schema。 */
export function indicatorExpressionSchemaFor(
  input: z.ZodType<NumericExpression>,
): z.ZodType<NumericExpression> {
  return z.union([
    z.strictObject({
      type: z.literal('indicator'),
      name: z.enum(['MA', 'EMA', 'RSI', 'VWAP', 'Highest', 'Lowest']),
      input,
      params: periodParams,
    }),
    z.strictObject({
      type: z.literal('indicator'),
      name: z.literal('ATR'),
      input: closeInput,
      params: periodParams,
    }),
    z.strictObject({
      type: z.literal('indicator'),
      name: z.literal('ADX'),
      input: closeInput,
      params: periodParams,
      output: z
        .enum(['adx', 'plusDI', 'minusDI'])
        .describe('ADX值、正向分量、负向分量在此明确选择，不放进params。'),
    }),
    z.strictObject({
      type: z.literal('indicator'),
      name: z.literal('MACD'),
      input,
      params: z.strictObject({ fastPeriod: period, slowPeriod: period, signalPeriod: period }),
      output: z.enum(['macd', 'signal', 'histogram']),
    }),
  ]);
}
