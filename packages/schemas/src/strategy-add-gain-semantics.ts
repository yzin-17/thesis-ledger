import type { BacktestTradePlan } from './backtest-trade-plan.js';

type PlanStrategy = { tradePlan?: Pick<BacktestTradePlan, 'stages'> | undefined };
export type StrategyAddGainIssue = {
  path: string;
  message: string;
  expected: string;
  actual: string;
};

/** 仅移动十进制小数点，不经过浮点数，也不改写策略值。 */
const canonicalDecimal = (value: string, shift = 0) => {
  const [whole = '0', fraction = ''] = value.split('.');
  const scale = fraction.length + shift;
  const digits = (whole + fraction).replace(/^0+/u, '').padStart(scale + 1, '0');
  const integer = digits.slice(0, digits.length - scale);
  const decimal = scale ? digits.slice(-scale).replace(/0+$/u, '') : '';
  return decimal ? integer + '.' + decimal : integer;
};

const claimedAddGain = (summary: string): string | undefined => {
  const values = new Set<string>();
  for (const clause of summary.split(/[。；;\n]/u)) {
    const matches = [
      ...clause.matchAll(
        /(?:上涨|浮盈|涨幅|持仓收益|持仓盈利)(?:达到|至少|达|为|超过)?\s*(\d+(?:\.\d+)?)\s*[%％]/gu,
      ),
    ];
    for (const [index, match] of matches.entries()) {
      const prefix = clause.slice(0, match.index);
      const suffix = clause.slice(match.index + match[0].length, matches[index + 1]?.index);
      // 不把否定、日涨幅或其他基准的收益当成相对入场价的阶段条件。
      if (
        /(?:未|不|无需|不要|禁止|避免)[^，,]{0,12}$/u.test(prefix) ||
        /(?:昨日|前一日|当日|日涨幅|指数|均线)/u.test(prefix + match[0]) ||
        /(?:不|未|无需|不要|禁止|避免)[^，,]{0,6}(?:加仓|追加)/u.test(suffix)
      )
        continue;
      const action = suffix.match(/加仓|追加|减仓|卖出|平仓/u);
      if (!action || (action[0] !== '加仓' && action[0] !== '追加')) continue;
      if (/(?:或者|或|至|到|~|～|-)\s*\d+(?:\.\d+)?\s*[%％]/u.test(suffix.slice(0, action.index)))
        continue;
      values.add(canonicalDecimal(match[1]!, 2));
    }
  }
  return values.size === 1 ? [...values][0] : undefined;
};

/** 只在单个加仓涨幅可唯一对应明确原文时检查，不猜测多阶段或歧义。 */
export function strategyAddGainIssues(
  strategy: PlanStrategy,
  summaries: readonly string[],
): StrategyAddGainIssue[] {
  const stages = strategy.tradePlan?.stages ?? [];
  const additions = stages.flatMap((stage, index) =>
    stage.action.kind === 'add' ? [{ stage, index }] : [],
  );
  if (additions.length !== 1 || additions[0]!.stage.trigger.kind !== 'gainPercent') return [];
  const { stage, index } = additions[0]!;
  const actual = canonicalDecimal(stage.trigger.value);
  const issues: StrategyAddGainIssue[] = [];
  for (const summary of summaries) {
    const expected = claimedAddGain(summary);
    if (
      expected !== undefined &&
      expected !== actual &&
      !issues.some((issue) => issue.expected === expected)
    ) {
      const path = `tradePlan.stages.${index}.trigger.value`;
      issues.push({
        path,
        expected,
        actual: stage.trigger.value,
        message: `${path}：加仓涨幅与明确百分比说明不一致，应为比率 ${expected}，实际为 ${stage.trigger.value}`,
      });
    }
  }
  return issues;
}
