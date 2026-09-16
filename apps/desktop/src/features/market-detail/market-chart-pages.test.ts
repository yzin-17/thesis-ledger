import { describe, expect, it } from 'vitest';
import type { MarketDetailResponseV2 } from '@thesis-ledger/api-client';
import type { BarSeriesV2, IndicatorResultV2 } from '@thesis-ledger/schemas';
import { buildChartPoints, indicatorValue, mergeChartPoints } from './market-chart-model.js';
import {
  chartBarsFromSeries,
  chartPageFromResponse,
  type MarketChartPage,
} from './market-chart-types.js';
import { mergeMarketDetail } from './market-detail.types.js';

const SYMBOL = '510300.SH';
const GENERATED_AT = '2026-09-15T08:00:00.000Z';
const RECENT = ['2026-09-14', '2026-09-15'];
const OLDER = ['2026-09-10', '2026-09-11'];

const series = (dates: readonly string[], fingerprint: string): BarSeriesV2 => ({
  contractVersion: 2,
  identity: { symbol: SYMBOL, assetType: 'ETF', timeframe: '1d', adjustment: 'qfq' },
  points: dates.map((date, index) => ({
    timestamp: `${date}T00:00:00.000Z`,
    open: 4.5 + index,
    high: 4.6 + index,
    low: 4.4 + index,
    close: 4.52 + index,
    volume: 1000 + index,
    amount: 4500 + index,
    completionStatus: 'complete' as const,
    availableAt: `${date}T08:00:00.000Z`,
  })),
  coverage: {
    actualStart: `${dates[0]}T00:00:00.000Z`,
    actualEnd: `${dates.at(-1)}T00:00:00.000Z`,
    hasMoreBefore: true,
    latestCompleteTradingDate: '2026-09-15',
  },
  provenance: {
    providerId: 'efinance',
    upstreamSource: 'efinance',
    routeIndex: 0,
    effectivePolicyRevision: 1,
    providerRevision: 'rev-1',
    fetchedAt: GENERATED_AT,
    freshUntil: '2099-01-01T00:00:00.000Z',
    servedFromCache: false,
    cacheStatus: 'miss',
  },
  inputFingerprint: fingerprint,
});

// 每页的指标都由服务端按同窗口计算，因此页内与 BarSeries 共享 fingerprint。
const indicator = (
  name: 'MA' | 'MACD',
  dates: readonly string[],
  fingerprint: string,
): IndicatorResultV2 => ({
  name,
  parameters: name === 'MA' ? { period: 5 } : { fast: 12, slow: 26, signal: 9 },
  inputFingerprint: fingerprint,
  points: dates.map((date, index) => ({
    timestamp: `${date}T00:00:00.000Z`,
    values:
      name === 'MA'
        ? { ma5: 4.5 + index, ma20: 4.3 + index, ma60: null }
        : { dif: 0.1 + index, dea: 0.05 + index, histogram: 0.05 + index },
  })),
});

const page = (
  dates: readonly string[],
  fingerprint: string,
  requestId: string,
): MarketDetailResponseV2 => {
  const barSeries = series(dates, fingerprint);
  const maResult = indicator('MA', dates, fingerprint);
  const macdResult = indicator('MACD', dates, fingerprint);
  return {
    contractVersion: 2,
    symbol: SYMBOL,
    assetType: 'ETF',
    identity: { source: 'asset', status: 'confirmed' },
    requested: ['bars', 'indicator:MA', 'indicator:MACD'],
    capabilities: { supported: ['bars', 'indicator:MA', 'indicator:MACD'], unsupported: [] },
    limits: { bars: 90, nav: 90, barsHasMoreBefore: true },
    barSeries,
    sections: {
      bars: { capability: 'bars', status: 'ready', data: barSeries },
      'indicator:MA': { capability: 'indicator:MA', status: 'ready', data: maResult },
      'indicator:MACD': { capability: 'indicator:MACD', status: 'ready', data: macdResult },
    },
    dependencies: {},
    requestId,
    generatedAt: GENERATED_AT,
  };
};

const pageNewer = page(RECENT, 'fp-newer-window', 'req-newer');
const pageOlder = page(OLDER, 'fp-older-window', 'req-older');

const pointsFromPages = (pages: readonly MarketChartPage[]) =>
  mergeChartPoints(pages.map((item) => buildChartPoints(item.bars, item.indicators)));

describe('按页构建并合并 ChartPoint', () => {
  it('每页保留自己的窗口指纹，合并后各页日期都可比', () => {
    const pages = [chartPageFromResponse(pageNewer), chartPageFromResponse(pageOlder)].filter(
      (item): item is MarketChartPage => item !== null,
    );
    expect(pages).toHaveLength(2);
    const points = pointsFromPages([...pages].reverse());
    expect(points.map((point) => point.date)).toEqual([
      '2026-09-10',
      '2026-09-11',
      '2026-09-14',
      '2026-09-15',
    ]);
    expect(points.every((point) => point.comparableIndicators.MA === true)).toBe(true);
    expect(points.every((point) => point.comparableIndicators.MACD === true)).toBe(true);
    const latest = points.at(-1);
    expect(indicatorValue(latest?.indicators.MA, ['ma5'])).toBe(5.5);
    expect(indicatorValue(latest?.indicators.MACD, ['dif'])).toBe(1.1);
  });

  it('先拍平序列再逐日比对会让先前已加载的日期失去可比性（回归锁）', () => {
    const merged = mergeMarketDetail(pageNewer, pageOlder);
    // chartBarsFromSeries 会把合并序列唯一的 fingerprint 盖到每一根 bar 上
    const bars = chartBarsFromSeries(merged.barSeries!);
    expect([...new Set(bars.map((bar) => bar.inputFingerprint))]).toEqual(['fp-older-window']);
    const indicators = [
      ...(chartPageFromResponse(pageOlder)?.indicators ?? []),
      ...(chartPageFromResponse(pageNewer)?.indicators ?? []),
    ];
    const points = buildChartPoints(bars, indicators);
    const recent = points.find((point) => point.date === '2026-09-15');
    expect(recent?.comparableIndicators.MA).toBe(false);
    expect(recent?.comparableIndicators.MACD).toBe(false);
  });

  it('同日期重叠时优先保留带可比证据的点', () => {
    const comparable = chartPageFromResponse(pageNewer);
    const opaque: MarketChartPage = {
      bars: comparable!.bars,
      indicators: comparable!.indicators.map((item) => ({
        ...item,
        inputFingerprint: 'unknown-window',
        points: item.points.map((point) => ({ ...point, inputFingerprint: 'unknown-window' })),
      })),
    };
    const points = pointsFromPages([opaque, comparable!]);
    expect(points).toHaveLength(2);
    expect(points.every((point) => point.comparableIndicators.MA === true)).toBe(true);
  });
});
