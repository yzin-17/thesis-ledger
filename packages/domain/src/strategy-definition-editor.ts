import {
  expressionEditorVariants,
  expressionEditorFields,
  expressionEditorLabels,
} from './strategy-expression-editor.js';
import {
  patchStrategyDefinitionDraft,
  removeStrategySource,
  removeStrategySourceField,
  renameStrategySource,
  strategyDraftRecord,
  strategyDraftValue,
  type StrategyDefinitionDraft,
  type StrategyDefinitionPath,
} from './strategy-definition-draft.js';
import {
  strategyProtectionEditorFields,
  strategyProtectionEditorVariants,
  preserveProtectionActivation,
} from './strategy-protection-editor.js';
import {
  strategyOrderEditorVariants,
  strategyOrderEditorFields,
  strategyOrderEditorInitial,
  strategyOrderEditorLabels,
  editStrategyOrderReferences,
} from './strategy-order-editor.js';

export type StrategyEditorField = {
  key: string;
  label: string;
  kind: 'text' | 'integer' | 'choice' | 'object' | 'array' | 'boolean';
  context?: string;
  optional?: boolean;
  choices?: readonly string[];
  choiceLabels?: Readonly<Record<string, string>>;
  help?: string;
};
const text = (key: string, label: string, help?: string): StrategyEditorField => ({
  key,
  label,
  kind: 'text',
  ...(help ? { help } : {}),
});
const integer = (key: string, label: string): StrategyEditorField => ({
  key,
  label,
  kind: 'integer',
});
const choice = (key: string, label: string, choices: readonly string[]): StrategyEditorField => ({
  key,
  label,
  kind: 'choice',
  choices,
});
const object = (
  key: string,
  label: string,
  context: string,
  optional = false,
): StrategyEditorField => ({ key, label, kind: 'object', context, optional });
const array = (key: string, label: string, context: string): StrategyEditorField => ({
  key,
  label,
  kind: 'array',
  context,
});
const optional = (field: StrategyEditorField): StrategyEditorField => ({
  ...field,
  optional: true,
});
const ratio = (key: string, label: string) =>
  text(key, label, '按小数比例填写：0.005 = 0.5%，0.5 = 50%。');
const asset = { symbol: '', market: 'CN', assetType: 'stock' };
const series = { type: 'series', sourceId: '', field: 'close' };
const compare = {
  type: 'compare',
  operator: 'gt',
  left: series,
  right: { type: 'constant', value: '0' },
};
export const strategyEditorTimeframes = ['1d', '60m', '30m', '15m', '5m', '1m'] as const;
const seriesFields = ['open', 'high', 'low', 'close', 'volume', 'nav'];
export const strategyEditorArrayOptions = (context: string): readonly string[] =>
  context === 'seriesField' ? seriesFields : ['subscribe', 'redeem'];

/** 两端共用的业务编辑合同；不依赖 UI 或校验库，不负责执行与协议升级。 */
export function strategyEditorVariants(
  context: string,
): Readonly<Record<string, StrategyDefinitionDraft>> {
  const expressions = expressionEditorVariants(context);
  if (expressions) return expressions;
  if (context === 'sizing')
    return {
      fixedAmount: { type: 'fixedAmount', amount: '10000' },
      percentOfEquity: { type: 'percentOfEquity', percent: '0.1' },
      fixedQuantity: { type: 'fixedQuantity', quantity: '100' },
      targetWeight: { type: 'targetWeight', weight: '0.1' },
    };
  if (context === 'risk')
    return {
      fixedStop: { type: 'fixedStop', percent: '0.05' },
      fixedTakeProfit: { type: 'fixedTakeProfit', percent: '0.1' },
      maxHoldingPeriod: { type: 'maxHoldingPeriod', periods: 20 },
    };
  const protection = strategyProtectionEditorVariants(context, compare);
  if (protection) return protection;
  if (context === 'trigger')
    return {
      gainPercent: { kind: 'gainPercent', value: '0.005' },
      entryAtrMultiple: { kind: 'entryAtrMultiple', value: '1' },
    };
  if (context === 'action')
    return {
      reduce: { kind: 'reduce', basis: 'initialQuantity', fraction: '0.5' },
      add: { kind: 'add', initialFraction: '0.5', maxEquityFraction: '0.8' },
    };
  const orders = strategyOrderEditorVariants(context);
  if (orders) return orders;
  return {};
}

