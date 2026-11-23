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
    ...(response.historicalTradabilityWindows?.[0]?.contractVersion === 2 ? { dailyObservationVersion: 2 as const } : {}),
    ...(response.historicalTradabilityWindows ? { tradabilityMode: response.routeKey.timeframe === '1d'
      ? 'assume-untradable-no-bar' as const : 'observed-bars-only' as const } : {}),
  }, multiWindow ? 'market-multi-window-content-v1' : undefined);
};

/** 布尔门禁与抛错入口复用同一完整证据合同，不能降为单窗校验。 */
export function safeParseMarketWindowEvidenceResponseV3(raw: unknown, request?: MarketDataBarSeriesRequestV3) {
  try {
    return { success: true, data: parseMarketWindowEvidenceResponseV3(raw, request) } as const;
  } catch {
    return { success: false } as const;
  }
}
