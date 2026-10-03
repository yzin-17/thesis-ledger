import {
  marketDataBarSeriesResponseV3Schema,
  marketDataBarSeriesRequestResponseV3Schema,
  marketDataMultiWindowResponseV3Schema,
  type MarketDataBarSeriesRequestV3,
} from '@thesis-ledger/schemas';
import { parseBarSeriesResponseV3 } from '../integration/dsa/dsa-v3-protocol.js';

/** 本地冻结证据离线校验；网络能力确认由在线读取路径负责。 */
export const parseMarketWindowEvidenceResponseV3 = (
  raw: unknown,
  request?: MarketDataBarSeriesRequestV3,
) => {
  const multiWindow = raw !== null && typeof raw === 'object' && 'windowObservations' in raw;
  const response = multiWindow
    ? marketDataMultiWindowResponseV3Schema.parse(raw)
    : marketDataBarSeriesResponseV3Schema.parse(raw);
  if (!multiWindow) {
    if (request) return marketDataBarSeriesRequestResponseV3Schema.parse({ request, response }).response;
    return response;
  }
  return parseBarSeriesResponseV3(response, request ?? {
    contractVersion: 3,
    requestId: response.requestId,
    symbol: response.symbol,
    routeKey: response.routeKey,
    start: response.coverage.requestedStart,
    end: response.coverage.requestedEnd,
    ...(response.historicalTradabilityWindows ? { tradabilityMode: 'assume-untradable-no-bar' as const } : {}),
  }, multiWindow ? 'market-multi-window-content-v1' : undefined);
};
