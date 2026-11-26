import type { Expression } from './backtest-strategy.js';
import { expressionChildren } from './backtest-expression-children.js';
import { expressionSourceIds } from './backtest-expression-observations.js';
import { requiredLookbackForExpression } from './backtest-indicators.js';

/** 复用额外周期规划的同源窗口口径，不把另一来源的长窗强加给当前来源。 */
export function sourceExpressionLookback(expression: Expression, sourceId: string): number {
  const ids = expressionSourceIds(expression);
  if (!ids.includes(sourceId)) return 0;
  if (ids.length === 1) return requiredLookbackForExpression(expression);
  return Math.max(0, ...expressionChildren(expression).map((child) =>
    sourceExpressionLookback(child, sourceId))) + Number(expression.type === 'cross');
}
