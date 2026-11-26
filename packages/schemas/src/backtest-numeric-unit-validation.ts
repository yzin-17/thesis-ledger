import type { NumericExpression } from './backtest-expression.js';
import type { SignalSource } from './backtest-values.js';

type Unit = string;
export function numericOperationAnalysis(
  node: NumericExpression,
  sources: readonly SignalSource[],
) {
  const issues: { path: (string | number)[]; message: string }[] = [];
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const scalar = (unit: Unit) => unit === 'constant' || unit === 'ratio';
  const compatible = (left: Unit, right: Unit) =>
    left === 'constant' || right === 'constant' || left === right;
  const visit = (input: NumericExpression, path: (string | number)[]): Unit => {
    if (input.type === 'confirmedPivot')
      return visit(input.sample ?? input.input, [...path, input.sample ? 'sample' : 'input']);
    if (input.type === 'eventValue') return 'constant';
    if (input.type === 'constant') return 'constant';
    if (input.type === 'positionState')
      return input.field === 'averageCost' ? 'execution:price' : input.field;
    if (input.type === 'sessionValue') {
      if (input.field === 'elapsedMinutes') return 'minutes';
      const source = sourceById.get(input.sourceId);
      return `${source?.asset.market}:${source?.priceCoordinate ?? 'run'}:price`;
    }
    if (input.type === 'series') {
      const source = sourceById.get(input.sourceId);
      if (input.field === 'volume') return `${input.sourceId}:volume`;
      return `${source?.asset.market}:${source?.priceCoordinate ?? 'run'}:price`;
    }
    if (input.type === 'countTrue') return 'periods';
    if (
      input.type === 'lag' ||
      input.type === 'absolute' ||
      input.type === 'rolling' ||
      input.type === 'cumulative'
    )
      return visit(input.input, [...path, 'input']);
    if (input.type === 'indicator') {
      const unit = visit(input.input, [...path, 'input']);
      return input.name === 'RSI' || input.name === 'ADX' ? 'ratio' : unit;
    }
    const left = visit(input.left, [...path, 'left']),
      right = visit(input.right, [...path, 'right']);
    if (input.operator === 'multiply') {
      if (scalar(left)) return right;
      if (scalar(right)) return left;
    } else if (input.operator === 'divide') {
      if (scalar(right)) return left;
      if (left === right) return 'ratio';
    } else if (compatible(left, right)) return left === 'constant' ? right : left;
    issues.push({ path, message: '数值运算单位不兼容；价格、数量与比例不能混算' });
    return 'unknown';
  };
  const unit = visit(node, []);
  return { unit, issues };
}
export const numericOperationUnitIssues = (
  node: NumericExpression,
  sources: readonly SignalSource[],
) => numericOperationAnalysis(node, sources).issues;
