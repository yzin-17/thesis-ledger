import type { Quote } from '@thesis-ledger/schemas';
import { marketToneForValue, type MarketTone } from '@/ui/market-color';

type QuotePrice = Pick<Quote, 'price' | 'previousClose'>;

export const formatQuotePrice = (
  value: number,
  currency: NonNullable<Quote['units']>['priceCurrency'] | undefined,
): string => {
  const precision = { minimumFractionDigits: 2, maximumFractionDigits: 20 };
  if (currency) {
    return new Intl.NumberFormat('zh-CN', {
      ...precision,
      style: 'currency',
      currency,
    }).format(value);
  }
  return `${new Intl.NumberFormat('zh-CN', precision).format(value)}（币种未知）`;
};

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
