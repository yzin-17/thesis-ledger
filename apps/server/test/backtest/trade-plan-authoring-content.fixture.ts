import { authoringContentSchema, executionConfigSchema, type BacktestStrategy } from '@thesis-ledger/schemas';

export function planAuthoringContent(trailing: boolean) {
  const protection = trailing
    ? '盈利达到10%后，保护线跟随此后最高收盘价下方5%逐步上移，永不下移。'
    : '保护线固定，价格上涨也不移动。';
  const exit =
    '以最初买入成交价下方5%保护。' +
    protection +
    '收盘达到保护条件才在下个可交易开盘全部退出。平仓后等10根完整行情才能再买，不要加其他退出条件。';
  const description = '空仓就投入权益的20%买入。' + exit;
  return authoringContentSchema.parse({
    title: '独立模拟交易计划',
    description,
    questions: [],
    requirements: [
      {
        id: 'rules',
        quote: description,
        interpretation: description,
        state: 'understood',
        definitionPaths: [],
      },
    ],
    runtimeIntents: [],
    removedRequirements: [],
    definitionText: '',
    manualChanges: [],
    confirmation: {
      instrumentId: 'acceptance-159516',
      instrument: { symbol: '159516.SZ', market: 'CN', assetType: 'etf' },
      timeframe: '1d',
      entrySummary: '空仓就投入权益的20%买入。',
      exitSummary: exit,
      sizing: { type: 'percentOfEquity', percent: '0.2' },
      risk: [],
      noExtraRiskConfirmed: true,
      execution: {
        mode: 'exchange',
        orderType: 'market',
        timeInForce: 'DAY',
        timing: 'nextEligibleBarOpen',
      },
      cost: { commissionRate: '0.0003', slippageRate: '0.001' },
      periodsAreBarsConfirmed: true,
    },
  });
}

export function fixedAuthoringPlan(trailing: boolean): BacktestStrategy {
  const confirmed = planAuthoringContent(trailing).confirmation!;
  return {
    schemaVersion: 'strategy-definition-v1',
    name: '编写交易计划固定样本',
    executionInstrument: confirmed.instrument,
    primaryTimeframe: '1d',
    signalSources: [
      {
        id: 'execution',
        asset: confirmed.instrument,
        timeframe: '1d',
        series: ['close'],
        priceCoordinate: 'research',
      },
    ],
    entry: { type: 'not', expression: { type: 'positionState', field: 'isOpen' } },
    exit: {
      type: 'compare',
      operator: 'eq',
      left: { type: 'constant', value: '0' },
      right: { type: 'constant', value: '1' },
    },
    sizing: confirmed.sizing,
    risk: confirmed.risk,
    execution: executionConfigSchema.parse(confirmed.execution),
    cost: confirmed.cost,
    tradePlan: {
      version: 1,
      evaluation: 'barClose',
      initialStop: { kind: 'percent', percent: '0.05' },
      ...(trailing ? { trailing: { drawdownPercent: '0.05', activationGainPercent: '0.1' } } : {}),
      cooldown: { bars: 10, stopBars: 10 },
      stages: [],
    },
  };
}

export function compiledAuthoringPlan(trailing: boolean): BacktestStrategy {
  const strategy = fixedAuthoringPlan(trailing);
  return {
    ...strategy,
    entryTrigger: 'while-flat',
    signalSources: strategy.signalSources.map((source) => ({ ...source, series: [] })),
    tradePlan: {
      ...strategy.tradePlan!,
      initialStop: { kind: 'percent', percent: '0.05', activation: { kind: 'immediate' } },
      ...(strategy.tradePlan?.trailing ? {
        trailing: { ...strategy.tradePlan.trailing, activation: { kind: 'immediate' } },
      } : {}),
    },
  };
}
