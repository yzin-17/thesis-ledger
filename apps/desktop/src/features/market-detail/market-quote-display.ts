import type { QuoteV1 } from '@thesis-ledger/schemas';
import { marketToneForValue, type MarketTone } from '@/ui/market-color';

type QuotePrice = Pick<QuoteV1, 'price' | 'previousClose'>;

export const quoteChangePercent = (quote: QuotePrice): number | null => {
  if (
    !Number.isFinite(quote.price) ||
    !Number.isFinite(quote.previousClose) ||
    quote.previousClose <= 0
  ) {
    return null;
  }
  return ((quote.price - quote.previousClose) / quote.previousClose) * 100;
};

export const formatQuoteChangePercent = (quote: QuotePrice) => {
  const changePercent = quoteChangePercent(quote);
  if (changePercent === null || !Number.isFinite(changePercent)) return '--';
  return `${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%`;
};

export const quoteChangeTone = (quote: QuotePrice): MarketTone | undefined => {
  if (quoteChangePercent(quote) === null) return undefined;
  return marketToneForValue(quote.price - quote.previousClose);
};
