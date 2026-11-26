import { z } from 'zod';
import type { backtestIndicatorNameSchema as indicatorNameSchema } from './backtest-indicators.js';
import {
  sessionValueExpressionSchema,
  type SessionValueExpression,
} from './backtest-session-expression.js';
import type { BacktestDecimalString, SeriesField } from './backtest-values.js';
import { seriesFieldSchema } from './backtest-values.js';
import { decimalStringSchema, positiveDecimalStringSchema } from './monetary-values.js';
import { corporateActionTypeSchema, type CorporateActionType } from './backtest-values.js';
import { indicatorExpressionSchemaFor } from './backtest-expression-indicator.js';

type DecimalString = BacktestDecimalString;

export type PositionStateField = 'isOpen' | 'quantity' | 'averageCost' | 'holdingPeriods';
export type NumericExpression =
  | {
      type: 'confirmedPivot';
      side: 'low' | 'high';
      leftBars: number;
      rightBars: number;
      offset: 0 | 1;
      input: NumericExpression;
      sample?: NumericExpression | undefined;
    }
  | { type: 'eventValue' }
  | {
      type: 'rolling';
      statistic: 'sum' | 'standardDeviation' | 'quantile';
      periods: number;
      input: NumericExpression;
      ddof?: 0 | 1 | undefined;
      quantile?: string | undefined;
    }
  | { type: 'cumulative'; statistic: 'sum' | 'max'; anchorAt: string; input: NumericExpression }
  | { type: 'countTrue'; periods: number; condition: BooleanExpression }
  | {
      type: 'arithmetic';
      operator: 'add' | 'subtract' | 'multiply' | 'divide' | 'min' | 'max';
      left: NumericExpression;
      right: NumericExpression;
    }
  | { type: 'absolute'; input: NumericExpression }
  | { type: 'lag'; periods: number; input: NumericExpression }
  | SessionValueExpression
  | { type: 'constant'; value: DecimalString }
  | { type: 'series'; sourceId: string; field: SeriesField }
  | {
      type: 'indicator';
      name: z.infer<typeof indicatorNameSchema>;
      input: NumericExpression;
      params: Record<string, number | DecimalString>;
      output?: 'macd' | 'signal' | 'histogram' | 'adx' | 'plusDI' | 'minusDI';
    }
  | { type: 'positionState'; field: Exclude<PositionStateField, 'isOpen'> };
export type BooleanExpression =
  | {
      type: 'sequence';
      trigger: BooleanExpression;
      confirm: BooleanExpression;
      invalidation: BooleanExpression;
      within: number;
      allowSameBar: boolean;
      repeat: boolean;
      capture?: NumericExpression | undefined;
    }
  | { type: 'consecutive'; periods: number; condition: BooleanExpression }
  | { type: 'all'; conditions: BooleanExpression[] }
  | { type: 'any'; conditions: BooleanExpression[] }
  | { type: 'not'; expression: BooleanExpression }
  | {
      type: 'compare';
      operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
      left: NumericExpression;
      right: NumericExpression;
    }
  | {
      type: 'cross';
      direction: 'above' | 'below';
      left: NumericExpression;
      right: NumericExpression;
    }
  /**
   * A point-in-time corporate-action signal dependency. Matching uses the
   * action's explicit effectiveDate, and visibility requires strategyVisibility;
   * legacy occurredAt/availableAt alone do not make an action signal-eligible.
   */
  | { type: 'corporateActionEvent'; eventType: CorporateActionType }
  | { type: 'positionState'; field: 'isOpen' };
export type Expression = NumericExpression | BooleanExpression;

const constantExpressionSchema = z
  .object({ type: z.literal('constant'), value: decimalStringSchema })
  .strict();
const seriesExpressionSchema = z
  .object({
    type: z.literal('series'),
    sourceId: z.string().trim().min(1),
    field: seriesFieldSchema,
  })
  .strict();
const positionStateExpressionSchema = z
  .object({
    type: z.literal('positionState'),
    field: z.enum(['quantity', 'averageCost', 'holdingPeriods']),
  })
  .strict();

const indicatorExpressionSchema: z.ZodType<NumericExpression> = z.lazy(() =>
  indicatorExpressionSchemaFor(numericExpressionSchema),
);

