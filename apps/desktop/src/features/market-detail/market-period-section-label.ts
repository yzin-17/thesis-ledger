import type { MarketDisplayBarSeries } from '@thesis-ledger/schemas';
import { marketPeriodLabels, type ChartPeriod } from './MarketPeriodSelection.js';

export function derivedSectionLabel(data: unknown) {
  if (!data || typeof data !== 'object' || !('derivation' in data)) return null;
  const series = data as MarketDisplayBarSeries;
  if (!('derivation' in series)) return null;
  return {
    title: `最近${marketPeriodLabels[series.identity.timeframe as ChartPeriod] ?? '周期行情'}`,
    source: `服务端派生 · 基础来源 ${series.provenance.baseSources.map((source) => source.upstreamSource).join('、')}`,
  };
}
