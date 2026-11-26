import {
  marketCalculationAnchor,
  marketDetailContractVersion,
  marketDetailRequestSchema,
} from '@thesis-ledger/schemas';
import type {
  MarketDetailRequest,
  MarketDetailCapability,
  MarketDisplayDetailResponse,
  MarketChartOptionsV3,
} from '@thesis-ledger/schemas';
import type { marketDisplayClient } from './market-display-client.js';
import type { marketChartOptionsClient } from './market-chart-options-client.js';
type Market = ReturnType<typeof marketDisplayClient> & ReturnType<typeof marketChartOptionsClient>;
export class MarketChartUnavailableError extends Error {
  constructor(public readonly plan: MarketChartOptionsV3) {
    super('当前图表窗口的价格口径不可用，请检查来源配置');
  }
}
const capabilities: MarketDetailCapability[] = [
    'bars',
    'indicator:MA',
    'indicator:MACD',
    'indicator:RSI',
  ];

async function readChartPlan(market: Market, request: MarketDetailRequest, plannedEnd: string | undefined, signal?: AbortSignal): Promise<MarketChartOptionsV3 | undefined> {
  const readsChart =
    !request.include || request.include.some((name) => capabilities.includes(name));
  const planned = readsChart
    ? await market.getPlannedChartOptions(
        request.symbol,
        {
          barsLimit: request.barsLimit ?? 90,
          indicatorParams: { ...request.indicatorParams },
          ...(plannedEnd ? { end: plannedEnd } : {}),
          ...(request.timeframe === '1m' ? { timeframe: request.timeframe } : {}),
        },
        signal,
      )
    : undefined;
  if (signal?.aborted) {
    const error = new Error('行情请求已取消');
    error.name = 'AbortError';
    throw error;
  }
  const adjustment = request.adjustment ?? (request.timeframe === '1m' ? 'none' : 'qfq');
  if (
    planned &&
    (planned.mode !== 'v3' ||
      !planned.window ||
      !planned.options.find((option) => option.adjustment === adjustment)?.available)
  )
    throw new MarketChartUnavailableError(planned);
  return planned;
}

function validatePlannedDetailWindow(planned: MarketChartOptionsV3 | undefined, result: MarketDisplayDetailResponse): void {
  if (
    planned?.window &&
    result.barSeries &&
    ('derivation' in result.barSeries ||
      result.barSeries.chartContextV3?.requestedStart !== planned.window.start ||
      result.barSeries.chartContextV3?.requestedEnd !== planned.window.end)
  )
    throw new Error('图表获取窗口与已校验计划不一致');
}

export async function readPlannedMarketDetail(
  market: Market,
  request: MarketDetailRequest,
  signal?: AbortSignal,
): Promise<{ detail: MarketDisplayDetailResponse; plan?: MarketChartOptionsV3 }> {
  marketDetailRequestSchema.parse(request);
  const anchor = marketCalculationAnchor(request);
  const plannedEnd = anchor?.end ?? request.end;
  const { symbol, ...params } = request;
  if (request.timeframe && request.timeframe !== '1d' && request.timeframe !== '1m')
    return { detail: await market.getDetail(symbol, { ...params, ...(anchor ? { end: anchor.end } : {}), ...(signal ? { signal } : {}) }) };
  const planned = await readChartPlan(market, request, plannedEnd, signal);
  const result = await market.getDetail(symbol, {
    ...params,
    chartContractVersion: marketDetailContractVersion,
    ...(signal ? { signal } : {}),
    ...(planned?.window
      ? {
          end: planned.window.end,
          ...(request.include
            ? { include: [...new Set([...request.include, ...capabilities])] }
            : {}),
        }
      : {}),
  });
  validatePlannedDetailWindow(planned, result);
  return { detail: result, ...(planned ? { plan: planned } : {}) };
}
export const requestPlannedMarketDetail = (
  market: Market,
  request: MarketDetailRequest,
  signal?: AbortSignal,
) => readPlannedMarketDetail(market, request, signal).then((result) => result.detail);
