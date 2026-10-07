import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { marketDataBarSeriesResponseV3Schema, type BarSeries } from '@thesis-ledger/schemas';
import type { MarketDetailResponse } from '@thesis-ledger/api-client';
import { canCombineChartSeries } from './market-chart-acquisition.js';
import { mergeMarketDetail } from './market-detail.types.js';

const source = marketDataBarSeriesResponseV3Schema.parse(
  JSON.parse(
    readFileSync(
      new URL(
        '../../../../../packages/schemas/fixtures/market-data-v3.response.etf-qfq.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ),
);
const series = (acquisition?: string): BarSeries => ({
  contractVersion: 3,
  identity: { symbol: source.symbol, assetType: 'ETF', timeframe: '1d', adjustment: 'qfq' },
  points: structuredClone(source.bars),
  coverage: { ...source.coverage },
  inputFingerprint: 'view',
  provenance: {
    ...source.provenance,
    providerRevision: acquisition ?? 'legacy',
    fetchedAt: source.sourcePriceBasis.observedAt,
    freshUntil: source.sourcePriceBasis.observedAt,
    servedFromCache: false,
    cacheStatus: 'miss',
  },
  ...(acquisition
    ? {
        chartContextV3: {
          purpose: 'interactive-chart' as const,
          sourcePriceBasis: source.sourcePriceBasis,
          requestedStart: source.coverage.requestedStart,
          requestedEnd: source.coverage.requestedEnd,
          acquisitionFingerprint: acquisition,
        },
      }
    : {}),
});
const detail = (bars: BarSeries): MarketDetailResponse => ({
  contractVersion: 3,
  symbol: source.symbol,
  assetType: 'ETF',
  identity: { source: 'asset', status: 'confirmed' },
  requested: ['bars'],
  capabilities: { supported: ['bars'], unsupported: [] },
  limits: { bars: 30, nav: 30 },
  barSeries: bars,
  sections: { bars: { capability: 'bars', status: 'ready', data: bars } },
  dependencies: {},
  requestId: 'detail',
  generatedAt: source.sourcePriceBasis.observedAt,
});

describe('图表获取批次隔离', () => {
  it('空响应保留原获取批次，不把旧点标为新观测', () => {
    const current = detail(series('one'));
    const next = detail(series('two'));
    next.barSeries!.points = [];
    next.sections.bars!.status = 'empty';
    const merged = mergeMarketDetail(current, next);
    expect(merged.barSeries).toBe(current.barSeries);
    expect(merged.sections.bars).toBe(current.sections.bars);
  });
  it('旧分页保持兼容，新版只合并同一获取批次', () => {
    expect(canCombineChartSeries(series(), series())).toBe(true);
    expect(canCombineChartSeries(series('one'), series('one'))).toBe(true);
    expect(canCombineChartSeries(series('one'), series('two'))).toBe(false);
    expect(canCombineChartSeries(series(), series('one'))).toBe(false);
    expect(canCombineChartSeries(series('one'), series())).toBe(false);
  });
  it('任何版本都不能混合口径或标的', () => {
    const other = series();
    other.identity.adjustment = 'hfq';
    expect(canCombineChartSeries(series(), other)).toBe(false);
    other.identity.adjustment = 'qfq';
    other.identity.symbol = '600519.SH';
    expect(canCombineChartSeries(series(), other)).toBe(false);
  });
  it('新版修订替换整段，清除旧指标并保留无关分段', () => {
    const current = detail(series('one'));
    current.sections['indicator:MA'] = { capability: 'indicator:MA', status: 'empty', data: null };
    current.sections.chip = { capability: 'chip', status: 'unsupported' };
    const next = detail(series('two'));
    next.barSeries!.points = next.barSeries!.points.slice(-1);
    const result = mergeMarketDetail(current, next);
    expect(result.barSeries?.points).toHaveLength(1);
    expect(result.barSeries?.chartContextV3?.acquisitionFingerprint).toBe('two');
    expect(result.sections['indicator:MA']).toBeUndefined();
    expect(result.sections.chip).toEqual(current.sections.chip);
  });
});
