import { marketPeriodLabels, type ChartPeriod } from './MarketPeriodSelection.js';
import type { MarketChartBar } from './market-chart-types.js';

export function chartPeriodTitle(bar: MarketChartBar | undefined) {
  return bar?.timeframe === '1m' ? '分钟走势' : `${marketPeriodLabels[bar?.timeframe as ChartPeriod] ?? '日线'}走势`;
}
export function chartCompletionLabel(bar: MarketChartBar | undefined) {
  if (bar?.completionStatus === 'incomplete')
    return bar.timeframeKind === 'derived' ? '本周期尚未结束' : '未收盘（当日未完成）';
  if (bar?.completionStatus === 'unknown') return '收盘状态未知';
  if (bar?.completionStatus === 'complete') return '已收盘';
  return '收盘状态未声明';
}
export function chartPeriodSourceLabel(bar: MarketChartBar | undefined) {
  const adjustment = { none: '不复权', qfq: '前复权', hfq: '后复权' };
  const basis = bar?.adjustment ? adjustment[bar.adjustment] : '未声明';
  if (bar?.timeframeKind === 'derived')
    return `${marketPeriodLabels[bar.timeframe as ChartPeriod]} · 派生 · 基础来源 ${bar.upstreamSource ?? '未知'} · ${basis}`;
  return `数据来源 ${bar?.provider ?? '未知'} · 复权 ${basis}`;
}
