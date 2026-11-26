import {
  DecimalValue as D,
  evaluateBooleanExpression,
  numericExpressionKey,
  tradePlanProtectionCondition,
  type BooleanExpression,
  type NumericExpression,
  type NumericEvaluation,
  type BacktestSeries,
} from '@thesis-ledger/domain';
import type { BacktestStrategy } from '@thesis-ledger/schemas';
import {
  fixedAuthoringPlan,
  planAuthoringContent,
} from './trade-plan-authoring-content.fixture.js';

export type ProtectionFeature = 'atr-protection' | 'condition-protection';
const defaultProtectionCost: BacktestStrategy['cost'] = {
  commissionRate: '0.0003',
  slippageRate: '0.001',
};
export function protectionCases(feature: ProtectionFeature, cost = defaultProtectionCost) {
  const rules =
    feature === 'atr-protection'
      ? [
          {
            id: 'frozen-atr',
            rule: '用首次买入实际成交价减买入委托生成时可见的2期平均真实波幅的2倍作为初始止损；入场后冻结距离，不随价格上涨或波幅变化移动。',
          },
          {
            id: 'current-atr',
            rule: '持仓后每个已完成日线收盘，用本轮持仓最高有效收盘价减当时可见的2期平均真实波幅的2倍作为追踪保护线，只收紧不放松；缺失波幅保留已建保护，首次无可用波幅时尚无该保护。',
          },
        ]
      : [
          {
            id: 'unconditional-stop',
            rule: '首次买入后立即以首笔买入成交价下方5%作为无条件止损，不等待指标条件。',
          },
          {
            id: 'armed-stop',
            rule: '持仓后，2期相对强弱指标从不高于60上穿到60以上的已完成收盘，永久启用首笔买入成交价下方5%的止损；此后条件转假或不可用也保留，本轮完全平仓才重置。启用前没有该保护。',
          },
        ];
  return rules.map(({ id, rule }) => {
    return {
      id,
      intent:
        '日线，空仓投入权益20%买入。' +
        rule +
        '按收盘判断、后续可交易开盘市价全部卖出。任何完整平仓后等10根完整日线再检查入场。' +
        `佣金比例${cost.commissionRate}、滑点比例${cost.slippageRate}，普通退出始终不触发，不加其他规则。`,
    };
  });
}
export function protectionContent(feature: ProtectionFeature, enabled: boolean) {
  const content = planAuthoringContent(false),
    intent = protectionCases(feature)[Number(enabled)]!.intent;
  content.description = intent;
  content.requirements = [
    {
      id: 'rules',
      quote: intent,
      interpretation: intent,
      state: 'understood',
      definitionPaths: [],
    },
  ];
  content.confirmation!.exitSummary = intent;
  return content;
}
export function fixedProtectionPlan(
  feature: ProtectionFeature,
  enabled: boolean,
): BacktestStrategy {
  const s = fixedAuthoringPlan(false),
    sourceId = s.signalSources[0]!.id;
  s.signalSources[0]!.series = ['high', 'low', 'close'];
  s.tradePlan = {
    version: 1,
    evaluation: 'barClose',
    stages: [],
    cooldown: { bars: 10, stopBars: 10 },
  };
  if (feature === 'atr-protection') {
    if (enabled) s.tradePlan.trailing = { kind: 'currentAtr', sourceId, period: 2, multiple: '2' };
    else s.tradePlan.initialStop = { kind: 'entryAtr', sourceId, period: 2, multiple: '2' };
  } else {
    s.tradePlan.initialStop = { kind: 'percent', percent: '0.05' };
    if (enabled)
      s.tradePlan.initialStop.activation = { kind: 'condition', condition: {
        type: 'cross',
        direction: 'above',
        left: {
          type: 'indicator',
          name: 'RSI',
          input: { type: 'series', sourceId, field: 'close' },
          params: { period: 2 },
        },
        right: { type: 'constant', value: '60' },
      } };
  }
  return s;
}
const ratio = (v: string | undefined, expected: string) =>
  v !== undefined && D.from(v).compareTo(expected) === 0;
