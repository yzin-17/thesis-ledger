import type { Quote } from '@thesis-ledger/schemas';
import { quoteFreshnessExplanation, quoteFreshnessLabel, quoteTimeLines } from '@thesis-ledger/domain';
import { Copy, Section } from '../../components/MobilePrimitives';

export function MarketCurrentQuote({ quote }: { quote: Quote }) {
  const explanation = quoteFreshnessExplanation(quote);
  const lines = explanation ? explanation.split('\n') : quoteTimeLines(quote);
  return (
    <Section title="当前报价">
      <Copy>{quote.price} {quote.units?.priceCurrency ?? '币种未提供'} · {quoteFreshnessLabel(quote)}</Copy>
      {lines.map((line) => <Copy key={line} muted>{line}</Copy>)}
      <Copy>开盘 {quote.open} · 最高 {quote.high} · 最低 {quote.low} · 前收 {quote.previousClose}</Copy>
      <Copy muted>来源 {quote.provider}</Copy>
    </Section>
  );
}