export function numericExpressionWithConstant(value: z.ZodType<string>, scope?: {
  numeric: z.ZodType<NumericExpression>;
  boolean: z.ZodType<BooleanExpression>;
  eventValue: boolean;
}): z.ZodType<NumericExpression> {
  return z.lazy(() =>
    z.union([
      z.strictObject({
        type: z.literal('confirmedPivot'),
        side: z.enum(['low', 'high']),
        leftBars: z.number().int().min(1).max(1000),
        rightBars: z.number().int().min(1).max(1000),
        offset: z.union([z.literal(0), z.literal(1)]),
        input: scope?.numeric ?? numericExpressionSchema,
        sample: (scope?.numeric ?? numericExpressionSchema).optional(),
      }),
      ...(scope?.eventValue === false ? [] : [z.strictObject({ type: z.literal('eventValue') })]),
      z.strictObject({
        type: z.literal('rolling'),
        statistic: z.literal('sum'),
        periods: z.number().int().min(1).max(10000),
        input: scope?.numeric ?? numericExpressionSchema,
      }),
      z.strictObject({
        type: z.literal('rolling'),
        statistic: z.literal('standardDeviation'),
        periods: z.number().int().min(1).max(10000),
        input: scope?.numeric ?? numericExpressionSchema,
        ddof: z.literal(0).describe('总体标准差，分母为窗口根数。'),
      }),
      z.strictObject({
        type: z.literal('rolling'),
        statistic: z.literal('standardDeviation'),
        periods: z.number().int().min(2).max(10000),
        input: scope?.numeric ?? numericExpressionSchema,
        ddof: z.literal(1).describe('样本标准差，分母为窗口根数减一。'),
      }),
      z.strictObject({
        type: z.literal('rolling'),
        statistic: z.literal('quantile'),
        periods: z.number().int().min(1).max(10000),
        input: scope?.numeric ?? numericExpressionSchema,
        quantile: z.string().regex(/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/),
      }),
      z.strictObject({
        type: z.literal('cumulative'),
        statistic: z.enum(['sum', 'max']),
        anchorAt: z.iso.datetime({ offset: true }),
        input: scope?.numeric ?? numericExpressionSchema,
      }),
      z.strictObject({
        type: z.literal('countTrue'),
        periods: z.number().int().min(1).max(10000),
        condition: scope?.boolean ?? booleanExpressionSchema,
      }),
      z.strictObject({
        type: z.literal('arithmetic'),
        operator: z.enum(['add', 'subtract', 'multiply', 'divide', 'min', 'max']),
        left: scope?.numeric ?? numericExpressionSchema,
        right: scope?.numeric ?? numericExpressionSchema,
      }),
      z.strictObject({ type: z.literal('absolute'), input: scope?.numeric ?? numericExpressionSchema }),
      z.strictObject({
        type: z.literal('lag'),
        periods: z.number().int().min(1).max(10000),
        input: scope?.numeric ?? numericExpressionSchema,
      }),
      constantExpressionSchema.extend({ value }),
      seriesExpressionSchema,
      scope ? indicatorExpressionSchemaFor(scope.numeric) : indicatorExpressionSchema,
      sessionValueExpressionSchema,
      positionStateExpressionSchema,
    ]),
  );
}

export const numericExpressionSchema = numericExpressionWithConstant(decimalStringSchema);
/** 只限制表达式根部的常量；指标输入继续使用一般数值合同。 */
export const orderPriceExpressionSchema = numericExpressionWithConstant(
  positiveDecimalStringSchema,
);

export const booleanExpressionSchema: z.ZodType<BooleanExpression> = z.lazy(() =>
  z.union([
    z.strictObject({
      type: z.literal('sequence'),
      trigger: booleanExpressionSchema,
      confirm: booleanExpressionSchema,
      invalidation: booleanExpressionSchema,
      within: z.number().int().min(1).max(10000),
      allowSameBar: z.boolean(),
      repeat: z.boolean(),
      capture: numericExpressionSchema.optional(),
    }),
    z.strictObject({
      type: z.literal('consecutive'),
      periods: z.number().int().min(1).max(10000),
      condition: booleanExpressionSchema,
    }),
    z
      .object({ type: z.literal('all'), conditions: z.array(booleanExpressionSchema).min(1) })
      .strict(),
    z
      .object({ type: z.literal('any'), conditions: z.array(booleanExpressionSchema).min(1) })
      .strict(),
    z.object({ type: z.literal('not'), expression: booleanExpressionSchema }).strict(),
    z
      .object({
        type: z.literal('compare'),
        operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']),
        left: numericExpressionSchema,
        right: numericExpressionSchema,
      })
      .strict(),
    z
      .object({
        type: z.literal('cross'),
        direction: z.enum(['above', 'below']),
        left: numericExpressionSchema,
        right: numericExpressionSchema,
      })
      .strict(),
    z
      .object({
        type: z.literal('corporateActionEvent'),
        eventType: corporateActionTypeSchema,
      })
      .strict(),
    z.object({ type: z.literal('positionState'), field: z.literal('isOpen') }).strict(),
  ]),
);

export const expressionSchema: z.ZodType<Expression> = z.union([
  numericExpressionSchema,
  booleanExpressionSchema,
]);
