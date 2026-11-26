import { z } from 'zod';
import { numericExpressionWithConstant, type BooleanExpression, type NumericExpression } from './backtest-expression.js';
import { decimalStringSchema } from './monetary-values.js';
import { corporateActionTypeSchema } from './backtest-values.js';

function booleanScope(numeric: z.ZodType<NumericExpression>, self: z.ZodType<BooleanExpression>,
  sequence: boolean): z.ZodType<BooleanExpression> {
  return z.lazy(() => z.union([
    z.strictObject({ type: z.literal('all'), conditions: z.array(self).min(1) }),
    z.strictObject({ type: z.literal('any'), conditions: z.array(self).min(1) }),
    z.strictObject({ type: z.literal('not'), expression: self }),
    z.strictObject({ type: z.literal('compare'), operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']), left: numeric, right: numeric }),
    z.strictObject({ type: z.literal('cross'), direction: z.enum(['above', 'below']), left: numeric, right: numeric }),
    z.strictObject({ type: z.literal('corporateActionEvent'), eventType: corporateActionTypeSchema }),
    z.strictObject({ type: z.literal('positionState'), field: z.literal('isOpen') }),
    z.strictObject({ type: z.literal('consecutive'), periods: z.number().int().min(1).max(10000), condition: self }),
    ...(sequence ? [
      z.strictObject({ type: z.literal('sequence'), trigger: plainBoolean, capture: plainNumeric,
        confirm: boundBoolean, invalidation: boundBoolean, within: z.number().int().min(1).max(10000),
        allowSameBar: z.boolean(), repeat: z.boolean() }),
      z.strictObject({ type: z.literal('sequence'), trigger: plainBoolean, confirm: plainBoolean,
        invalidation: plainBoolean, within: z.number().int().min(1).max(10000), allowSameBar: z.boolean(), repeat: z.boolean() }),
    ] : []),
  ]));
}

const plainNumeric: z.ZodType<NumericExpression> = z.lazy(() => numericExpressionWithConstant(decimalStringSchema,
  { numeric: plainNumeric, boolean: plainBoolean, eventValue: false }));
const plainBoolean: z.ZodType<BooleanExpression> = z.lazy(() => booleanScope(plainNumeric, plainBoolean, false));
const boundNumeric: z.ZodType<NumericExpression> = z.lazy(() => numericExpressionWithConstant(decimalStringSchema,
  { numeric: boundNumeric, boolean: boundBoolean, eventValue: true }));
const boundBoolean: z.ZodType<BooleanExpression> = z.lazy(() => booleanScope(boundNumeric, boundBoolean, false));
const rootNumeric: z.ZodType<NumericExpression> = z.lazy(() => numericExpressionWithConstant(decimalStringSchema,
  { numeric: rootNumeric, boolean: rootBoolean, eventValue: false }));
const rootBoolean: z.ZodType<BooleanExpression> = z.lazy(() => booleanScope(rootNumeric, rootBoolean, true));

/** 无绑定和有capture分支分开；capture不继承自身绑定，嵌套sequence仍不开放。 */
export const generatedBooleanExpressionV6Schema = rootBoolean.describe(
  '当前值已经是该周期在决策时刻完成且可见的最新值；lag(1)表示再前一根。eventValue仅在同一sequence已明确capture的confirm／invalidation中使用。',
);
export const generatedNumericExpressionV6Schema = rootNumeric;
