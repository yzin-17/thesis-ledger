import type { MarketCacheContextRequestV3 } from '@thesis-ledger/schemas';

export const quoteControlGeneration = 'a'.repeat(64);
export const quoteControlCacheKey = (symbol: string) =>
  `quote:4:${symbol}:inferred:${quoteControlGeneration}`;
export async function quoteControlFixture(request: MarketCacheContextRequestV3) {
  return {
    contractVersion: 1 as const,
    consumer: 'thesis-ledger' as const,
    requestId: request.requestId,
    symbol: request.symbol,
    capability: request.capability,
    routeKey: {
      kind: 'data' as const,
      market: request.symbol.endsWith('.US') ? ('US' as const) : ('CN' as const),
      assetType: quoteControlAssetType(request),
      capability: request.capability,
    },
    generation: quoteControlGeneration,
    policyRevision: 1,
    ready: true,
    reason: null,
  };
}

function quoteControlAssetType(request: MarketCacheContextRequestV3) {
  if (request.capability.startsWith('FUND_')) return 'MUTUAL_FUND' as const;
  if ('assetType' in request && request.assetType) return request.assetType;
  return 'STOCK' as const;
}
