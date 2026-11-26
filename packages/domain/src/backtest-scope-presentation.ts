import type { ResearchDataScope } from './backtest-research-data-scope.js';

/** 展示本次准备的实际能力；不推导额外数据资格或覆盖率门槛。 */
export function backtestResearchScopeDisplay(scope: ResearchDataScope | undefined) {
  if (!scope) return null;
  const timeframe: Record<string, string> = { '1d': '日线', '1m': '1分钟', '5m': '5分钟', '15m': '15分钟', '30m': '30分钟', '60m': '60分钟' };
  const fields: Record<string, string> = { open: '开盘', high: '最高', low: '最低', close: '收盘', volume: '成交量', nav: '单位净值' };
  const inputs = scope.sources.map((source) => `${source.coordinate === 'actual' ? '原价参考' : '后复权研究'} · ${timeframe[source.timeframe] ?? source.timeframe} · ${source.fields.map((field) => fields[field] ?? field).join('、')}`);
  const limits = scope.unavailableCapabilities.map((item) => item.message).filter((message): message is string => Boolean(message));
  for (const source of scope.sources) {
    if (!source.fields.includes('volume')) limits.push(`${source.coordinate === 'actual' ? '原价参考' : '后复权研究'}·${timeframe[source.timeframe] ?? source.timeframe}未开放成交量输入，对应量能条件暂不可用。`);
  }
  if (!scope.priceCoordinates.includes('actual')) limits.unshift('本次未取得原价参考，可研究已有价格指标与金额／比例投入；实际价格阈值和固定份数暂不可用。');
  const sizing = scope.sizingModes.map((mode) => ({ fixedAmount: '固定金额', equityRatio: '权益比例', fixedQuantity: '固定份数' })[mode]);
  return { inputs, sizing: sizing.join('、'), limits: [...new Set(limits)] };
}
