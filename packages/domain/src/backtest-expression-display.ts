import type { Expression } from './backtest-strategy.js';
import { expressionSourceIds } from './backtest-expression-observations.js';

const fields = {
  open: '开盘价',
  high: '最高价',
  low: '最低价',
  close: '收盘价',
  volume: '成交量',
  nav: '净值',
};
export const backtestComparisonLabels = {
  eq: '等于',
  neq: '不等于',
  gt: '高于',
  gte: '不低于',
  lt: '低于',
  lte: '不高于',
} as const;
export const backtestCrossLabels = { above: '上穿', below: '下穿' } as const;
export function describeBacktestExpression(
  node: Expression,
  sources: ReadonlyMap<string, string>,
  timezones: ReadonlyMap<string, string> = new Map(),
): string {
  if (node.type === 'constant') return node.value;
  if (node.type === 'confirmedPivot')
    return `第 ${node.offset + 1} 个最近已确认摆动${node.side === 'low' ? '低' : '高'}点（左 ${node.leftBars} 根、右 ${node.rightBars} 根；右侧完成后可用；${describeBacktestExpression(node.input, sources, timezones)}${node.sample ? `；取摆动点当时的 ${describeBacktestExpression(node.sample, sources, timezones)}` : ''}）`;
  if (node.type === 'eventValue') return '事件触发时冻结的值';
  if (node.type === 'sequence')
    return `先满足（${describeBacktestExpression(node.trigger, sources, timezones)}），随后 ${node.within} 根内满足（${describeBacktestExpression(node.confirm, sources, timezones)}）；${node.allowSameBar ? '允许' : '不允许'}同根确认，失效条件（${describeBacktestExpression(node.invalidation, sources, timezones)}），${node.repeat ? '可重复启动' : '只确认一次'}${node.capture ? `；触发时冻结（${describeBacktestExpression(node.capture, sources, timezones)}）` : ''}`;
  if (node.type === 'consecutive')
    return `含当前根连续 ${node.periods} 根均满足（${describeBacktestExpression(node.condition, sources, timezones)}）`;
  if (node.type === 'countTrue')
    return `含当前根最近 ${node.periods} 根中满足（${describeBacktestExpression(node.condition, sources, timezones)}）的根数`;
  if (node.type === 'cumulative') {
    const zones = new Set(expressionSourceIds(node.input).map((id) => timezones.get(id) ?? 'UTC'));
    const timeZone = zones.size === 1 ? [...zones][0]! : 'UTC';
    return `自 ${new Date(node.anchorAt).toLocaleString('zh-CN', { timeZone, hour12: false })}（${timeZone}）起累计${node.statistic === 'sum' ? '求和' : '最高值'}（${describeBacktestExpression(node.input, sources, timezones)}）`;
  }
  if (node.type === 'rolling') {
    let statistic = '总和';
    if (node.statistic === 'standardDeviation') statistic = `标准差（自由度 ${node.ddof}）`;
    if (node.statistic === 'quantile') statistic = `${node.quantile} 分位数（线性插值）`;
    return `含当前根最近 ${node.periods} 根的${statistic}（${describeBacktestExpression(node.input, sources, timezones)}）`;
  }
  if (node.type === 'lag')
    return `此前 ${node.periods} 根来源观测的（${describeBacktestExpression(node.input, sources, timezones)}；排除当前 ${node.periods} 根）`;
  if (node.type === 'absolute')
    return `绝对值（${describeBacktestExpression(node.input, sources, timezones)}）`;
  if (node.type === 'arithmetic') {
    const operator = {
      add: '加',
      subtract: '减',
      multiply: '乘以',
      divide: '除以',
      min: '与其取较小值',
      max: '与其取较大值',
    }[node.operator];
    return `（${describeBacktestExpression(node.left, sources, timezones)}）${operator}（${describeBacktestExpression(node.right, sources, timezones)}）`;
  }
  if (node.type === 'series') return (sources.get(node.sourceId) ?? '') + fields[node.field];
  if (node.type === 'sessionValue') {
    const label =
      node.field === 'vwap'
        ? '当日累计均价（收盘价乘成交量）'
        : '距当日首个开市分钟数（午休不重置）';
    return (sources.get(node.sourceId) ?? '') + label;
  }
  if (node.type === 'positionState')
    return {
      isOpen: '已持仓',
      quantity: '当前数量',
      averageCost: '持仓均价',
      holdingPeriods: '持有周期数',
    }[node.field];
  if (node.type === 'indicator') {
    return describeIndicator(node, sources, timezones);
  }
  if (node.type === 'all' || node.type === 'any')
    return node.conditions
      .map((c) => `（${describeBacktestExpression(c, sources, timezones)}）`)
      .join(node.type === 'all' ? '且' : '或');
  if (node.type === 'not')
    return node.expression.type === 'positionState' && node.expression.field === 'isOpen'
      ? '未持仓'
      : `不满足（${describeBacktestExpression(node.expression, sources, timezones)}）`;
  if (node.type === 'compare')
    return `${describeBacktestExpression(node.left, sources, timezones)}${backtestComparisonLabels[node.operator]}${describeBacktestExpression(node.right, sources, timezones)}`;
  if (node.type === 'cross')
    return `${describeBacktestExpression(node.left, sources, timezones)}${backtestCrossLabels[node.direction]}${describeBacktestExpression(node.right, sources, timezones)}`;
  return `权益事件 ${node.eventType}`;
}

function describeIndicator(
  node: Extract<Expression, { type: 'indicator' }>,
  sources: ReadonlyMap<string, string>,
  timezones: ReadonlyMap<string, string> = new Map(),
) {
  let parameters = `周期 ${node.params.period}`;
  if (node.name === 'MACD')
    parameters = `快周期 ${node.params.fastPeriod}、慢周期 ${node.params.slowPeriod}、信号周期 ${node.params.signalPeriod}`;
  const name = node.name === 'VWAP' ? '滚动成交量加权均价 VWAP' : node.name;
  const output =
    node.name === 'MACD' || node.name === 'ADX'
      ? {
          macd: '主线',
          signal: '信号线',
          histogram: '柱线',
          adx: '趋势强度',
          plusDI: '正方向 +DI',
          minusDI: '负方向 −DI',
        }[node.output ?? (node.name === 'ADX' ? 'adx' : 'macd')]
      : '';
  return `${name}${output}（${parameters}；${describeBacktestExpression(node.input, sources, timezones)}）`;
}
