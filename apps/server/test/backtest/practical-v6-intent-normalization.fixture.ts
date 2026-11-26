import { DecimalValue, type Expression } from '@thesis-ledger/domain';
import type { BacktestStrategy } from '@thesis-ledger/schemas';

type Node = Record<string, unknown>;
const object = (value: unknown): Node | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Node : undefined;
const decimal = (value: unknown) => DecimalValue.from(String(value)).toString();
const key = (value: unknown) => JSON.stringify(value);
const flat = { flat: true };

/** 只规范化已列明的等价形式；独立验收比较不修改原始AST。 */
export function intentExpression(expression: Expression, strategy: BacktestStrategy): unknown {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    const node = object(value);
    if (!node) return value;
    if (node.type === 'constant') return { type: 'constant', value: decimal(node.value) };
    if (node.type === 'series' || node.type === 'sessionValue') {
      const source = strategy.signalSources.find((s) => s.id === node.sourceId);
      return { type: node.type, field: node.field, source: source ?
        [source.asset.market, source.asset.symbol, source.asset.assetType, source.timeframe].join('/') : `未声明:${String(node.sourceId)}` };
    }
    if (node.type === 'not') {
      const child = object(node.expression);
      if (child?.type === 'not') return visit(child.expression);
      if (child?.type === 'positionState' && child.field === 'isOpen') return flat;
      const input = visit(node.expression);
      return typeof input === 'boolean' ? !input : { type: 'not', expression: input };
    }
    if (node.type === 'all' || node.type === 'any') {
      const conjunction = node.type === 'all';
      const children = (node.conditions as unknown[]).map(visit).flatMap((condition) => {
        const child = object(condition);
        return child && child.type === node.type ? child.conditions as unknown[] : [condition];
      });
      if (children.includes(!conjunction)) return !conjunction;
      const kept = children.filter((child) => child !== conjunction).sort((a, b) => key(a).localeCompare(key(b)));
      if (!kept.length) return conjunction;
      return kept.length === 1 ? kept[0] : { type: node.type, conditions: kept };
    }
    if (node.type === 'arithmetic' && node.operator === 'divide') {
      const sum = object(node.left), divisor = object(node.right);
      if (sum?.type === 'rolling' && sum.statistic === 'sum' && divisor?.type === 'constant' &&
          decimal(divisor.value) === decimal(sum.periods)) {
        return visit({ type: 'indicator', name: 'MA', input: sum.input, params: { period: sum.periods } });
      }
    }
    if (node.type === 'compare') {
      const rawLeft = object(node.left), rawRight = object(node.right);
      if (node.operator === 'eq' &&
          ((rawLeft?.type === 'positionState' && rawLeft.field === 'quantity' && rawRight?.type === 'constant' && decimal(rawRight.value) === '0') ||
           (rawRight?.type === 'positionState' && rawRight.field === 'quantity' && rawLeft?.type === 'constant' && decimal(rawLeft.value) === '0'))) return flat;
      let left = visit(node.left), right = visit(node.right), operator = String(node.operator);
      const a = object(left), b = object(right);
      if (a?.type === 'constant' && b?.type === 'constant') {
        const comparison = DecimalValue.from(String(a.value)).compareTo(String(b.value));
        return { eq: comparison === 0, neq: comparison !== 0, gt: comparison > 0,
          gte: comparison >= 0, lt: comparison < 0, lte: comparison <= 0 }[operator];
      }
      if (operator === 'lt' || operator === 'lte') {
        [left, right] = [right, left];
        operator = operator === 'lt' ? 'gt' : 'gte';
      }
      if (['eq', 'neq'].includes(operator) && key(left) > key(right)) [left, right] = [right, left];
      return { type: 'compare', operator, left, right };
    }
    const normalized: Node = Object.fromEntries(Object.keys(node).sort().map((name) => [name, visit(node[name])]));
    if (node.type === 'cumulative') {
      const anchor = String(node.anchorAt);
      normalized.anchorAt = /(?:Z|[+-]\d{2}:\d{2})$/.test(anchor) && Number.isFinite(Date.parse(anchor))
        ? new Date(anchor).toISOString() : `时区或时点无效:${anchor}`;
    }
    if (node.type === 'arithmetic' && ['add', 'multiply', 'min', 'max'].includes(String(node.operator)) &&
        key(normalized.left) > key(normalized.right)) [normalized.left, normalized.right] = [normalized.right, normalized.left];
    return normalized;
  };
  return visit(expression);
}

/** 空仓已由执行资格保障；仅允许移除最外层合取中的正确空仓条件。 */
export function intentEntry(expression: Expression, strategy: BacktestStrategy): unknown {
  const normalized = intentExpression(expression, strategy);
  const node = object(normalized);
  if (key(normalized) === key(flat)) return true;
  if (node?.type !== 'all') return normalized;
  const conditions = (node.conditions as unknown[]).filter((item) => key(item) !== key(flat));
  return conditions.length === 1 ? conditions[0] : { type: 'all', conditions };
}

export function intentPlan(strategy: BacktestStrategy): unknown {
  if (!strategy.tradePlan) return undefined;
  const plan = structuredClone(strategy.tradePlan);
  if (Object.keys(plan).every((name) => ['version', 'evaluation', 'stages'].includes(name)) && !plan.stages.length) return undefined;
  if (plan.initialStop?.kind === 'percent') {
    plan.initialStop.percent = decimal(plan.initialStop.percent);
    plan.initialStop.activation ??= { kind: 'immediate' };
  }
  return plan;
}
