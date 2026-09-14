import type { MarketDetailResponse } from '@thesis-ledger/api-client';
import { getDesktopApiClient } from '../../shared/api/client.js';
import {
  MarketDetailRequestCoordinator,
  type MarketDetailFetcher,
  type MarketDetailRequest,
} from './market-detail.coordinator.js';

export const marketDetailRequestCoordinator = new MarketDetailRequestCoordinator();

const fetchMarketDetail: MarketDetailFetcher = async (request, signal) => {
  const params = {
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
  return getDesktopApiClient().market.getDetail(request.symbol, params);
};

export const requestMarketDetail = (
  request: MarketDetailRequest,
  signal?: AbortSignal,
): Promise<MarketDetailResponse> =>
  marketDetailRequestCoordinator.request(request, fetchMarketDetail, signal);
