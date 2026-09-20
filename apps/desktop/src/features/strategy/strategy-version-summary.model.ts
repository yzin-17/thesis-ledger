import { strategySchemaV2, type StrategySchemaV2 } from '@thesis-ledger/schemas';
import type { StrategySchema, StrategyVersion } from './strategy.types.js';
import {
  strategyAssetTypeLabel,
  strategyComparisonOperatorLabel,
  strategyCrossDirectionLabel,
  strategyIndicatorLabel,
  strategyMarketLabel,
  strategySeriesFieldLabel,
  strategyTimeframeLabel,
} from './strategy-display-labels.js';

export type StrategyVersionSummary =
  | { kind: 'ready'; sections: ReadonlyArray<{ label: string; value: string }> }
  | { kind: 'missing'; missing: string[] }
  | { kind: 'invalid'; reason: string }
  | { kind: 'legacy' };

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const has = (value: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key) && value[key] !== undefined;

const requiredV2Fields = (schema: StrategySchema) => {
  const missing: string[] = [];
  const labels: Record<string, string> = {
    signalSources: '信号来源',
    executionInstrument: '执行标的',
    primaryTimeframe: '主周期',
    entry: '入场条件',
    exit: '退出条件',
    sizing: '仓位规则',
    risk: '风险规则',
    execution: '执行假设',
    cost: '成本假设',
  };
  for (const key of Object.keys(labels)) {
    if (!has(schema, key)) missing.push(labels[key]!);
  }
  const instrument = record(schema.executionInstrument);
  if (instrument) {
    if (!has(instrument, 'symbol')) missing.push('执行标的代码');
    if (!has(instrument, 'market')) missing.push('执行市场');
    if (!has(instrument, 'assetType')) missing.push('资产类型');
  }
  return [...new Set(missing)];
};

const sourceDisplayLabels = (sources: StrategySchemaV2['signalSources']) =>
  new Map(
    sources.map((source) => [
      source.id,
      `${source.asset.symbol}（${strategyTimeframeLabel(source.timeframe)}）`,
    ]),
  );

const numericExpression = (value: unknown, sourceLabels: ReadonlyMap<string, string>): string => {
  const node = record(value);
  if (!node) return '无法识别的数值条件';
  if (node.type === 'constant') {
    return typeof node.value === 'string' || typeof node.value === 'number'
      ? String(node.value)
      : '未知数值';
  }
  if (node.type === 'series') {
    const sourceLabel = sourceLabels.get(String(node.sourceId)) ?? '信号来源';
    const fieldLabel = strategySeriesFieldLabel(node.field);
    return `${sourceLabel}的${fieldLabel}`;
  }
  if (node.type === 'positionState') {
    const labels: Record<string, string> = {
      quantity: '当前持仓数量',
      averageCost: '持仓均价',
      holdingPeriods: '已持有周期',
    };
    return labels[String(node.field)] ?? '持仓状态';
  }
  if (node.type === 'indicator') {
    const params = record(node.params);
    const suffix = params ? `（${Object.values(params).map(String).join('、')}）` : '';
    const indicatorLabel = strategyIndicatorLabel(node.name);
    return `${indicatorLabel}${suffix}［${numericExpression(node.input, sourceLabels)}］`;
  }
  return '无法识别的数值条件';
};

const booleanExpression = (value: unknown, sourceLabels: ReadonlyMap<string, string>): string => {
  const node = record(value);
  if (!node) return '无法识别的交易条件';
  if (node.type === 'all' || node.type === 'any') {
    const conditions = Array.isArray(node.conditions) ? node.conditions : [];
    const connector = node.type === 'all' ? ' 且 ' : ' 或 ';
    return (
      conditions.map((condition) => booleanExpression(condition, sourceLabels)).join(connector) ||
      '没有条件'
    );
  }
  if (node.type === 'not') return `不满足（${booleanExpression(node.expression, sourceLabels)}）`;
  if (node.type === 'positionState') return '已有持仓';
  if (node.type === 'cross') {
    return `${numericExpression(node.left, sourceLabels)}${strategyCrossDirectionLabel(node.direction)}${numericExpression(node.right, sourceLabels)}`;
  }
  if (node.type === 'compare') {
    return `${numericExpression(node.left, sourceLabels)}${strategyComparisonOperatorLabel(node.operator)}${numericExpression(node.right, sourceLabels)}`;
  }
  return '无法识别的交易条件';
};

