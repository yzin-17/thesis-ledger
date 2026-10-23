import {
  securityStaticSymbolSchema, securityStaticAssetTypeSchema, securityStaticInfoResponseSchema, quoteSchema,
  type SecurityStaticAssetType,
} from '@thesis-ledger/schemas';
import { getDesktopApiClient } from '../../shared/api/client.js';

export async function fetchSecurityStaticInfo(symbol: string, assetType: SecurityStaticAssetType, signal?: AbortSignal) {
  const canonical = securityStaticSymbolSchema.parse(symbol);
  const type = securityStaticAssetTypeSchema.parse(assetType);
  const raw = await getDesktopApiClient().request<unknown>(
    `/api/market-data/security-static-info?symbol=${encodeURIComponent(canonical)}&assetType=${type}`,
    signal ? { signal } : {},
  );
  const value = securityStaticInfoResponseSchema.parse(raw);
  if (value.symbol !== canonical || value.assetType !== type)
    throw new Error('证券资料响应与当前查询不匹配');
  return value;
}

export async function fetchSecurityStaticQuote(symbol: string, assetType: SecurityStaticAssetType, signal?: AbortSignal) {
  const canonical = securityStaticSymbolSchema.parse(symbol);
  const type = securityStaticAssetTypeSchema.parse(assetType);
  const raw = await getDesktopApiClient().request<unknown>(
    `/api/market/${encodeURIComponent(canonical)}/quote?assetType=${type}`,
    signal ? { signal } : {},
  );
  const quote = quoteSchema.parse(raw);
  if (quote.symbol !== canonical) throw new Error('报价响应与当前证券不匹配');
  return quote;
}
