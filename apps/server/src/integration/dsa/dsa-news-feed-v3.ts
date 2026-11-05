import {
  correlateMarketNewsFeedV3,
  marketNewsFeedEndpointV3,
  marketNewsFeedRequestV3Schema,
  type MarketNewsFeedRequestV3,
  type MarketNewsFeedResponseV3,
} from '@thesis-ledger/schemas';
import type { DsaClient } from './dsa.client.js';
import { DsaError, parseV3Response } from './dsa-client-errors.js';
import { DsaV3ProtocolError } from './dsa-v3-protocol.js';
import { verifyNewsEvidenceIdentity } from './dsa-news-v3.js';

export function parseNewsFeedV3(raw: unknown, request: MarketNewsFeedRequestV3) {
  try {
    const response = correlateMarketNewsFeedV3(request, raw);
    verifyNewsEvidenceIdentity(response.items);
    return response;
  } catch {
    throw new DsaV3ProtocolError('DSA 快讯响应未通过 news-feed-v1 关联合同', 'invalid-response');
  }
}

export class DsaNewsFeedError extends DsaError {
  constructor(
    readonly response: MarketNewsFeedResponseV3,
    status: number,
  ) {
    super('DSA 市场快讯不可用', 'unavailable', status, response.errors[0]?.code);
  }
}

export async function readDsaNewsFeedV3(
  client: Pick<DsaClient, 'post' | 'timeoutMs'>,
  input: MarketNewsFeedRequestV3,
  signal?: AbortSignal,
) {
  const request = marketNewsFeedRequestV3Schema.parse(input);
  request.requestBudgetMs = Math.min(request.requestBudgetMs, client.timeoutMs);
  const raw = await client.post<unknown>(
    marketNewsFeedEndpointV3,
    request,
    1,
    (status, body) => {
      try {
        const response = parseNewsFeedV3(body, request);
        if (response.status === 'unavailable') return new DsaNewsFeedError(response, status);
      } catch {
        /* 保留协议错误，不能把无效数据投影成可用结果。 */
      }
      if (status === 401 || status === 403)
        return new DsaV3ProtocolError('DSA 快讯接口鉴权失败', 'unauthorized', status);
      if (status === 404 || status === 405)
        return new DsaV3ProtocolError('DSA 暂不支持市场快讯', 'unsupported-capability', status);
      return new DsaV3ProtocolError('DSA 快讯错误响应无效', 'invalid-response', status);
    },
    request.requestBudgetMs,
    signal,
  );
  return parseV3Response(() => parseNewsFeedV3(raw, request));
}
