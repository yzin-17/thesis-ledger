import {
  barSeriesIdentitySchema,
  barSeriesSchema,
  indicatorCalculateResponseSchema,
  marketDetailRequestSchema,
  marketDetailResponseSchema,
  marketDisplayDetailResponseSchema,
  marketPeriodOptionsSchema,
  marketPeriodBarSeriesSchema,
  marketTimeframeSchema,
  type BarSeriesIdentity,
  type MarketDetailRequest,
  type MarketDetailResponse,
  type MarketDisplayDetailResponse,
  type MarketTimeframe,
} from '@thesis-ledger/schemas';

type Schema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };
type Request = <T>(path: string, schema: Schema<T>, init?: RequestInit) => Promise<T>;
type Suffix = (
  params: Record<string, string | number | boolean | readonly string[] | undefined>,
) => string;
export type MarketDetailQuery = Omit<MarketDetailRequest, 'symbol'> & { signal?: AbortSignal };
export type MarketPeriodOptionsQuery = Pick<
  MarketDetailQuery,
  'adjustment' | 'start' | 'end' | 'barsLimit' | 'indicatorParams' | 'signal'
>;
type DetailResult<T extends MarketTimeframe | undefined> = T extends '1m' | '1d' | undefined
  ? MarketDetailResponse
  : MarketDisplayDetailResponse;
export type MarketChartQuery = {
  assetType: BarSeriesIdentity['assetType'];
  timeframe?: MarketTimeframe;
  adjustment?: BarSeriesIdentity['adjustment'];
  start?: string;
  end?: string;
  limit?: number;
  refresh?: boolean;
  signal?: AbortSignal;
};
const displayIdentitySchema = barSeriesIdentitySchema.extend({ timeframe: marketTimeframeSchema });
const displaySeriesSchema = barSeriesSchema.or(marketPeriodBarSeriesSchema);

function chartQuery(symbol: string, params: MarketChartQuery) {
  const identity = displayIdentitySchema.parse({
    symbol,
    assetType: params.assetType,
    timeframe: params.timeframe ?? '1d',
    adjustment: params.adjustment ?? 'qfq',
  });
  return {
    assetType: identity.assetType,
    timeframe: params.timeframe,
    adjustment: params.adjustment,
    start: params.start,
    end: params.end,
    limit: params.limit,
    ...(params.refresh ? { refresh: 1 } : {}),
  };
}

export function marketDisplayClient(get: Request, suffix: Suffix) {
  return {
    getDetail: <T extends MarketTimeframe | undefined = undefined>(
      symbol: string,
      params: Omit<MarketDetailQuery, 'timeframe'> & { timeframe?: T } = {},
    ) => {
      marketDetailRequestSchema.parse({ ...params, symbol, chartContractVersion: 3 });
      const { signal, refresh, include, indicatorParams, adjustment, ...query } = params;
      const timeframe = params.timeframe ?? '1d';
      const responseSchema =
        timeframe === '1m' || timeframe === '1d'
          ? marketDetailResponseSchema
          : marketDisplayDetailResponseSchema;
      return get<DetailResult<T>>(
        `/api/market/${encodeURIComponent(symbol)}/detail${suffix({
          ...query,
          chartContractVersion: 3,
          ...(adjustment === undefined ? {} : { adjustment }),
          ...(indicatorParams ? { indicatorParams: JSON.stringify(indicatorParams) } : {}),
          ...(refresh ? { refresh: 1 } : {}),
          ...(include ? { include } : {}),
        })}`,
        responseSchema.refine((response) => {
          const section = response.sections.bars;
          const bars =
            section?.capability === 'bars' &&
            (section.status === 'ready' || section.status === 'stale')
              ? section.data
              : undefined;
          return (
            response.symbol === symbol &&
            (!response.barSeries ||
              (response.barSeries.identity.timeframe === timeframe &&
                response.barSeries.identity.symbol === symbol &&
                response.barSeries.identity.adjustment === (adjustment ?? 'qfq'))) &&
            (!bars ||
              (bars.identity.timeframe === timeframe &&
                bars.identity.adjustment === (adjustment ?? 'qfq')))
          );
        }) as Schema<DetailResult<T>>,
        signal ? { signal } : undefined,
      );
    },
    getPeriodOptions: (symbol: string, params: MarketPeriodOptionsQuery = {}) => {
      marketDetailRequestSchema.parse({ ...params, symbol });
      const { signal, indicatorParams, ...query } = params;
      return get(
        `/api/market/${encodeURIComponent(symbol)}/period-options${suffix({
          ...query,
          ...(indicatorParams ? { indicatorParams: JSON.stringify(indicatorParams) } : {}),
        })}`,
        marketPeriodOptionsSchema.refine(
          (response) =>
            response.symbol === symbol && response.adjustment === (params.adjustment ?? 'qfq'),
        ),
        signal ? { signal } : undefined,
      );
    },
    getBars: (symbol: string, params: MarketChartQuery) =>
      get(
        '/api/market/' + encodeURIComponent(symbol) + '/bars' + suffix(chartQuery(symbol, params)),
        displaySeriesSchema.refine(
          (series) =>
            series.identity.symbol === symbol &&
            series.identity.timeframe === (params.timeframe ?? '1d') &&
            series.identity.assetType === params.assetType &&
            series.identity.adjustment === (params.adjustment ?? 'qfq'),
        ),
        params.signal ? { signal: params.signal } : undefined,
      ),
    getIndicator: (
      symbol: string,
      name: 'MA' | 'MACD' | 'RSI',
      params: MarketChartQuery & { parameters?: Record<string, number> },
    ) =>
      get(
        '/api/market/' +
          encodeURIComponent(symbol) +
          '/indicators/' +
          name +
          suffix({
            ...chartQuery(symbol, params),
            ...(params.parameters ? { parameters: JSON.stringify(params.parameters) } : {}),
          }),
        indicatorCalculateResponseSchema,
        params.signal ? { signal: params.signal } : undefined,
      ),
  };
}
