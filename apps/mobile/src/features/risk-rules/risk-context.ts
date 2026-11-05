import type { PortfolioValuationResponse } from '@thesis-ledger/api-client';
export function mobileRiskContexts(portfolio: PortfolioValuationResponse) {
  const totals = new Map<string, number>();
  for (const row of portfolio.positions)
    if (row.marketValue !== null && row.quantity > 0)
      totals.set(row.accountId, (totals.get(row.accountId) ?? 0) + row.marketValue);
  return portfolio.positions.map((row) => ({
    symbol: row.symbol,
    accountId: row.accountId,
    positionId: row.id,
    mode: portfolio.mode,
    costPrice: row.costPrice,
    quantity: row.quantity,
    ...(row.marketValue !== null && row.quantity > 0
      ? { price: row.marketValue / row.quantity }
      : {}),
    ...(row.updatedAt ? { positionUpdatedAt: row.updatedAt } : {}),
    ...(row.marketValue !== null && portfolio.totalMarketValue > 0
      ? { weight: row.marketValue / portfolio.totalMarketValue }
      : {}),
    ...(row.marketValue !== null && (totals.get(row.accountId) ?? 0) > 0
      ? { accountWeight: row.marketValue / totals.get(row.accountId)! }
      : {}),
    marketTime: portfolio.valuedAt,
    dataQuality: {
      portfolio: portfolio.partial ? 'partial' : 'fresh',
      ...(row.stale ? { marketData: 'stale' } : {}),
    },
  }));
}
