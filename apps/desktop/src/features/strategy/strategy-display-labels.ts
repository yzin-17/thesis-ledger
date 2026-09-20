type LabelMap = Readonly<Record<string, string>>;

const displayLabel = (value: unknown, labels: LabelMap, fallback: string) => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  return labels[value] ?? fallback;
};

const marketLabels = {
  CN: '中国内地',
  HK: '香港',
  US: '美国',
} as const;

const assetTypeLabels = {
  stock: '股票',
  etf: 'ETF',
  fund: '基金',
} as const;

const timeframeLabels = {
  '1d': '日线',
  '60m': '60 分钟',
  '30m': '30 分钟',
  '15m': '15 分钟',
  '5m': '5 分钟',
  '1m': '1 分钟',
} as const;

const seriesFieldLabels = {
  open: '开盘价',
  high: '最高价',
  low: '最低价',
  close: '收盘价',
  volume: '成交量',
  nav: '单位净值',
} as const;

const indicatorLabels = {
  MA: '移动平均线',
  EMA: '指数移动平均线',
  RSI: '相对强弱指标',
  MACD: '指数平滑异同移动平均线',
  ATR: '平均真实波幅',
  VWAP: '成交量加权平均价',
  Highest: '最高值',
  Lowest: '最低值',
} as const;

const comparisonOperatorLabels = {
  eq: '等于',
  neq: '不等于',
  gt: '大于',
  gte: '大于等于',
  lt: '小于',
  lte: '小于等于',
  crossesAbove: '上穿',
  crossesBelow: '下穿',
} as const;

const sizingTypeLabels = {
  fixedAmount: '固定投入金额',
  percentOfEquity: '权益比例',
  fixedQuantity: '固定数量',
  targetWeight: '目标权重',
} as const;

const riskTypeLabels = {
  fixedStop: '固定止损',
  fixedTakeProfit: '固定止盈',
  maxHoldingPeriod: '最大持有期',
} as const;

const riskCycleModeLabels = {
  existingAndFuture: '当前及未来持仓周期',
  nextPositionCycle: '仅下一持仓周期',
} as const;

const riskEvaluationStateLabels = {
  triggered: '已触发',
  not_triggered: '未触发',
  unavailable: '不可用',
  not_applicable: '不适用',
} as const;

const riskNotificationSeverityLabels = {
  info: '提示',
  warning: '警告',
  error: '严重',
  critical: '关键',
} as const;

const riskNotificationChannelLabels = {
  feishu: '飞书',
} as const;

const monitoringMetricLabels = {
  priceToAverageCostReturn: '价格相对平均成本收益率',
  holdingPeriods: '已持有周期',
} as const;

const monitoringCoverageSourceLabels = {
  entry: '入场条件',
  sizing: '仓位配置',
  exit: '离场条件',
} as const;

export const strategyTimeframeValues = Object.keys(timeframeLabels);

export const strategySizingTypeOptions = Object.entries(sizingTypeLabels).map(([value, label]) => ({
  value,
  label,
}));

export const strategyRiskCycleModeOptions = Object.entries(riskCycleModeLabels).map(
  ([value, label]) => ({ value, label }),
);

export const strategyRiskNotificationSeverityOptions = Object.entries(
  riskNotificationSeverityLabels,
).map(([value, label]) => ({ value, label }));

const strategySignalOperatorValues: ReadonlyArray<keyof typeof comparisonOperatorLabels> = [
  'gt',
  'gte',
  'lt',
  'lte',
  'crossesAbove',
  'crossesBelow',
];

export const strategySignalOperatorOptions = strategySignalOperatorValues.map((value) => ({
  value,
  label: comparisonOperatorLabels[value],
}));

export const strategySignalIndicatorOptions = [
  'close',
  'price',
  'open',
  'high',
  'low',
  'volume',
].map((value) => ({
  value,
  label:
    value === 'price'
      ? seriesFieldLabels.close
      : displayLabel(value, seriesFieldLabels, '历史指标'),
}));

export const strategyMarketLabel = (value: unknown, fallback = '未知市场') =>
  displayLabel(value, marketLabels, fallback);

export const strategyAssetTypeLabel = (value: unknown, fallback = '未知资产类型') =>
  displayLabel(value, assetTypeLabels, fallback);

export const strategyTimeframeLabel = (value: unknown, fallback = '未知周期') =>
  displayLabel(value, timeframeLabels, fallback);

export const strategySeriesFieldLabel = (value: unknown, fallback = '行情字段') =>
  displayLabel(value, seriesFieldLabels, fallback);

export const strategyIndicatorLabel = (value: unknown, fallback = '技术指标') =>
  displayLabel(value, indicatorLabels, fallback);

export const strategyComparisonOperatorLabel = (value: unknown, fallback = '进行比较') =>
  displayLabel(value, comparisonOperatorLabels, fallback);

export const strategyCrossDirectionLabel = (value: unknown) =>
  value === 'above' ? '上穿' : value === 'below' ? '下穿' : '交叉';

export const strategySignalIndicatorLabel = (value: unknown) => {
  if (value === 'price') return seriesFieldLabels.close;
  return strategySeriesFieldLabel(value, '历史指标');
};

export const strategySizingTypeLabel = (value: unknown, fallback = '未配置') =>
  displayLabel(value, sizingTypeLabels, fallback);

export const strategyRiskTypeLabel = (value: unknown, fallback = '未配置') =>
  displayLabel(value, riskTypeLabels, fallback);

export const strategyRiskCycleModeLabel = (value: unknown, fallback = '未知生效范围') =>
  displayLabel(value, riskCycleModeLabels, fallback);

export const strategyRiskEvaluationStateLabel = (value: unknown, fallback = '待评价') =>
  displayLabel(value, riskEvaluationStateLabels, fallback);

export const strategyRiskNotificationSeverityLabel = (value: unknown, fallback = '未知级别') =>
  displayLabel(value, riskNotificationSeverityLabels, fallback);

export const strategyRiskNotificationChannelLabel = (value: unknown, fallback = '未知渠道') =>
  displayLabel(value, riskNotificationChannelLabels, fallback);

export const strategyMonitoringMetricLabel = (value: unknown, fallback = '监控指标') =>
  displayLabel(value, monitoringMetricLabels, fallback);

export const strategyMonitoringCoverageSourceLabel = (value: unknown) => {
  if (typeof value === 'string' && value.startsWith('risk:')) {
    const riskType = value.split(':').at(-1);
    return strategyRiskTypeLabel(riskType, '风险条件');
  }
  return displayLabel(value, monitoringCoverageSourceLabels, '策略条件');
};

export const strategyExecutionModeLabel = (value: unknown, fallback = '未配置') =>
  displayLabel(value, { exchange: '交易所', nav: '基金净值' }, fallback);

export const strategyOrderTypeLabel = (value: unknown, fallback = '未配置') =>
  displayLabel(value, { market: '市价单' }, fallback);

export const strategyTimeInForceLabel = (value: unknown, fallback = '未配置') =>
  displayLabel(value, { DAY: '当日有效' }, fallback);

export const strategyExecutionTimingLabel = (value: unknown, fallback = '未配置') =>
  displayLabel(
    value,
    { nextEligibleBarOpen: '下一可执行 K 线开盘', nextAvailableNav: '下一可用净值' },
    fallback,
  );
