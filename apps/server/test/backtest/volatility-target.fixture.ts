import {
  fixedAuthoringPlan,
  planAuthoringContent,
} from './trade-plan-authoring-content.fixture.js';
import type { BacktestStrategy } from '@thesis-ledger/schemas';
import { DecimalValue as D } from '@thesis-ledger/domain';
import { planContainsOnlyControls } from './trade-plan-model-controls.fixture.js';

// 独立模拟日历和行情；实际执行读取 Builder 产出的冻结日历。
export const volatilityScenario = (() => {
  const dates: string[] = [],
    closes: number[] = [];
  let value = 10;
  for (
    const cursor = new Date('2026-04-01T00:00:00Z');
    cursor <= new Date('2026-07-31T00:00:00Z');
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    if (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6) continue;
    const date = cursor.toISOString().slice(0, 10);
    const high = date >= '2026-05-21' && date <= '2026-05-27';
    const amplitude = high ? 0.08 : 0.004;
    value *= 1 + (dates.length % 2 ? amplitude : -amplitude);
    dates.push(date);
    closes.push(value);
  }
  return { dates, closes };
})();

const dynamic =
  '每天收盘都用最近二十个日收益的样本标准差乘根号252计算年化波动率，收益为今天收盘除以上一天收盘减一，需要二十一个有效收盘；将权益投入比例调到10%除以该年化波动率，最高50%。持仓期间每天都主动增减到目标，空仓开仓仍受入场条件约束。样本不足或零波动不新增投入，不强制清仓。';
const fixed = '空仓时投入权益的50%买入，持仓期间不主动重新调仓，不按波动率计算仓位。';
export const volatilityCases = [false, true].map((enabled) => ({
  id: enabled ? 'daily-volatility' : 'fixed-allocation',
  intent:
    '单标的日线，空仓即允许开仓，普通退出始终不触发。' +
    (enabled ? dynamic : fixed) +
    '在随后可交易开盘成交，不添加止损、止盈、冷却、分批或额外风控。',
}));

export function volatilityContent(enabled: boolean) {
  const content = planAuthoringContent(false);
  content.description = volatilityCases[Number(enabled)]!.intent;
  content.requirements = [
    {
      id: 'rules',
      quote: content.description,
      interpretation: content.description,
      state: 'understood',
      definitionPaths: [],
    },
  ];
  content.confirmation!.sizing = { type: 'percentOfEquity', percent: '0.5' };
  content.confirmation!.entrySummary =
    '空仓即允许开仓；普通投入为权益的50%，每日目标波动率计划存在时由计划替代。';
  content.confirmation!.exitSummary = '普通退出始终不触发，不添加止损、止盈或其他退出条件。';
  return content;
}
export function fixedVolatilityPlan(enabled: boolean): BacktestStrategy {
  const strategy = fixedAuthoringPlan(false);
  strategy.sizing = { type: 'percentOfEquity', percent: '0.5' };
  strategy.tradePlan = {
    version: 1,
    evaluation: 'barClose',
    stages: [],
    ...(enabled
      ? {
          volatilityTarget: {
            returnPeriods: 20,
            targetAnnualVolatility: '0.1',
            maxEquityFraction: '0.5',
            annualizationPeriods: 252,
            returnKind: 'simple',
            variance: 'sample',
            update: 'dailyClose',
          } as const,
        }
      : {}),
  };
  return strategy;
}

export function volatilityPlanConforms(id: string, strategy: BacktestStrategy): boolean {
  const plan = strategy.tradePlan;
  if (strategy.risk.length || !planContainsOnlyControls(plan, ['volatilityTarget'])) return false;
  if (!entryAllowed(strategy.entry) || constantEquality(strategy.exit) !== false) return false;
  const v = plan?.volatilityTarget;
  if (id === 'fixed-allocation')
    return (
      !v &&
      strategy.sizing.type === 'percentOfEquity' &&
      D.from(strategy.sizing.percent).compareTo('0.5') === 0
    );
  // 每日计划已替代普通仓位；输入只指定目标和上限，不能用无效的普通投入字段制造语义失败。
  return volatilityConfigConforms(v);
}

export function constantEquality(expression: BacktestStrategy['entry']): boolean | undefined {
  if (
    expression.type !== 'compare' ||
    expression.operator !== 'eq' ||
    expression.left.type !== 'constant' ||
    expression.right.type !== 'constant'
  )
    return undefined;
  return D.from(expression.left.value).compareTo(expression.right.value) === 0;
}

export function entryAllowed(entry: BacktestStrategy['entry']): boolean {
  if (entry.type === 'all') return entry.conditions.every(entryAllowed);
  if (
    entry.type === 'not' &&
    entry.expression.type === 'positionState' &&
    entry.expression.field === 'isOpen'
  )
    return true;
  // 首次入场有空仓门禁，恒真条件与空仓许可在此入口等价。
  return constantEquality(entry) === true;
}

function volatilityConfigConforms(
  v: NonNullable<BacktestStrategy['tradePlan']>['volatilityTarget'],
): boolean {
  return Boolean(
    v &&
    v.returnPeriods === 20 &&
    D.from(v.targetAnnualVolatility).compareTo('0.1') === 0 &&
    D.from(v.maxEquityFraction).compareTo('0.5') === 0 &&
    v.annualizationPeriods === 252 &&
    v.returnKind === 'simple' &&
    v.variance === 'sample' &&
    v.update === 'dailyClose',
  );
}

export function volatilityExecutionConforms(
  id: string,
  fills: readonly { side: string; quantity: string; occurredAt: string }[],
): boolean {
  if (fills[0]?.side !== 'buy') return false;
  if (id === 'fixed-allocation') return fills.length === 1;
  // 独立行情在分析区间先低波动、再急升、再回落；应先减仓，再恢复投入。
  const firstSell = fills.findIndex((fill) => fill.side === 'sell');
  return (
    firstSell > 0 &&
    fills.slice(firstSell + 1).some((fill) => fill.side === 'buy') &&
    fills.every((fill) => D.from(fill.quantity).isPositive())
  );
}