const percentage = (value: string) => `${(Number(value) * 100).toLocaleString()}%`;

const sizingSummary = (sizing: StrategySchemaV2['sizing']) => {
  if (sizing.type === 'fixedAmount') return `每次固定投入 ${sizing.amount}`;
  if (sizing.type === 'percentOfEquity') return `每次使用权益的 ${percentage(sizing.percent)}`;
  if (sizing.type === 'fixedQuantity') return `每次固定买入 ${sizing.quantity}`;
  return `目标仓位 ${percentage(sizing.weight)}`;
};

const riskSummary = (risks: StrategySchemaV2['risk']) => {
  if (risks.length === 0) return '未设置独立风险退出规则';
  return risks
    .map((risk) => {
      if (risk.type === 'fixedStop') return `固定止损 ${percentage(risk.percent)}`;
      if (risk.type === 'fixedTakeProfit') return `固定止盈 ${percentage(risk.percent)}`;
      return `最多持有 ${risk.periods} 个周期`;
    })
    .join('；');
};

const executionSummary = (schema: StrategySchemaV2) => {
  const cost = `佣金率 ${percentage(schema.cost.commissionRate)}，滑点率 ${percentage(schema.cost.slippageRate)}`;
  if (schema.execution.mode === 'nav') return `按下一可用净值申购或赎回；${cost}`;
  return `信号后在下一可执行 K 线开盘，以当日有效市价单执行；${cost}`;
};

export const strategyVersionDisplayLabel = (version: StrategyVersion) => `v${version.version}`;

export const strategyStatusLabel = (status: string | null | undefined) => {
  if (status === 'active') return '使用中';
  if (status === 'archived') return '已归档';
  if (status === 'draft') return '草稿';
  return '状态未知';
};

export const strategyVersionSummary = (version: StrategyVersion): StrategyVersionSummary => {
  const schema = version.schema;
  const isV2 = version.schemaVersion === 2 || schema?.schemaVersion === '2';
  if (!isV2) return { kind: 'legacy' };
  if (!schema) return { kind: 'missing', missing: ['策略定义'] };
  const missing = requiredV2Fields(schema);
  if (missing.length > 0) return { kind: 'missing', missing };
  const parsed = strategySchemaV2.safeParse(schema);
  if (!parsed.success) {
    return { kind: 'invalid', reason: parsed.error.issues[0]?.message ?? '策略定义无法解析' };
  }
  const value = parsed.data as StrategySchemaV2;
  const instrument = value.executionInstrument;
  const sourceLabels = sourceDisplayLabels(value.signalSources);
  return {
    kind: 'ready',
    sections: [
      { label: '策略说明', value: value.description?.trim() || '未填写策略说明' },
      {
        label: '适用范围',
        value: `${instrument.symbol} · ${strategyMarketLabel(instrument.market)} · ${strategyAssetTypeLabel(instrument.assetType)} · ${strategyTimeframeLabel(value.primaryTimeframe)}`,
      },
      { label: '入场逻辑', value: booleanExpression(value.entry, sourceLabels) },
      { label: '退出逻辑', value: booleanExpression(value.exit, sourceLabels) },
      { label: '仓位管理', value: sizingSummary(value.sizing) },
      { label: '风险约束', value: riskSummary(value.risk) },
      { label: '执行假设', value: executionSummary(value) },
    ],
  };
};