function unwrapSingleBoolean(expression: BacktestStrategy['entry']) {
  let result = expression;
  while ((result.type === 'all' || result.type === 'any') && result.conditions.length === 1)
    result = result.conditions[0]!;
  return result;
}
function ordinaryProtectionRulesConform(s: BacktestStrategy, cost: BacktestStrategy['cost']) {
  const e = unwrapSingleBoolean(s.entry),
    x = unwrapSingleBoolean(s.exit);
  return (
    s.primaryTimeframe === '1d' &&
    s.sizing.type === 'percentOfEquity' &&
    ratio(s.sizing.percent, '0.2') &&
    s.risk.length === 0 &&
    ratio(s.cost.commissionRate, cost.commissionRate) &&
    ratio(s.cost.slippageRate, cost.slippageRate) &&
    e.type === 'not' &&
    e.expression.type === 'positionState' &&
    e.expression.field === 'isOpen' &&
    x.type === 'compare' &&
    x.operator === 'eq' &&
    x.left.type === 'constant' &&
    x.right.type === 'constant' &&
    !ratio(x.left.value, x.right.value)
  );
}
function currentAtrConforms(p: NonNullable<BacktestStrategy['tradePlan']>) {
  const condition = tradePlanProtectionCondition(p.trailing);
  const sameHeldCondition =
    !condition || (condition.type === 'positionState' && condition.field === 'isOpen');
  return (
    !p.initialStop &&
    !!p.trailing &&
    'kind' in p.trailing &&
    p.trailing.kind === 'currentAtr' &&
    p.trailing.period === 2 &&
    ratio(p.trailing.multiple, '2') &&
    sameHeldCondition &&
    !p.trailing.activationGainPercent &&
    !p.trailing.breakEvenGainPercent
  );
}
function frozenAtrConforms(p: NonNullable<BacktestStrategy['tradePlan']>) {
  return (
    !p.trailing &&
    p.initialStop?.kind === 'entryAtr' &&
    p.initialStop.period === 2 &&
    ratio(p.initialStop.multiple, '2') &&
    !tradePlanProtectionCondition(p.initialStop)
  );
}
export function protectionPlanConforms(
  id: string,
  s: BacktestStrategy,
  cost = defaultProtectionCost,
): boolean {
  const p = s.tradePlan;
  if (
    !p ||
    p.stages.length ||
    p.cooldown?.bars !== 10 ||
    p.cooldown.stopBars !== 10 ||
    Object.keys(p).some(
      (k) =>
        !['version', 'evaluation', 'stages', 'cooldown', 'initialStop', 'trailing'].includes(k),
    ) ||
    !ordinaryProtectionRulesConform(s, cost)
  )
    return false;
  if (id === 'frozen-atr') return frozenAtrConforms(p);
  if (id === 'current-atr') return currentAtrConforms(p);
  if (p.trailing || p.initialStop?.kind !== 'percent' || !ratio(p.initialStop.percent, '0.05'))
    return false;
  const condition = tradePlanProtectionCondition(p.initialStop);
  if (id === 'unconditional-stop') return !condition;
  return !!condition && conditionConforms(condition);
}

function conditionConforms(expression: BooleanExpression) {
  const numerics: NumericExpression[] = [];
  const visit = (v: unknown): void => {
    if (!v || typeof v !== 'object') return;
    const n = v as NumericExpression;
    if (n.type === 'indicator' || n.type === 'constant') numerics.push(n);
    Object.values(v).forEach(visit);
  };
  visit(expression);
  const indicators = numerics.filter((n) => n.type === 'indicator');
  if (
    !numerics.some((n) => n.type === 'constant' && ratio(n.value, '60')) ||
    indicators.length !== 1 ||
    indicators.some(
      (n) =>
        n.type !== 'indicator' ||
        n.name !== 'RSI' ||
        Number(n.params.period) !== 2 ||
        n.input.type !== 'series' ||
        n.input.field !== 'close',
    )
  )
    return false;
  const at = '2026-05-21T07:00:00.000Z';
  return [
    [50, 70, true],
    [60, 60.01, true],
    [60, 60.0001, true],
    [59.99, 60, false],
    [60, 60, false],
    [60.01, 60.01, false],
    [70, 70, false],
    [70, 50, false],
    [50, 60, false],
  ].every(([previous, current, expected]) => {
    const values = new Map<string, BacktestSeries>(),
      before = new Map<string, NumericEvaluation>();
    for (const n of numerics) {
      const value = n.type === 'constant' ? n.value : String(current);
      values.set(numericExpressionKey(n), {
        sourceId: 'test',
        symbol: '159516.SZ',
        market: 'CN',
        assetType: 'etf',
        timeframe: '1d',
        field: 'close',
        adjusted: true,
        points: [{ occurredAt: at, availableAt: at, value }],
      });
      before.set(numericExpressionKey(n), {
        status: 'available',
        occurredAt: at,
        availableAt: at,
        value: n.type === 'constant' ? n.value : String(previous),
      });
    }
    const result = evaluateBooleanExpression(expression, {
      tick: { occurredAt: at },
      sourceSeries: {},
      indicatorSeries: values,
      previousNumeric: before,
    });
    return result.status === 'available' && result.value === expected;
  });
}

export function protectionExecutionConforms(
  id: string,
  fills: readonly { side: string; quantity: string; price: string; occurredAt: string }[],
  cost = defaultProtectionCost,
) {
  const dates: Record<string, string> = {
    'frozen-atr': '2026-05-28',
    'current-atr': '2026-05-26',
    'unconditional-stop': '2026-05-21',
    'armed-stop': '2026-05-26',
  };
  const price = D.from(id === 'frozen-atr' ? '7' : '9')
    .times(D.from('1').minus(cost.slippageRate))
    .toString();
  return (
    fills.length === 2 &&
    fills[0]!.side === 'buy' &&
    fills[1]!.side === 'sell' &&
    fills[0]!.quantity === fills[1]!.quantity &&
    fills[1]!.occurredAt.startsWith(dates[id]!) &&
    ratio(fills[1]!.price, price)
  );
}