export function strategyEditorVariant(context: string, value: unknown): string {
  const row = strategyDraftRecord(value);
  const text = (item: unknown, fallback = '') => (typeof item === 'string' ? item : fallback);
  if (context === 'execution')
    return row.timing === 'dailyBarOrders' ? 'dailyBarOrders' : text(row.mode);
  if (['orderInstruction', 'orderValidity', 'orderAction'].includes(context)) return text(row.kind);
  if (['stop', 'trigger', 'action', 'protectionActivation'].includes(context))
    return text(row.kind);
  if (context === 'trailing') return text(row.kind, 'percent');
  return text(row.type);
}

export function strategyEditorInitial(context: string): unknown {
  const defaults: Record<string, unknown> = {
    source: {
      id: 'source',
      priceCoordinate: 'research',
      asset,
      timeframe: '1d',
      series: ['open', 'close'],
    },
    asset,
    boolean: compare,
    numeric: series,
    seriesField: 'close',
    requestType: 'subscribe',
    sizing: strategyEditorVariants('sizing').fixedAmount,
    risk: strategyEditorVariants('risk').fixedStop,
    execution: strategyEditorVariants('execution').exchange,
    cost: { commissionRate: '0.0003', slippageRate: '0.001' },
    money: { amount: '0', currency: 'CNY' },
    plan: { version: 1, evaluation: 'barClose', stages: [] },
    stop: strategyEditorVariants('stop').percent,
    trailing: strategyEditorVariants('trailing').percent,
    protectionActivation: strategyEditorVariants('protectionActivation').immediate,
    cooldown: { bars: 0, stopBars: 0 },
    riskBudget: { equityFraction: '0.01', maxEquityFraction: '0.5' },
    lossPause: { completedTrades: 3, tradingDays: 5, pnlBasis: 'fillsNetOfFees' },
    stage: {
      id: 'stage',
      trigger: strategyEditorVariants('trigger').gainPercent,
      action: strategyEditorVariants('action').reduce,
    },
    monthly: {
      targetEquityFraction: '0.3',
      deviationThreshold: '0.03',
      evaluation: 'lastTradingDayClose',
    },
    volatility: {
      returnPeriods: 20,
      targetAnnualVolatility: '0.1',
      maxEquityFraction: '0.5',
      annualizationPeriods: 252,
      returnKind: 'simple',
      variance: 'sample',
      update: 'dailyClose',
    },
  };
  return structuredClone(defaults[context] ?? strategyOrderEditorInitial(context) ?? '');
}

