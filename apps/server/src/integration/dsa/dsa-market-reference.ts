import {
  correlateMarketReference,
  marketReferenceEndpoint,
  marketReferenceRequestSchema,
  type MarketReferenceRequest,
} from '@thesis-ledger/schemas';
import { DsaError, type DsaClient } from './dsa.client.js';
import { mapDataV3HttpError } from './dsa-v3-protocol.js';

export async function readMarketReference(
  dsa: Pick<DsaClient, 'post' | 'timeoutMs'>,
  input: MarketReferenceRequest,
  signal?: AbortSignal,
) {
  const request = marketReferenceRequestSchema.parse(input);
  request.requestBudgetMs = Math.min(request.requestBudgetMs, dsa.timeoutMs);
  const raw = await dsa.post<unknown>(
    marketReferenceEndpoint,
    request,
    1,
    (status, payload) => mapDataV3HttpError(status, payload, request.requestId),
    request.requestBudgetMs,
    signal,
  );
  try {
    return correlateMarketReference(request, raw, request.requestId);
  } catch {
    throw new DsaError('市场资料响应与查询合同不符', 'invalid-response');
  }
}
