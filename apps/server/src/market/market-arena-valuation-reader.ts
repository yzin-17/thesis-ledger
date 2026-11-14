import { Inject, Injectable } from '@nestjs/common';
import type { ArenaLiveProtocol } from '@thesis-ledger/schemas';
import { MarketService } from './market.service.js';
import { MarketActionCoverage } from './market-action-coverage.js';
import { liveQuoteInCurrentSession } from './market-live-quote-session.js';

type ValuationInstrument = {
  symbol: string;
  assetType: 'STOCK' | 'ETF';
  acquiredOn: string;
  lastFillAt: string | null;
};
type ValuationQuote = Awaited<ReturnType<MarketService['getQuote']>>;
type ValuationSession = Awaited<ReturnType<MarketService['getSession']>>;

const quoteMatchesValuation = (
  q: ValuationQuote,
  i: ValuationInstrument,
  p: ArenaLiveProtocol,
  at: Date,
): q is ValuationQuote & { marketTime: string } =>
  !(
    q.symbol !== i.symbol ||
    q.price <= 0 ||
    q.stale ||
    q.refreshFailure ||
    !q.marketTime ||
    q.units?.priceCurrency !== p.currency ||
    Date.parse(q.marketTime) > at.getTime() ||
    Date.parse(q.fetchedAt) > at.getTime() ||
    (i.lastFillAt && Date.parse(q.marketTime) < Date.parse(i.lastFillAt))
  );
const quoteMatchesValuationSession = (
  q: ValuationQuote,
  session: ValuationSession,
  p: ArenaLiveProtocol,
  at: Date,
) => {
  const closed =
    session.state === 'closed' &&
    q.sessionContext?.session === 'closed_snapshot' &&
    q.sessionContext.latestTradingDate === session.latestTradingDate;
  const live =
    session.state === 'open' &&
    q.freshness === 'live' &&
    q.marketTime &&
    liveQuoteInCurrentSession(session, q.marketTime, at) &&
    at.getTime() - Date.parse(q.marketTime) <= p.resources.maxQuoteAgeSeconds * 1000;
  return { closed, live };
};

/** 估值沿用共享休市快照事实；不把休市价格认证为执行行情。 */
@Injectable()
export class MarketArenaValuationReader {
  constructor(
    @Inject(MarketService) private readonly market: Pick<MarketService, 'getSession' | 'getQuote'>,
    @Inject(MarketActionCoverage) private readonly actions: Pick<MarketActionCoverage, 'read'>,
  ) {}
  async read(p: ArenaLiveProtocol, instruments: readonly ValuationInstrument[]) {
    const initial = await this.market.getSession(p.market);
    if (initial.state === 'unknown' || !initial.date)
      return {
        failure: true as const,
        session: initial,
        reason: initial.reason ?? 'calendar_unavailable',
      };
    if (
      (p.startsOn && initial.date < p.startsOn) ||
      (p.endsOn && initial.latestTradingDate && initial.latestTradingDate > p.endsOn)
    )
      return null;
    const evidence: Record<string, unknown> = {},
      missing: Record<string, string> = {};
    const candidates = await Promise.all(
      instruments.map(async (i) => {
        try {
          const [q, events] = await Promise.all([
            this.market.getQuote(i.symbol, { assetType: i.assetType, allowStale: false }),
            this.actions.read(
              { ...i, market: p.market, previousDay: i.acquiredOn, now: new Date() },
              initial.latestTradingDate ?? initial.date!,
            ),
          ]);
          evidence[i.symbol] = { quote: q, events };
          if (!events) {
            missing[i.symbol] = 'corporate_action_unverified';
            return null;
          }
          return { i, q };
        } catch {
          missing[i.symbol] = 'valuation_source_unavailable';
          return null;
        }
      }),
    );
    const at = new Date(),
      session = await this.market.getSession(p.market, at);
    if (
      session.state === 'unknown' ||
      session.state !== initial.state ||
      session.date !== initial.date
    )
      return {
        failure: true as const,
        session,
        reason: session.reason ?? 'valuation_session_changed',
      };
    const prices = new Map<string, string>(),
      times: string[] = [];
    for (const result of candidates) {
      if (!result) continue;
      const { i, q } = result;
      const { closed, live } = quoteMatchesValuationSession(q, session, p, at);
      if (!quoteMatchesValuation(q, i, p, at) || (!closed && !live)) {
        missing[i.symbol] = 'valuation_quote_unqualified';
        continue;
      }
      prices.set(i.symbol, String(q.price));
      times.push(new Date(q.marketTime).toISOString());
    }
    return { at, session, prices, marketTime: times.sort()[0] ?? null, evidence, missing };
  }
}
