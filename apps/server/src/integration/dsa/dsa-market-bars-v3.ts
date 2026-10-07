import {
  marketDataBarSeriesRequestV3Schema,
  type MarketDataBarSeriesRequestV3,
  type MarketDataContractCapabilitiesV3,
} from '@thesis-ledger/schemas';
import { parseBarSeriesResponseV3, parseDataCapabilitiesV3 } from './dsa-v3-protocol.js';

/** 能力读取只发生在收到多窗响应时；解析仍由客户端统一映射错误。 */
export const readBarSeriesV3 = async (
  input: MarketDataBarSeriesRequestV3,
  read: (request: MarketDataBarSeriesRequestV3) => Promise<unknown>,
  readCapabilities: () => Promise<MarketDataContractCapabilitiesV3>,
) => {
  const request = marketDataBarSeriesRequestV3Schema.parse(input);
  const raw = await read(request);
  let protocol: string | undefined;
  if (raw !== null && typeof raw === 'object' && 'windowObservations' in raw) {
    const capabilities = await readCapabilities();
    return () => {
      const parsed = parseDataCapabilitiesV3(capabilities);
      if (parsed.dataContractVersions.includes(3)) protocol = parsed.multiWindowProtocols?.[0];
      return parseBarSeriesResponseV3(raw, request, protocol);
    };
  }
  return () => parseBarSeriesResponseV3(raw, request);
};
