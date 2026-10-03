import type { MarketDetailResponse, MarketDetailCapability } from '@thesis-ledger/api-client';
import { getDesktopApiClient } from '../../shared/api/client.js';
import {
  MarketDetailRequestCoordinator,
  type MarketDetailFetcher,
  type MarketDetailRequest,
} from './market-detail.coordinator.js';

export const marketDetailRequestCoordinator = new MarketDetailRequestCoordinator();

const fetchMarketDetail: MarketDetailFetcher = async (request, signal) => {
  const client = getDesktopApiClient();
  const chartCapabilities: MarketDetailCapability[] = [
    'bars',
    'indicator:MA',
    'indicator:MACD',
    'indicator:RSI',
  ];
  const readsChart =
    !request.include || request.include.some((capability) => chartCapabilities.includes(capability));
  const planned = readsChart
    ? await client.market.getPlannedChartOptions(
        request.symbol,
        {
          barsLimit: request.barsLimit ?? 90,
          indicatorParams: { ...request.indicatorParams },
          ...(request.end ? { end: request.end } : {}),
        },
        signal,
      )
    : undefined;
  if (signal.aborted) throw new DOMException('行情请求已取消', 'AbortError');
  if (
    planned &&
    (planned.mode !== 'v3' ||
      !planned.window ||
      !planned.options.find((option) => option.adjustment === (request.adjustment ?? 'qfq'))
        ?.available)
  ) {
    throw new Error('当前图表窗口的价格口径不可用，请检查来源配置');
  }
  const params = {
    ...(request.adjustment !== undefined ? { adjustment: request.adjustment } : {}),
    chartContractVersion: 3 as const,
    ...(request.include ? { include: request.include } : {}),
    ...(request.barsLimit !== undefined ? { barsLimit: request.barsLimit } : {}),
    ...(request.navLimit !== undefined ? { navLimit: request.navLimit } : {}),
    ...(request.start !== undefined ? { start: request.start } : {}),
    ...(request.end !== undefined ? { end: request.end } : {}),
    ...(request.indicatorParams ? { indicatorParams: request.indicatorParams } : {}),
    ...(request.calculationAnchor !== undefined
      ? { calculationAnchor: request.calculationAnchor }
      : {}),
    ...(request.refresh !== undefined ? { refresh: request.refresh } : {}),
    signal,
  };
  const result = await client.market.getDetail(request.symbol, {
    ...params,
    ...(planned?.window
      ? {
          end: planned.window.end,
          ...(request.include
            ? { include: [...new Set([...request.include, ...chartCapabilities])] }
            : {}),
        }
      : {}),
  });
  if (
    planned?.window &&
    result.barSeries &&
    (result.barSeries.chartContextV3?.requestedStart !== planned.window.start ||
      result.barSeries.chartContextV3?.requestedEnd !== planned.window.end)
  ) {
    throw new Error('图表获取窗口与已校验计划不一致');
  }
  return result;
};

export const requestMarketDetail = (
  request: MarketDetailRequest,
  signal?: AbortSignal,
): Promise<MarketDetailResponse> =>
  marketDetailRequestCoordinator.request(request, fetchMarketDetail, signal);