export function strategyEditorFields(context: string, value: unknown): StrategyEditorField[] {
  const row = strategyDraftRecord(value);
  const orders = strategyOrderEditorFields(context, row);
  if (orders) return orders;
  if (context === 'root')
    return [
      array('signalSources', '信号来源', 'source'),
      object('entry', '入场条件', 'boolean'),
      { ...choice('entryTrigger', '入场政策', ['rising-edge', 'while-flat']),
        help: '由假变真时入场：持仓期间仍观察条件；空仓且条件成立时入场：持续成立也可重新入场。' },
      object('exit', '普通退出条件', 'boolean'),
      object('sizing', '普通仓位', 'sizing'),
      array('risk', '独立风险退出', 'risk'),
      object('tradePlan', '交易计划', 'plan', true),
      object('execution', '执行方式', 'execution'),
      object('cost', '模拟费用', 'cost'),
      object('benchmark', '收益比较基准', 'asset', true),
    ];
  if (context === 'source')
    return [
      text('id', '来源标识'),
      object('asset', '来源标的', 'asset'),
      choice('timeframe', '来源周期', strategyEditorTimeframes),
      optional(choice('priceCoordinate', '价格坐标', ['research', 'actual', 'run', 'native-nav'])),
      array('series', '声明字段', 'seriesField'),
    ];
  if (context === 'asset')
    return [
      text('symbol', '标的代码'),
      choice('market', '市场', ['CN', 'HK', 'US']),
      choice('assetType', '标的类型', ['stock', 'etf', 'fund']),
    ];
  const expressionFields = expressionEditorFields(context, row);
  if (expressionFields) return expressionFields;
  if (context === 'periodParams') return [integer('period', '观察周期数')];
  if (context === 'macdParams')
    return [
      integer('fastPeriod', '快周期'),
      integer('slowPeriod', '慢周期'),
      integer('signalPeriod', '信号周期'),
    ];
  if (context === 'sizing') {
    if (row.type === 'fixedAmount') return [text('amount', '投入金额（执行标的币种）')];
    if (row.type === 'fixedQuantity') return [text('quantity', '数量（股／份）')];
    if (row.type === 'percentOfEquity') return [ratio('percent', '权益投入比例')];
    if (row.type === 'targetWeight') return [ratio('weight', '目标权益仓位')];
    return [];
  }
  if (context === 'risk')
    return row.type === 'maxHoldingPeriod'
      ? [integer('periods', '最长持有周期数')]
      : [ratio('percent', '持仓均价涨跌比例')];
  if (context === 'cost')
    return [
      ratio('commissionRate', '佣金率'),
      ratio('slippageRate', '滑点率'),
      object('minimumCommission', '最低佣金', 'money', true),
    ];
  if (context === 'money')
    return [text('amount', '金额'), choice('currency', '币种', ['CNY', 'HKD', 'USD'])];
  if (context === 'plan')
    return [
      integer('version', '交易计划协议版本'),
      choice('evaluation', '判断时点', ['barClose']),
      object('initialStop', '初始保护', 'stop', true),
      object('trailing', '移动保护', 'trailing', true),
      object('cooldown', '成交后冷却', 'cooldown', true),
      object('riskBudget', '初始风险预算', 'riskBudget', true),
      object('lossPause', '连续已完成亏损暂停', 'lossPause', true),
      array('stages', '分阶段加减仓', 'stage'),
      object('monthlyRebalance', '月末调仓', 'monthly', true),
      object('volatilityTarget', '每日目标波动率', 'volatility', true),
    ];
  if (context === 'stop' || context === 'trailing' || context === 'protectionActivation')
    return strategyProtectionEditorFields(context, row);
  if (context === 'cooldown')
    return [integer('bars', '普通退出后周期数'), integer('stopBars', '止损后周期数')];
  if (context === 'riskBudget')
    return [
      ratio('equityFraction', '权益风险预算比例'),
      ratio('maxEquityFraction', '最高权益仓位比例'),
    ];
  if (context === 'lossPause')
    return [
      integer('completedTrades', '连续亏损已完成交易数'),
      integer('tradingDays', '暂停交易日数'),
      choice('pnlBasis', '盈亏口径', ['fillsNetOfFees']),
    ];
  if (context === 'stage')
    return [
      text('id', '阶段标识'),
      object('trigger', '阶段触发', 'trigger'),
      object('action', '阶段动作', 'action'),
    ];
  if (context === 'trigger')
    return [
      row.kind === 'gainPercent' ? ratio('value', '上涨比例') : text('value', '冻结入场 ATR 倍数'),
    ];
  if (context === 'action')
    return row.kind === 'add'
      ? [
          ratio('initialFraction', '首次买入数量的加仓比例'),
          ratio('maxEquityFraction', '最高权益仓位比例'),
        ]
      : [
          choice('basis', '减仓数量基准', ['initialQuantity', 'remainingQuantity']),
          ratio('fraction', '卖出数量比例'),
        ];
  if (context === 'monthly')
    return [
      ratio('targetEquityFraction', '目标权益仓位比例'),
      ratio('deviationThreshold', '仓位偏离阈值（0.03 = 3个百分点）'),
      choice('evaluation', '判断时点', ['lastTradingDayClose']),
    ];
  if (context === 'volatility')
    return [
      integer('returnPeriods', '简单收益样本数'),
      ratio('targetAnnualVolatility', '年化目标波动率'),
      ratio('maxEquityFraction', '最高权益仓位比例'),
      integer('annualizationPeriods', '年化周期数'),
      choice('returnKind', '收益口径', ['simple']),
      choice('variance', '方差口径', ['sample']),
      choice('update', '更新时点', ['dailyClose']),
    ];
  return [];
}

