import { chunk } from 'es-toolkit';
import {
  MARKET_QUOTE_BATCH_MAX_ITEMS,
  marketQuoteIdentitySchema,
  type MarketQuoteIdentity,
} from '@thesis-ledger/schemas';
import type { QuoteBatchResult } from '../market/market-quote-batch.js';
import type { PortfolioMarketReader } from './portfolio-position-valuation.js';

type Position = { symbol: string; quantity: unknown; asset?: { assetType?: string } | null };
type Market = PortfolioMarketReader & {
  getQuotes?: (items: readonly MarketQuoteIdentity[]) => Promise<QuoteBatchResult[]>;
};

/** 结果仅在一次估值中持有；基金及冲突身份继续由原有读取路径处理。 */
export function portfolioQuoteBatch(
  positions: readonly Position[],
  market: Market,
): PortfolioMarketReader {
  if (!market.getQuotes) return market;
  const bySymbol = new Map<string, MarketQuoteIdentity | null>();
  for (const position of positions) {
    if (
      Number(position.quantity) === 0 ||
      !['stock', 'etf'].includes(position.asset?.assetType ?? '')
    )
      continue;
    const parsed = marketQuoteIdentitySchema.safeParse({
      symbol: position.symbol,
      assetType: position.asset?.assetType?.toUpperCase(),
    });
    if (!parsed.success) continue;
    const previous = bySymbol.get(parsed.data.symbol);
    if (previous === null) continue;
    if (previous && previous.assetType !== parsed.data.assetType)
      bySymbol.set(parsed.data.symbol, null);
    else bySymbol.set(parsed.data.symbol, parsed.data);
  }
  const items = [...bySymbol.values()].filter((item): item is MarketQuoteIdentity => item !== null);
  if (!items.length) return market;
  const pending = (async () => {
    const outcomes = new Map<string, QuoteBatchResult['outcome']>();
    for (const group of chunk(items, MARKET_QUOTE_BATCH_MAX_ITEMS))
      for (const result of await market.getQuotes!(group))
        outcomes.set(result.identity.symbol, result.outcome);
    return outcomes;
  })();
  return {
    getQuote: async (symbol) => {
      if (!bySymbol.get(symbol.trim().toUpperCase())) return market.getQuote(symbol);
      const outcome = (await pending).get(symbol.trim().toUpperCase());
      if (!outcome) throw new Error('批量报价未返回请求证券');
      if (outcome.status === 'rejected') throw outcome.reason;
      return outcome.value;
    },
    ...(market.getFundNav ? { getFundNav: market.getFundNav.bind(market) } : {}),
    ...(market.getFundNavHistory
      ? { getFundNavHistory: market.getFundNavHistory.bind(market) }
      : {}),
  };
}
