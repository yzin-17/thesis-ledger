import type { MarketCacheContextRequestV3 } from '@thesis-ledger/schemas';

export const quoteControlGeneration = 'a'.repeat(64);
export const quoteControlCacheKey = (symbol: string) => `quote:4:${symbol}:inferred:${quoteControlGeneration}`;
export async function quoteControlFixture(request: MarketCacheContextRequestV3) {
  return { contractVersion: 3 as const, consumer: 'thesis-ledger' as const,
    requestId: request.requestId, symbol: request.symbol, capability: request.capability,
    routeKey: { kind: 'data' as const, market: request.symbol.endsWith('.US') ? 'US' as const : 'CN' as const,
      assetType: request.capability.startsWith('FUND_') ? 'MUTUAL_FUND' as const :
        ('assetType' in request && request.assetType ? request.assetType : 'STOCK' as const),
      capability: request.capability },
    generation: quoteControlGeneration, policyRevision: 1, ready: true, reason: null };
}