export const strategyEditorLabels: Readonly<Record<string, string>> = {
  'rising-edge': '由假变真时入场',
  'while-flat': '空仓且条件成立时入场',
  '1d': '日线',
  '60m': '60 分钟',
  '30m': '30 分钟',
  '15m': '15 分钟',
  '5m': '5 分钟',
  '1m': '1 分钟',
  ...strategyOrderEditorLabels,
  ...expressionEditorLabels,
  compare: '比较',
  cross: '穿越',
  all: '全部满足',
  any: '任一满足',
  not: '取反',
  positionState: '持仓状态',
  corporateActionEvent: '权益事件',
  constant: '常量',
  series: '行情',
  sessionValue: '会话统计',
  indicator: '指标',
  fixedAmount: '固定金额',
  fixedQuantity: '固定数量',
  percentOfEquity: '权益比例',
  targetWeight: '目标仓位',
  fixedStop: '固定止损',
  fixedTakeProfit: '固定止盈',
  maxHoldingPeriod: '最长持有期',
  percent: '比例',
  entryAtr: '冻结入场 ATR',
  currentAtr: '当前 ATR',
  immediate: '立即启用',
  condition: '条件成立后启用',
  gainPercent: '上涨比例',
  entryAtrMultiple: '入场 ATR 倍数',
  reduce: '减仓',
  add: '加仓',
  initialQuantity: '首次实际买入数量',
  remainingQuantity: '阶段首次下单时剩余数量',
  exchange: '场内交易',
  nav: '单位净值',
  research: '后复权研究价格',
  actual: '实际价格',
  open: '开盘价',
  high: '最高价',
  low: '最低价',
  close: '收盘价',
  volume: '成交量',
  isOpen: '已持仓',
  quantity: '持仓数量',
  averageCost: '持仓均价',
  holdingPeriods: '持有周期数',
  vwap: '当日累计均价',
  elapsedMinutes: '距当日首个开市分钟数',
  eq: '等于',
  neq: '不等于',
  gt: '高于',
  gte: '不低于',
  lt: '低于',
  lte: '不高于',
  above: '上穿',
  below: '下穿',
  macd: 'MACD 主线',
  signal: 'MACD 信号线',
  histogram: 'MACD 柱线',
  stock: '股票',
  etf: 'ETF',
  fund: '场外基金',
  CN: '中国内地',
  HK: '香港',
  US: '美国',
  run: '跟随本次运行（准备时冻结）',
  'native-nav': '发布单位净值（实际基金份额）',
  market: '市价',
  DAY: '当日',
  nextEligibleBarOpen: '下一可交易开盘',
  nextAvailableNav: '下一可用净值',
  barClose: '收盘判断',
  subscribe: '申购',
  redeem: '赎回',
  fillsNetOfFees: '实际成交扣除费用',
  lastTradingDayClose: '当月最后交易日收盘',
  simple: '简单收益',
  sample: '样本方差',
  dailyClose: '每日收盘',
  CASH_DIVIDEND: '现金分红',
  SPLIT: '拆股',
  REVERSE_SPLIT: '并股',
};

/** 切换已知类型时删除旧类型的已知字段，保留扩展字段供后续修复。 */
export function changeStrategyEditorVariant(context: string, value: unknown, variant: string) {
  const row = strategyDraftRecord(value);
  const known = new Set(strategyEditorFields(context, value).map((field) => field.key));
  const extras = Object.fromEntries(
    Object.entries(row).filter(
      ([key]) => !known.has(key) && !['type', 'kind', 'mode'].includes(key),
    ),
  );
  const next = { ...extras, ...structuredClone(strategyEditorVariants(context)[variant] ?? {}) };
  return context === 'stop' || context === 'trailing'
    ? preserveProtectionActivation(row, next)
    : next;
}

