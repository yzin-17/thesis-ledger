import { securityLotSizeResponseSchema, securityLotSymbolSchema } from '@thesis-ledger/schemas';
import { getDesktopApiClient } from '../../shared/api/client.js';

export async function fetchSecurityLotSize(symbol: string, signal?: AbortSignal) {
  const canonical = securityLotSymbolSchema.parse(symbol);
  const raw = await getDesktopApiClient().request<unknown>(
    `/api/market-data/security-lot-size?symbol=${encodeURIComponent(canonical)}`, signal ? { signal } : {},
  );
  const value = securityLotSizeResponseSchema.parse(raw);
  if (value.symbol !== canonical) throw new Error('每手股数响应标的与当前模型不匹配');
  return value;
}
