import type { MarketDisplayDetailResponse as MarketDetailResponse } from '@thesis-ledger/api-client';
import { requestPlannedMarketDetail } from '@thesis-ledger/api-client';
import { getDesktopApiClient } from '../../shared/api/client.js';
import {
  MarketDetailRequestCoordinator,
  type MarketDetailRequest,
} from './market-detail.coordinator.js';
export const marketDetailRequestCoordinator = new MarketDetailRequestCoordinator();
export const requestMarketDetail = (
  request: MarketDetailRequest,
  signal?: AbortSignal,
): Promise<MarketDetailResponse> =>
  marketDetailRequestCoordinator.request(
    request,
    (input, cancellation) =>
      requestPlannedMarketDetail(getDesktopApiClient().market, input, cancellation),
    signal,
  );
