import {
  marketTradingStatusResponseV3Schema,
  marketTradingStatusRequestV3Schema,
  type MarketTradingStatusRequestV3,
} from '@thesis-ledger/schemas';
import { DsaV3ProtocolError } from './dsa-v3-protocol.js';

export const parseTradingStatusResponseV3 = (
  raw: unknown,
  request: MarketTradingStatusRequestV3,
) => {
  const parsed = marketTradingStatusResponseV3Schema.safeParse(raw);
  if (!parsed.success) throw new DsaV3ProtocolError('DSA 停复牌响应无效', 'invalid-response');
  const response = parsed.data;
  const bound = marketTradingStatusRequestV3Schema.parse({
    contractVersion: response.contractVersion,
    consumer: response.consumer,
    requestId: response.requestId,
    routeKey: response.routeKey,
    routeTarget: response.routeTarget,
    symbol: response.symbol,
    range: response.range,
  });
  if (
    JSON.stringify(bound) !== JSON.stringify(request) ||
    response.provenance.providerId !== request.routeTarget.providerId ||
    response.provenance.upstreamSource !== request.routeTarget.upstreamSource
  ) {
    throw new DsaV3ProtocolError('DSA 停复牌响应与固定请求不一致', 'invalid-response');
  }
  return response;
};
