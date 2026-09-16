import type { MarketDetailResponseV2 } from '@thesis-ledger/api-client';
import type {
  BarPointV2,
  BarSeriesV2,
  IndicatorResultV2,
} from '@thesis-ledger/schemas';

/**
 * Desktop-only chart presentation data. The API wire contract remains the V2
 * BarSeries/IndicatorResult; this model merely joins series provenance to each
 * point for the existing chart/readout behavior.
 */
export type MarketChartBar = Omit<BarPointV2, 'completionStatus' | 'availableAt'> & {
  completionStatus?: BarPointV2['completionStatus'];
  availableAt?: string;
  symbol?: string;
  timeframe?: BarSeriesV2['identity']['timeframe'];
  provider?: string;
  upstreamSource?: string;
  providerRevision?: string;
  adjustment?: BarSeriesV2['identity']['adjustment'];
  inputFingerprint?: string | undefined;
  fetchedAt?: string;
  freshness?: 'live' | 'delayed' | 'stale';
  servedFromCache?: boolean;
};

export type MarketChartIndicator = Omit<IndicatorResultV2, 'points' | 'inputFingerprint'> & {
  inputFingerprint?: string | undefined;
  symbol?: string;
  timeframe?: BarSeriesV2['identity']['timeframe'];
  marketTime?: string;
  calculatedAt?: string;
  values?: Record<string, number | null>;
  provider?: string;
  points: Array<IndicatorResultV2['points'][number] & { inputFingerprint?: string | undefined }>;
  inputProvenance?: {
    timeframe: BarSeriesV2['identity']['timeframe'];
    provider: string;
    upstreamSource?: string;
    providerRevision?: string;
    adjustment?: BarSeriesV2['identity']['adjustment'];
    inputDateRange: { start: string; end: string };
    inputFingerprint: string;
  };
  calculationAnchor?: { timestamp: string; inputFingerprint: string };
  coverage?: {
    start: string;
    end: string;
    complete: boolean;
    hasMoreBefore: boolean;
  };
  servedFromCache?: boolean;
  engineVersion?: string;
};

export const chartBarsFromSeries = (series: BarSeriesV2): MarketChartBar[] => {
  const freshness = series.provenance.cacheStatus === 'stale' ? 'stale' : 'delayed';
  return series.points.map((point: BarPointV2) => ({
    ...point,
    symbol: series.identity.symbol,
    timeframe: series.identity.timeframe,
    provider: series.provenance.providerId,
    upstreamSource: series.provenance.upstreamSource,
    providerRevision: series.provenance.providerRevision,
    adjustment: series.identity.adjustment,
    inputFingerprint: series.inputFingerprint,
    freshness,
    servedFromCache: series.provenance.servedFromCache,
  }));
};

export const chartIndicatorFromResult = (
  result: IndicatorResultV2,
  series: BarSeriesV2,
  generatedAt: string,
): MarketChartIndicator => {
  const start = series.coverage.actualStart ?? series.points[0]?.timestamp ?? generatedAt;
  const end = series.coverage.actualEnd ?? series.points.at(-1)?.timestamp ?? generatedAt;
  return {
    ...result,
    symbol: series.identity.symbol,
    timeframe: series.identity.timeframe,
    marketTime: end,
    calculatedAt: generatedAt,
    values: result.points.at(-1)?.values ?? {},
    provider: series.provenance.providerId,
    points: result.points.map((point) => ({ ...point, inputFingerprint: result.inputFingerprint })),
    inputProvenance: {
      timeframe: series.identity.timeframe,
      provider: series.provenance.providerId,
      upstreamSource: series.provenance.upstreamSource,
      providerRevision: series.provenance.providerRevision,
      adjustment: series.identity.adjustment,
      inputDateRange: { start, end },
      inputFingerprint: result.inputFingerprint,
    },
    calculationAnchor: { timestamp: end, inputFingerprint: result.inputFingerprint },
    coverage: {
      start,
      end,
      complete: series.points.every((point) => point.completionStatus === 'complete'),
      hasMoreBefore: series.coverage.hasMoreBefore,
    },
    servedFromCache: series.provenance.servedFromCache,
    engineVersion: 'dsa-indicator-v2',
  };
};

/**
 * 一次详情响应就是一张历史分页：它自己的 BarSeries 与按同窗口计算的指标共享
 * inputFingerprint。保留页边界是逐日比对的前提，不能先把各页的 bars 拍平成一条序列。
 */
export type MarketChartPage = {
  bars: MarketChartBar[];
  indicators: MarketChartIndicator[];
};

export const chartPageFromResponse = (
  response: MarketDetailResponseV2,
): MarketChartPage | null => {
  const series = response.barSeries;
  if (!series) return null;
  return {
    bars: chartBarsFromSeries(series),
    indicators: response.requested
      .filter((capability) => capability.startsWith('indicator:'))
      .flatMap((capability) => {
        const data = response.sections[capability]?.data as IndicatorResultV2 | undefined;
        return data ? [chartIndicatorFromResult(data, series, response.generatedAt)] : [];
      }),
  };
};
