import type { MarketSession } from '@thesis-ledger/schemas';
import type { MarketService } from './market.service.js';
import type { LiveExecutionScope } from './market-live-execution-reader.js';

/** 行情必须属于此刻实际开放的同一个会话，午休、盘前及上一时段快照不参与执行。 */
export function liveQuoteInCurrentSession(
  session: Pick<MarketSession, 'state' | 'date' | 'sessions'>,
  marketTime: string,
  at: Date,
) {
  if (session.state !== 'open' || !session.date) return false;
  const time = Date.parse(marketTime),
    now = at.getTime();
  return (
    Number.isFinite(time) &&
    time <= now &&
    session.sessions.some(
      (s) =>
        s.tradingDate === session.date &&
        Date.parse(s.startAt) <= time &&
        time < Date.parse(s.endAt) &&
        Date.parse(s.startAt) <= now &&
        now < Date.parse(s.endAt),
    )
  );
}

type LiveQuote = Awaited<ReturnType<MarketService['getQuote']>>;
export function qualifiedLiveQuote(
  quote: LiveQuote,
  scope: LiveExecutionScope,
  observedAt: Date,
): quote is LiveQuote & { marketTime: string } {
  return liveQuoteDiagnostics(quote, scope, observedAt).length === 0;
}

export function liveQuoteDiagnostics(quote: LiveQuote, scope: LiveExecutionScope, at: Date) {
  const diagnostics: Array<{ field: string; status: 'unavailable'; reason: string }> = [];
  if (quote.symbol !== scope.symbol)
    diagnostics.push({ field: 'symbol', status: 'unavailable', reason: 'quote_identity_mismatch' });
  if (quote.units?.priceCurrency !== scope.currency)
    diagnostics.push({
      field: 'priceCurrency',
      status: 'unavailable',
      reason: 'currency_unverified',
    });
  if (!Number.isFinite(quote.price) || quote.price <= 0)
    diagnostics.push({ field: 'price', status: 'unavailable', reason: 'live_quote_unqualified' });
  if (quote.stale || quote.refreshFailure || quote.freshness !== 'live')
    diagnostics.push({
      field: 'freshness',
      status: 'unavailable',
      reason: 'live_quote_unqualified',
    });
  const time = Date.parse(quote.marketTime ?? '');
  const fetched = Date.parse(quote.fetchedAt);
  if (
    !Number.isFinite(time) ||
    !Number.isFinite(fetched) || fetched > at.getTime() ||
    time > at.getTime() ||
    at.getTime() - time > scope.maxQuoteAgeSeconds * 1000
  )
    diagnostics.push({
      field: 'marketTime',
      status: 'unavailable',
      reason: 'live_quote_unqualified',
    });
  return diagnostics;
}
