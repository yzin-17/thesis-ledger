import { securityLotSizeRequestSchema, securityLotSizeResponseSchema } from '@thesis-ledger/schemas';
import { DsaError, type DsaClient } from './dsa.client.js';

/** 独立参考数据读取，不使用或更改价格路由。 */
export async function readSecurityLotSize(dsa: Pick<DsaClient, 'post'>, symbol: string) {
  const request = securityLotSizeRequestSchema.parse({
    contractVersion: 3, consumer: 'thesis-ledger', requestId: crypto.randomUUID(), symbol,
  });
  // 静态资料沿用 Data Token 的平面 detail 错误合同，不套用日线的嵌套 error 合同。
  const raw = await dsa.post<unknown>('/api/v3/thesis-ledger/market/security-lot-size', request, 1);
  const parsed = securityLotSizeResponseSchema.safeParse(raw);
  if (!parsed.success || parsed.data.symbol !== request.symbol || parsed.data.requestId !== request.requestId)
    throw new DsaError('每手股数响应未匹配当前请求', 'invalid-response');
  return parsed.data;
}
