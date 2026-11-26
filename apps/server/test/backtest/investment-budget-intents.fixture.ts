import assert from 'node:assert/strict';
import type { BacktestStrategy } from '@thesis-ledger/schemas';
import { DecimalValue as D } from '@thesis-ledger/domain';

export const investmentCases = [
  {
    id: 'add',
    intent:
      '单标的日线。收盘价由下向上穿过二十日指数移动平均线时才开仓，先投入权益的20%。持仓收盘比最初实际买入价上涨0.5%时，追加最初实际买入数量的100%，每轮只加一次，总持仓投入最多为权益的30%。持有十根行情后全部退出；不要增加其他止损、退出、风险定仓或每日调仓。',
  },
  {
    id: 'risk',
    intent:
      '单标的日线。收盘价由下向上穿过二十日指数移动平均线时才开仓，初始固定保护放在最初实际买入成交价下方3%。首次数量按权益的2%除以初始止损距离计算，但实际总投入最多为权益的50%；这替代普通首次仓位。持有十根行情后也全部退出。不要加追踪、分批、冷却或每日目标调仓。',
  },
  {
    id: 'volatility',
    intent:
      '单标的日线，收盘价由下向上穿过二十日指数移动平均线时才开仓，普通退出始终不触发。每天收盘都用最近十九个简单日收益的样本标准差乘根号252计算年化波动率，需要二十个有效收盘。目标权益投入比例为10%除以该年化波动率，最高50%，持仓期间每日主动增减到目标。样本不足或零波动不新增投入，不强制清仓。不要加止损、止盈、冷却、分批或其他退出。',
  },
] as const;

export function controlledInvestmentStrategy(seed: BacktestStrategy, kind: string) {
  const strategy = structuredClone(seed);
  strategy.entry = seed.entry;
  strategy.exit = {
    type: 'compare',
    operator: 'eq',
    left: { type: 'constant', value: '0' },
    right: { type: 'constant', value: '1' },
  };
  strategy.risk = [];
  strategy.sizing = { type: 'percentOfEquity', percent: '0.5' };
  strategy.cost = {
    commissionRate: '0.001',
    slippageRate: '0.01',
    minimumCommission: { amount: '10', currency: 'HKD' },
  };
  strategy.tradePlan = { version: 1, evaluation: 'barClose', stages: [] };
  if (kind === 'add') {
    strategy.entry = seed.entry;
    strategy.sizing = { type: 'percentOfEquity', percent: '0.2' };
    strategy.tradePlan.stages = [
      {
        id: 'add',
        trigger: { kind: 'gainPercent', value: '0.005' },
        action: { kind: 'add', initialFraction: '1', maxEquityFraction: '0.3' },
      },
    ];
    strategy.risk = [{ type: 'maxHoldingPeriod', periods: 10 }];
  } else if (kind === 'risk') {
    strategy.tradePlan.initialStop = { kind: 'percent', percent: '0.03' };
    strategy.tradePlan.riskBudget = { equityFraction: '0.02', maxEquityFraction: '0.5' };
    strategy.risk = [{ type: 'maxHoldingPeriod', periods: 10 }];
  } else {
    strategy.tradePlan.volatilityTarget = {
      returnPeriods: 19,
      targetAnnualVolatility: '0.1',
      maxEquityFraction: '0.5',
      annualizationPeriods: 252,
      returnKind: 'simple',
      variance: 'sample',
      update: 'dailyClose',
    };
  }
  return strategy;
}

/** 只校验，不修正或补写模型配置。 */
export function verifyInvestmentPlan(kind: string, strategy: BacktestStrategy) {
  const p = strategy.tradePlan;
  assert(p && !p.trailing && !p.cooldown && !p.lossPause && !p.monthlyRebalance);
  const eq = (value: string | undefined, expected: string) =>
    assert(value !== undefined && D.from(value).compareTo(expected) === 0);
  let entry = strategy.entry;
  if (entry.type === 'all') {
    const crosses = entry.conditions.filter((condition) => condition.type === 'cross');
    const guards = entry.conditions.filter((condition) => condition.type !== 'cross');
    assert(
      crosses.length === 1 &&
        guards.every(
          (guard) =>
            guard.type === 'not' &&
            guard.expression.type === 'positionState' &&
            guard.expression.field === 'isOpen',
        ),
      '仅接受空仓判断与单个上穿条件的等价组合',
    );
    entry = crosses[0]!;
  }
  assert(entry.type === 'cross' && entry.direction === 'above', '入场必须为价格上穿均线');
  assert(entry.left.type === 'series' && entry.left.field === 'close');
  assert(
    entry.right.type === 'indicator' &&
      entry.right.name === 'EMA' &&
      entry.right.params.period === 20,
  );
  assert(
    entry.right.input.type === 'series' &&
      entry.right.input.field === 'close' &&
      entry.right.input.sourceId === entry.left.sourceId,
  );
  if (kind === 'add') {
    assert(!p.initialStop && !p.riskBudget && !p.volatilityTarget);
    assert.equal(p.stages.length, 1);
    const stage = p.stages[0]!;
    assert.equal(stage.trigger.kind, 'gainPercent');
    if (stage.trigger.kind === 'gainPercent') eq(stage.trigger.value, '0.005');
    assert.equal(stage.action.kind, 'add');
    if (stage.action.kind === 'add') {
      eq(stage.action.initialFraction, '1');
      eq(stage.action.maxEquityFraction, '0.3');
    }
    assert.equal(strategy.sizing.type, 'percentOfEquity');
    if (strategy.sizing.type === 'percentOfEquity') eq(strategy.sizing.percent, '0.2');
  } else if (kind === 'risk') {
    assert(!p.volatilityTarget && p.stages.length === 0);
    assert.equal(p.initialStop?.kind, 'percent');
    if (p.initialStop?.kind === 'percent') eq(p.initialStop.percent, '0.03');
    eq(p.riskBudget?.equityFraction, '0.02');
    eq(p.riskBudget?.maxEquityFraction, '0.5');
  } else {
    assert(!p.initialStop && !p.riskBudget && p.stages.length === 0 && strategy.risk.length === 0);
    const v = p.volatilityTarget;
    assert(
      v &&
        v.returnPeriods === 19 &&
        v.annualizationPeriods === 252 &&
        v.returnKind === 'simple' &&
        v.variance === 'sample' &&
        v.update === 'dailyClose',
    );
    eq(v.targetAnnualVolatility, '0.1');
    eq(v.maxEquityFraction, '0.5');
  }
}
