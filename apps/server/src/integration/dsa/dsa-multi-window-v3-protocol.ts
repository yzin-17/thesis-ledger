import { createHash } from 'node:crypto';
import {
  canonicalMarketMultiWindowEncodingV3,
  marketDataBarSeriesRequestResponseV3Schema,
  marketDataBarSeriesResponseV3Schema,
  marketDataMultiWindowResponseV3Schema,
  type MarketDataBarSeriesRequestV3,
} from '@thesis-ledger/schemas';

export const parseMultiWindowResponseV3 = (
  raw: unknown,
  request: MarketDataBarSeriesRequestV3,
  protocol: string | undefined,
) => {
  if (protocol !== 'market-multi-window-content-v1') {
    throw new Error('DSA 多窗口协议能力未确认');
  }
  const response = marketDataMultiWindowResponseV3Schema.parse(raw);
  const singleWindowProjection = marketDataBarSeriesResponseV3Schema.strip().parse(response);
  marketDataBarSeriesRequestResponseV3Schema.parse({ request, response: singleWindowProjection });
  if (response.coverage.requestedStart !== request.start || response.coverage.requestedEnd !== request.end) {
    throw new Error('DSA 多窗口覆盖与请求不匹配');
  }
  const hash = createHash('sha256').update(canonicalMarketMultiWindowEncodingV3(response)).digest('hex');
  if (
    response.inputFingerprint !== hash ||
    response.sourcePriceBasis.revision.origin !== 'local-observation' ||
    response.sourcePriceBasis.revision.contentHash !== hash
  ) throw new Error('DSA 多窗口内容指纹不匹配');
  return response;
};
