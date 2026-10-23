import type { MarketDisplayDetailResponse as MarketDetailResponse } from '@thesis-ledger/api-client';
import { chartSourceMetadata } from './market-chart-source.js';
import type {
  BarPoint,
  MarketDisplayBarSeries as BarSeries,
  MarketIndicatorResult,
} from '@thesis-ledger/schemas';

/**
 * Desktop 图表展示数据，将序列来源信息附在每个点上供图表和读数使用。
 */
export type MarketChartBar = Omit<BarPoint, 'completionStatus' | 'availableAt'> & {
  completionStatus?: BarPoint['completionStatus'];
  availableAt?: string;
  symbol?: string;
  timeframe?: BarSeries['identity']['timeframe'];
  session?: 'regular';
  timeframeKind?: 'base' | 'derived';
  provider?: string;
  upstreamSource?: string;
  providerRevision?: string;
  adjustment?: BarSeries['identity']['adjustment'];
  inputFingerprint?: string | undefined;
  fetchedAt?: string;
  freshness?: 'live' | 'delayed' | 'stale';
  servedFromCache?: boolean;
};

export type MarketChartIndicator = Omit<MarketIndicatorResult, 'points' | 'inputFingerprint'> & {
  inputFingerprint?: string | undefined;
  symbol?: string;
  timeframe?: BarSeries['identity']['timeframe'];
  marketTime?: string;
  calculatedAt?: string;
  values?: Record<string, number | null>;
  provider?: string;
  points: Array<MarketIndicatorResult['points'][number] & { inputFingerprint?: string | undefined }>;
  inputProvenance?: {
    timeframe: BarSeries['identity']['timeframe'];
    provider: string;
    upstreamSource?: string;
    providerRevision?: string;
    adjustment?: BarSeries['identity']['adjustment'];
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

export const chartBarsFromSeries = (series: BarSeries): MarketChartBar[] => {
  const source = chartSourceMetadata(series);
  return series.points.map((point: BarPoint) => ({
    ...point,
    symbol: series.identity.symbol,
    timeframe: series.identity.timeframe,
    ...('chartContextV3' in series && series.chartContextV3?.session ? { session: series.chartContextV3.session } : {}),
    ...source,
    adjustment: series.identity.adjustment,
    inputFingerprint: series.inputFingerprint,
  }));
};

export const chartIndicatorFromResult = (
  result: MarketIndicatorResult,
  series: BarSeries,
  generatedAt: string,
): MarketChartIndicator => {
  const start = series.coverage.actualStart ?? series.points[0]?.timestamp ?? generatedAt;
  const end = series.coverage.actualEnd ?? series.points.at(-1)?.timestamp ?? generatedAt;
  const source = chartSourceMetadata(series);
  return {
    ...result,
    symbol: series.identity.symbol,
    timeframe: series.identity.timeframe,
    marketTime: end,
    calculatedAt: generatedAt,
    values: result.points.at(-1)?.values ?? {},
    provider: source.provider,
    points: result.points.map((point) => ({ ...point, inputFingerprint: result.inputFingerprint })),
    inputProvenance: {
      timeframe: series.identity.timeframe,
      provider: source.provider,
      upstreamSource: source.upstreamSource,
      providerRevision: source.providerRevision,
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
    servedFromCache: source.servedFromCache,
    engineVersion: 'dsa-indicator-v3',
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
  response: MarketDetailResponse,
): MarketChartPage | null => {
  const series = response.barSeries;
  if (!series) return null;
  return {
    bars: chartBarsFromSeries(series),
    indicators: response.requested
      .filter((capability) => capability.startsWith('indicator:'))
      .flatMap((capability) => {
        const data = response.sections[capability]?.data as MarketIndicatorResult | undefined;
        return data ? [chartIndicatorFromResult(data, series, response.generatedAt)] : [];
      }),
  };
};
