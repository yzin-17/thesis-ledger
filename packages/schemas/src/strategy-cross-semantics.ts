import type { BooleanExpression, NumericExpression } from './backtest-strategy.js';
import { booleanExpressionSchema } from './backtest-strategy.js';

export const STRATEGY_CROSS_SEMANTICS_PROMPT =
  'cross 的方向以 left 为主语：above 是前值 left<=right 且当前 left>right，below 是前值 left>=right 且当前 left<right。' +
  '价格上穿 EMA 买入必须 left=价格、right=EMA、direction=above；价格下穿 EMA 卖出必须 left=价格、right=EMA、direction=below。' +
  '交换 left/right 必须同时反转 direction；均线上穿价格=价格下穿。说明、确认与AST方向一致。';

type Direction = 'above' | 'below';
type Rule = 'entry' | 'exit';
type Cross = Extract<BooleanExpression, { type: 'cross' }>;
type CrossStrategy = { entry: unknown; exit: unknown; description?: string | undefined };

const opposite = (direction: Direction): Direction => direction === 'above' ? 'below' : 'above';

const isPrice = (value: NumericExpression): value is Extract<NumericExpression, { type: 'series' }> =>
  value.type === 'series' && value.field === 'close';

const priceCrossDirection = (cross: Cross): Direction | undefined => {
  const matches = (price: NumericExpression, average: NumericExpression) =>
    isPrice(price) && average.type === 'indicator' &&
    (average.name === 'MA' || average.name === 'EMA') && isPrice(average.input) &&
    price.sourceId === average.input.sourceId;
  if (matches(cross.left, cross.right)) return cross.direction;
  if (matches(cross.right, cross.left)) return opposite(cross.direction);
  return undefined;
};

const priceCrossDirections = (expression: BooleanExpression): Direction[] => {
  if (expression.type === 'cross') {
    const direction = priceCrossDirection(expression);
    return direction ? [direction] : [];
  }
  if (expression.type === 'all' || expression.type === 'any')
    return expression.conditions.flatMap(priceCrossDirections);
  // 否定表达式不能按正向交叉陈述解释。
  return [];
};

/** 仅处理明确的价格穿均线陈述；不从“趋势”名称推断交易方向。 */
const claims = (summary: string) => {
  const result: Array<{ direction: Direction; suffix: string }> = [];
  let implicitPrice = false;
  for (const clause of summary.split(/[。；;，,\n]/u)) {
    const previousPrice = implicitPrice;
    implicitPrice = false;
    if (/(?:不|未|禁止|避免|并非).*(?:上穿|下穿)/u.test(clause)) continue;
    // 带其他主语（例如“短均线上穿长均线”）或反向主语时不猜测。
    const pattern = /(?:价格|收盘价|股价)?\s*(上穿|下穿)\s*(?:(?:\d+\s*日)?(?:指数移动平均线|移动平均线|均线)|(?:EMA|MA)\s*(?:[（(]?\d+[）)]?)?)/giu;
    for (const match of clause.matchAll(pattern)) {
      const prefix = clause.slice(0, match.index).trim();
      if (prefix && !/(?:价格|收盘价|股价|时|当|在)$/u.test(prefix)) continue;
      if (!/^(?:价格|收盘价|股价)/u.test(match[0]) && !previousPrice) continue;
      implicitPrice = true;
      result.push({
        direction: match[1] === '上穿' ? 'above' : 'below',
        suffix: clause.slice(match.index + match[0].length),
      });
    }
  }
  return result;
};

export const strategyCrossSummaryIssue = (
  expression: unknown,
  summary: string,
): string | undefined => {
  const parsed = booleanExpressionSchema.safeParse(expression);
  if (!parsed.success) return undefined;
  const directions = priceCrossDirections(parsed.data);
  const stated = claims(summary);
  if (directions.length !== 1 || stated.length !== 1) return undefined;
  if (directions[0] === stated[0]!.direction) return undefined;
  return '价格与均线的交叉方向与明确说明相反，请核对 left/right 和 direction';
};

export const strategyCrossDescriptionIssues = (strategy: CrossStrategy) => {
  const issues: Array<{ path: Rule; message: string }> = [];
  const description = strategy.description ?? '';
  for (const claim of claims(description)) {
    let path: Rule;
    const entry = /买入|入场|建仓|建立多头(?:仓位)?/u.test(claim.suffix);
    const exit = /卖出|退出|出场|平仓|清仓/u.test(claim.suffix);
    if (entry === exit) continue;
    if (entry) path = 'entry';
    else path = 'exit';
    const parsed = booleanExpressionSchema.safeParse(strategy[path]);
    if (!parsed.success) continue;
    const directions = priceCrossDirections(parsed.data);
    if (directions.length === 1 && directions[0] !== claim.direction)
      issues.push({ path, message: `${path}：价格与均线的交叉方向与策略说明相反` });
  }
  return issues;
};
