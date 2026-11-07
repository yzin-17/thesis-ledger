import { formatMarketQuotePrice, formatRatioPercent } from '@thesis-ledger/domain';
import type { Quote } from '@thesis-ledger/schemas';
import { marketToneForValue, type MarketTone } from '@/ui/market-color';

type QuotePrice = Pick<Quote, 'price' | 'previousClose'>;

export const formatQuotePrice = (
  value: number,
  currency: NonNullable<Quote['units']>['priceCurrency'] | undefined,
): string => formatMarketQuotePrice(value, currency);

const quoteChangeRatio = (quote: QuotePrice): number | null => {
  if (
    !Number.isFinite(quote.price) ||
    !Number.isFinite(quote.previousClose) ||
    quote.previousClose <= 0
  ) {
    return null;
  }
  return (quote.price - quote.previousClose) / quote.previousClose;
};

export const quoteChangePercent = (quote: QuotePrice): number | null => {
  const ratio = quoteChangeRatio(quote);
  return ratio === null ? null : ratio * 100;
};

export const formatQuoteChangePercent = (quote: QuotePrice) => {
  const formatted = formatRatioPercent(quoteChangeRatio(quote), 'exceptZero');
  return formatted === '—' ? '--' : formatted;
};

export const quoteChangeTone = (quote: QuotePrice): MarketTone | undefined => {
  if (quoteChangePercent(quote) === null) return undefined;
  return marketToneForValue(quote.price - quote.previousClose);
};
