import type { BacktestStrategy, Expression } from './backtest-strategy.js';
import { dailyOrderPriceExpressions } from './backtest-daily-order-expressions.js';
import { tradePlanProtectionRules } from './backtest-trade-protection.js';

/** 只描述合法节点的直接子节点；时钟、作用域和单位限制由正式校验负责。 */
export function expressionChildEntries(node: Expression): readonly {
  expression: Expression; path: readonly (string | number)[];
}[] {
  switch (node.type) {
    case 'all':
    case 'any':
      return node.conditions.map((expression, index) => ({ expression, path: ['conditions', index] }));
    case 'not':
      return [{ expression: node.expression, path: ['expression'] }];
    case 'compare':
    case 'cross':
    case 'arithmetic':
      return [{ expression: node.left, path: ['left'] }, { expression: node.right, path: ['right'] }];
    case 'indicator':
    case 'absolute':
    case 'lag':
    case 'rolling':
    case 'cumulative':
      return [{ expression: node.input, path: ['input'] }];
    case 'confirmedPivot':
      return [{ expression: node.input, path: ['input'] },
        ...(node.sample ? [{ expression: node.sample, path: ['sample'] }] : [])];
    case 'countTrue':
    case 'consecutive':
      return [{ expression: node.condition, path: ['condition'] }];
    case 'sequence':
      return [{ expression: node.trigger, path: ['trigger'] },
        ...(node.capture ? [{ expression: node.capture, path: ['capture'] }] : []),
        { expression: node.invalidation, path: ['invalidation'] },
        { expression: node.confirm, path: ['confirm'] }];
    case 'constant':
    case 'series':
    case 'sessionValue':
    case 'positionState':
    case 'eventValue':
    case 'corporateActionEvent':
      return [];
    default: {
      const unknown: never = node;
      throw new Error(`未知表达式节点：${String(unknown)}`);
    }
  }
}

export const expressionChildren = (node: Expression): readonly Expression[] =>
  expressionChildEntries(node).map((child) => child.expression);

/** 正式规则根保持路径，依赖消费者不再分别遗漏保护或委托价格。 */
export function strategyRuleExpressions(
  strategy: Pick<BacktestStrategy, 'entry' | 'exit' | 'tradePlan' | 'execution'>,
): readonly { expression: Expression; path: readonly (string | number)[] }[] {
  return [
    { expression: strategy.entry, path: ['entry'] },
    { expression: strategy.exit, path: ['exit'] },
    ...tradePlanProtectionRules(strategy.tradePlan),
    ...dailyOrderPriceExpressions(strategy.execution),
  ];
}
