import { expect, it } from 'vitest';
import { backtestStrategyPlanReadback, type BacktestStrategy } from '../src/index.js';
import { describeBacktestExpression } from '../src/backtest-expression-display.js';

it('同一组收盘与均线操作数在逐根比较和穿越规则中读法不同', () => {
  const left = { type: 'series', sourceId: 'day', field: 'close' } as const;
  const right = { type: 'indicator', name: 'EMA', input: left, params: { period: 12 } } as const;
  const sources = new Map([['day', '日线']]);
  const ordinary = describeBacktestExpression({
    type: 'consecutive', periods: 2, condition: { type: 'compare', operator: 'gt', left, right },
  }, sources);
  expect(ordinary).toContain('连续 2 根均满足');
  expect(ordinary).toContain('高于');
  expect(ordinary).not.toContain('上穿');
  expect(describeBacktestExpression({ type: 'cross', direction: 'above', left, right }, sources))
    .toContain('上穿');
});

it('中文区分月末30%目标与3个百分点阈值，首月建仓也不以普通投入兜底', () => {
  const configuration = {
    entry: { type: 'not', expression: { type: 'positionState', field: 'isOpen' } },
    exit: {
      type: 'compare',
      operator: 'eq',
      left: { type: 'constant', value: '0' },
      right: { type: 'constant', value: '1' },
    },
    sizing: { type: 'percentOfEquity', percent: '0.5' },
    risk: [],
    tradePlan: {
      version: 1,
      evaluation: 'barClose',
      stages: [],
      monthlyRebalance: {
        targetEquityFraction: '0.3',
        deviationThreshold: '0.03',
        evaluation: 'lastTradingDayClose',
      },
    },
  } satisfies Parameters<typeof backtestStrategyPlanReadback>[0];
  const before = structuredClone(configuration);
  const text = backtestStrategyPlanReadback(configuration).join('\n');
  for (const expected of [
    '已由月末目标仓位计划替代',
    '最后交易日完成收盘',
    '权益的 30%',
    '达到 3 个百分点',
    '低于该值跳过',
    '每月只判断一次',
    '不按自然月末推测',
    '随后首个可交易开盘',
    '拒单不算成交，当月不重复补做',
    '非月末不以普通投入兜底',
  ]) expect(text).toContain(expected);
  expect(text).not.toContain('每日主动');
  expect(configuration).toEqual(before);
  expect(backtestStrategyPlanReadback({ ...configuration, tradePlan: undefined }).join('\n'))
    .not.toContain('月末调仓');
});

it('中文从实际每日目标配置说明公式、覆盖普通仓位、缺样本及后续开盘执行', () => {
  const strategy = {
    entry: { type: 'not', expression: { type: 'positionState', field: 'isOpen' } },
    exit: {
      type: 'compare',
      operator: 'eq',
      left: { type: 'constant', value: '0' },
      right: { type: 'constant', value: '1' },
    },
    sizing: { type: 'percentOfEquity', percent: '0.5' },
    risk: [],
    tradePlan: {
      version: 1,
      evaluation: 'barClose',
      stages: [],
      volatilityTarget: {
        returnPeriods: 20,
        targetAnnualVolatility: '0.1',
        maxEquityFraction: '0.5',
        annualizationPeriods: 252,
        returnKind: 'simple',
        variance: 'sample',
        update: 'dailyClose',
      },
    },
  } satisfies Parameters<typeof backtestStrategyPlanReadback>[0];
  const text = backtestStrategyPlanReadback(strategy).join('\n');
  for (const expected of [
    '最近 21 个有效收盘',
    '20 个简单收益',
    '样本标准差',
    '√252',
    '10%÷年化波动率',
    '最高 50%',
    '每日主动增减仓',
    '已由每日目标波动率计划替代',
    '零波动不新增投入',
    '后续可交易开盘',
    '先执行风险清仓',
  ])
    expect(text).toContain(expected);
  expect(
    backtestStrategyPlanReadback({ ...strategy, tradePlan: undefined }).join('\n'),
  ).not.toContain('目标波动率');
});

it('中文区分 MACD 参数角色和输出，不依赖对象键顺序；费用和基准从配置读取', () => {
  const macd = (output: 'signal' | 'histogram') => ({
    type: 'indicator' as const,
    name: 'MACD' as const,
    output,
    input: { type: 'series' as const, sourceId: 'daily', field: 'close' as const },
    params: { signalPeriod: 9, fastPeriod: 12, slowPeriod: 26 },
  });
  const strategy = {
    entry: {
      type: 'compare',
      operator: 'gt',
      left: macd('signal'),
      right: { type: 'constant', value: '0' },
    },
    exit: {
      type: 'compare',
      operator: 'lt',
      left: macd('histogram'),
      right: { type: 'constant', value: '0' },
    },
    sizing: { type: 'percentOfEquity', percent: '0.2' },
    risk: [{ type: 'fixedStop', percent: '0.05' }],
    signalSources: [{ id: 'daily', priceCoordinate: 'research' }],
    cost: { commissionRate: '0.0003', slippageRate: '0.001' },
    execution: {
      mode: 'exchange',
      orderType: 'market',
      timeInForce: 'DAY',
      timing: 'nextEligibleBarOpen',
    },
    benchmark: { symbol: '000300.SH', market: 'CN', assetType: 'etf' },
  } satisfies Parameters<typeof backtestStrategyPlanReadback>[0];
  const lines = backtestStrategyPlanReadback(strategy);
  expect(lines[0]).toBe(
    '入场条件：MACD信号线（快周期 12、慢周期 26、信号周期 9；后复权收盘价）高于0。',
  );
  expect(lines.find((line) => line.startsWith('普通退出条件：'))).toContain('MACD柱线（快周期 12、慢周期 26、信号周期 9');
  expect(lines).toContain(
    '模拟成本：佣金比例 0.03%、滑点比例 0.1%；其余适用市场费用按冻结执行规则计算。',
  );
  expect(lines).toContain('收益比较基准：000300.SH；不作为下单标的。');
  expect(lines).toContain('独立固定止损：含买入费用的持仓均价下方 5%，收盘判断、后续开盘清仓。');
});

it('原始／剩余数量的区别及手数语义直接可见', () => {
  const base = {
    entry: { type: 'positionState', field: 'isOpen' },
    exit: { type: 'positionState', field: 'isOpen' },
    sizing: { type: 'fixedAmount', amount: '0.2' },
    risk: [],
  } satisfies Pick<BacktestStrategy, 'entry' | 'exit' | 'sizing' | 'risk'>;
  const lines = (basis: 'initialQuantity' | 'remainingQuantity') =>
    backtestStrategyPlanReadback({
      ...base,
      tradePlan: {
        version: 1,
        evaluation: 'barClose',
        stages: [
          {
            id: 'half',
            trigger: { kind: 'gainPercent', value: '0.15' },
            action: { kind: 'reduce', basis, fraction: '0.5' },
          },
        ],
      },
    }).join('\n');
  expect(lines('initialQuantity')).toContain('卖出首次实际买入数量的 50%');
  expect(lines('remainingQuantity')).toContain('卖出该阶段首次下单时剩余数量的 50%');
  expect(lines('initialQuantity')).toContain(
    '原始股数按手数向下取整，不足一手跳过，研究单位保留小数',
  );
  expect(lines('initialQuantity')).toContain('普通仓位：每次投入货币金额 0.2。');
  expect(lines('initialQuantity')).toContain('数量单位由回测执行口径确定');
});
