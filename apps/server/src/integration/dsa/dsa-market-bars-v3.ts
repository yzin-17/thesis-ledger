import {
  marketDataBarSeriesRequestV3Schema,
  type MarketDataBarSeriesRequestV3,
  type MarketDataContractCapabilitiesV3,
} from '@thesis-ledger/schemas';
import { parseBarSeriesResponseV3, parseDataCapabilitiesV3, DsaV3ProtocolError } from './dsa-v3-protocol.js';

/** 能力读取只发生在收到多窗响应时；解析仍由客户端统一映射错误。 */
export const readBarSeriesV3 = async (
  input: MarketDataBarSeriesRequestV3,
  read: (request: MarketDataBarSeriesRequestV3) => Promise<unknown>,
  readCapabilities: () => Promise<MarketDataContractCapabilitiesV3>,
) => {
  const request = marketDataBarSeriesRequestV3Schema.parse(input);
  let capabilities = request.dailyObservationVersion === 2 ? await readCapabilities() : undefined;
  if (request.dailyObservationVersion === 2 && !parseDataCapabilitiesV3(capabilities).dailyObservationVersions?.includes(2))
    throw new DsaV3ProtocolError('DSA未声明支持日级观察版本2', 'unsupported-capability');
  const raw = await read(request);
  let protocol: string | undefined;
  if (raw !== null && typeof raw === 'object' && 'windowObservations' in raw) {
    capabilities ??= await readCapabilities();
    return () => {
      const parsed = parseDataCapabilitiesV3(capabilities);
      if (parsed.dataContractVersions.includes(3)) protocol = parsed.multiWindowProtocols?.[0];
      return parseBarSeriesResponseV3(raw, request, protocol);
    };
  }
  return () => parseBarSeriesResponseV3(raw, request);
};
