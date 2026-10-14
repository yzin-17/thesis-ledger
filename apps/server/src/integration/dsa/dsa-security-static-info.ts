import {
  securityStaticInfoRequestSchema, securityStaticInfoResponseSchema, type SecurityStaticAssetType,
} from '@thesis-ledger/schemas';
import { DsaError, type DsaClient } from './dsa.client.js';

export async function readSecurityStaticInfo(
  dsa: Pick<DsaClient, 'post'>, symbol: string, assetType: SecurityStaticAssetType,
) {
  const request = securityStaticInfoRequestSchema.parse({
    contractVersion: 3, consumer: 'thesis-ledger', requestId: crypto.randomUUID(), symbol, assetType,
  });
  const raw = await dsa.post<unknown>('/api/v3/thesis-ledger/market/security-static-info', request, 1);
  const parsed = securityStaticInfoResponseSchema.safeParse(raw);
  if (!parsed.success || parsed.data.symbol !== request.symbol ||
      parsed.data.assetType !== request.assetType || parsed.data.requestId !== request.requestId)
    throw new DsaError('证券资料响应未匹配当前请求', 'invalid-response');
  return parsed.data;
}
