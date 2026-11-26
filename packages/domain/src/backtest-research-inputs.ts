import type { BacktestAssetSymbolRef, BacktestSeriesField, BacktestStrategy,
  BacktestTimeframe, Expression } from './backtest-strategy.js';
import { expressionChildEntries, strategyRuleExpressions } from './backtest-expression-children.js';
import { expressionSourceIds } from './backtest-expression-observations.js';
import { requiredLookbackForExpression, indicatorRequiredLookback } from './backtest-indicators.js';

export type ResearchCoordinate = 'research' | 'actual';
export type ResearchInputConsumer = {
  kind: 'rule' | 'sizing' | 'execution' | 'valuation';
  path: readonly (string | number)[];
  fields: readonly BacktestSeriesField[];
  minimumWarmupRows: number;
};
export type ResearchInputNeed = {
  sourceId: string; sourceKind: 'signal' | 'execution' | 'benchmark';
  asset: BacktestAssetSymbolRef; coordinate: ResearchCoordinate; timeframe: BacktestTimeframe;
  fields: BacktestSeriesField[]; minimumWarmupRows: number;
  necessity: 'required' | 'optional'; consumers: ResearchInputConsumer[];
};

/** 交易AST保持原样；这里只计算字段、窗口及其实际用途。 */
export function researchStrategyInputNeeds(
  strategy: BacktestStrategy,
  options: { executionCoordinate: ResearchCoordinate; additionalInputs?: readonly ResearchInputNeed[] | undefined },
) {
  const needs = new Map<string, ResearchInputNeed>();
  const issues: { code: 'UNDECLARED_SOURCE'; path: readonly (string | number)[]; message: string }[] = [];
  const merge = (need: ResearchInputNeed) => {
    const key = JSON.stringify([need.sourceKind, need.sourceId, need.coordinate, need.timeframe,
      need.asset.market, need.asset.symbol, need.asset.assetType]);
    const previous = needs.get(key);
    needs.set(key, previous ? { ...previous,
      fields: [...new Set([...previous.fields, ...need.fields])].sort(),
      minimumWarmupRows: Math.max(previous.minimumWarmupRows, need.minimumWarmupRows),
      necessity: previous.necessity === 'required' || need.necessity === 'required' ? 'required' : 'optional',
      consumers: [...previous.consumers, ...need.consumers],
    } : need);
  };
  const sourceNeed = (id: string, fields: BacktestSeriesField[], rows: number,
    path: readonly (string | number)[], kind: ResearchInputConsumer['kind']) => {
    const source = strategy.signalSources.find((source) => source.id === id);
    if (!source) { issues.push({ code: 'UNDECLARED_SOURCE', path: [...path, 'sourceId'], message: `规则引用未声明来源 ${id}` }); return; }
    let coordinate = options.executionCoordinate;
    if (source.priceCoordinate === 'actual' || source.priceCoordinate === 'research') coordinate = source.priceCoordinate;
    merge({ sourceId: id, sourceKind: 'signal', asset: source.asset, coordinate,
      timeframe: source.timeframe, fields, minimumWarmupRows: rows, necessity: 'required',
      consumers: [{ kind, path, fields, minimumWarmupRows: rows }] });
  };
  const visit = (node: Expression, path: readonly (string | number)[], extra: number) => {
    if (node.type === 'series') sourceNeed(node.sourceId, [node.field], 1 + extra, path, 'rule');
    if (node.type === 'sessionValue') sourceNeed(node.sourceId,
      node.field === 'vwap' ? ['close', 'volume'] : ['close'], 1 + extra, path, 'rule');
    if (node.type === 'indicator' && ['VWAP', 'ATR', 'ADX'].includes(node.name)) {
      const fields: BacktestSeriesField[] = node.name === 'VWAP' ? ['volume'] : ['high', 'low', 'close'];
      for (const sourceId of expressionSourceIds(node.input)) {
        if (strategy.signalSources.some((source) => source.id === sourceId))
          sourceNeed(sourceId, fields, extra + indicatorRequiredLookback(node.name, node.params), path, 'rule');
      }
    }
    const children = expressionChildEntries(node);
    const childRows = Math.max(1, ...children.map((child) => requiredLookbackForExpression(child.expression)));
    const delay = Math.max(0, requiredLookbackForExpression(node) - childRows);
    children.forEach((child) => visit(child.expression, [...path, ...child.path], extra + delay));
  };
  for (const root of strategyRuleExpressions(strategy)) visit(root.expression, root.path, 0);
  for (const key of ['initialStop', 'trailing'] as const) {
    const rule = strategy.tradePlan?.[key];
    if (rule && 'sourceId' in rule) sourceNeed(rule.sourceId, ['high', 'low', 'close'],
      indicatorRequiredLookback('ATR', { period: rule.period }), ['tradePlan', key], 'rule');
  }
  const operationNeed = (coordinate: ResearchCoordinate, fields: BacktestSeriesField[],
    kind: ResearchInputConsumer['kind'], path: string[], rows = 1) => merge({
    sourceId: '$execution', sourceKind: 'execution', asset: strategy.executionInstrument,
    coordinate, timeframe: strategy.primaryTimeframe, fields, minimumWarmupRows: rows,
    necessity: 'required', consumers: [{ kind, path, fields, minimumWarmupRows: rows }],
  });
  operationNeed(options.executionCoordinate, ['open'], 'execution', ['execution']);
  operationNeed(options.executionCoordinate, ['close'], 'valuation', ['runConfig', 'valuationPolicy']);
  if (strategy.execution.timing === 'dailyBarOrders' &&
      strategy.execution.orders.some((order) => order.order.kind !== 'market'))
    operationNeed(options.executionCoordinate, ['high', 'low'], 'execution', ['execution', 'orders']);
  if (strategy.sizing.type === 'fixedQuantity') operationNeed('actual', ['open'], 'sizing', ['sizing']);
  if (strategy.tradePlan?.volatilityTarget) operationNeed(options.executionCoordinate, ['close'],
    'sizing', ['tradePlan', 'volatilityTarget'], strategy.tradePlan.volatilityTarget.returnPeriods + 1);
  if (strategy.benchmark) merge({ sourceId: '$benchmark', sourceKind: 'benchmark', asset: strategy.benchmark,
    coordinate: options.executionCoordinate, timeframe: strategy.primaryTimeframe, fields: ['close'],
    minimumWarmupRows: 1, necessity: 'required',
    consumers: [{ kind: 'valuation', path: ['benchmark'], fields: ['close'], minimumWarmupRows: 1 }],
  });
  for (const input of options.additionalInputs ?? []) merge(input);
  return { needs: [...needs.values()], issues };
}
