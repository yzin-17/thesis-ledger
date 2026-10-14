import type { MarketDetailRequest } from './market-detail.coordinator.js';
import { getDesktopApiClient } from '../../shared/api/client.js';

/** 派生只消费 Server 的独立窗口与能力合同，不先请求原生日线窗口。 */
export async function requestMarketPeriodDetail(request: MarketDetailRequest, signal: AbortSignal) {
  const { symbol, ...params } = request;
  return getDesktopApiClient().market.getDetail(symbol, { ...params, signal });
}