export function editStrategyDefinition(
  draft: StrategyDefinitionDraft,
  path: StrategyDefinitionPath,
  value: unknown,
) {
  const references = editStrategyOrderReferences(draft, path, value);
  if (references) return references;
  const parentPath = path.slice(0, -1);
  const parent = strategyDraftRecord(strategyDraftValue(draft, parentPath));
  if (path.at(-1) === 'statistic' && parent.type === 'rolling') {
    const next: StrategyDefinitionDraft = { ...parent, statistic: value };
    delete next.ddof;
    delete next.quantile;
    if (value === 'standardDeviation') next.ddof = 0;
    if (value === 'quantile') next.quantile = '0.5';
    return patchStrategyDefinitionDraft(draft, parentPath, next);
  }
  if (path.at(-1) === 'name' && parent.type === 'indicator' && value !== parent.name) {
    const extras = Object.fromEntries(
      Object.entries(strategyDraftRecord(parent.params)).filter(
        ([key]) => !['period', 'fastPeriod', 'slowPeriod', 'signalPeriod'].includes(key),
      ),
    );
    const params =
      value === 'MACD' ? { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } : { period: 20 };
    const next: StrategyDefinitionDraft = {
      ...parent,
      name: value,
      params: { ...extras, ...params },
    };
    if (value === 'ADX') next.output = 'adx';
    else if (value === 'MACD')
      next.output = ['macd', 'signal', 'histogram'].includes(String(parent.output))
        ? parent.output
        : 'macd';
    else delete next.output;
    return patchStrategyDefinitionDraft(draft, parentPath, next);
  }
  if (path[0] === 'signalSources' && typeof path[1] === 'number') {
    if (path.length === 2 && value === undefined) return removeStrategySource(draft, path[1]);
    if (path.length === 3 && path[2] === 'id')
      return renameStrategySource(draft, path[1], typeof value === 'string' ? value : '');
    if (
      path.length === 4 &&
      path[2] === 'series' &&
      typeof path[3] === 'number' &&
      value !== strategyDraftValue(draft, path)
    )
      removeStrategySourceField(draft, path[1], path[3]);
  }
  return patchStrategyDefinitionDraft(draft, path, value);
}

export function appendStrategyEditorItem(
  draft: StrategyDefinitionDraft,
  path: StrategyDefinitionPath,
  context: string,
) {
  const previous = strategyDraftValue(draft, path);
  if (previous !== undefined && !Array.isArray(previous))
    throw Error('该配置目前不是数组，请先在高级 JSON 中修正；原值已保留。');
  const items: unknown[] = Array.isArray(previous) ? previous : [];
  const item = strategyEditorInitial(context);
  if (context === 'source' || context === 'stage' || context === 'orderTemplate') {
    let index = 1;
    const prefix = context === 'orderTemplate' ? 'order' : context;
    while (items.some((row) => strategyDraftRecord(row).id === `${prefix}${index}`)) index++;
    strategyDraftRecord(item).id = `${prefix}${index}`;
  }
  return patchStrategyDefinitionDraft(draft, path, [...items, item]);
}

export function toggleStrategyEditorArrayItem(
  draft: StrategyDefinitionDraft,
  path: StrategyDefinitionPath,
  value: string,
) {
  const previous = strategyDraftValue(draft, path);
  if (previous !== undefined && !Array.isArray(previous))
    throw Error('该配置目前不是数组，请先在高级 JSON 中修正；原值已保留。');
  const items: unknown[] = Array.isArray(previous) ? previous : [];
  const index = items.indexOf(value);
  if (index >= 0) return editStrategyDefinition(draft, [...path, index], undefined);
  return patchStrategyDefinitionDraft(draft, path, [...items, value]);
}

export function moveStrategyEditorItem(
  draft: StrategyDefinitionDraft,
  path: StrategyDefinitionPath,
  index: number,
  direction: -1 | 1,
) {
  const previous = strategyDraftValue(draft, path);
  if (!Array.isArray(previous)) return draft;
  const target = index + direction;
  if (index < 0 || target < 0 || index >= previous.length || target >= previous.length)
    return draft;
  const next: unknown[] = [...(previous as unknown[])];
  [next[index], next[target]] = [next[target], next[index]];
  return patchStrategyDefinitionDraft(draft, path, next);
}
