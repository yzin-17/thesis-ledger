import { createHash } from 'node:crypto';
import {
  arenaPublicFees,
  DecimalValue,
  type ArenaPaperQuote,
  type MarketPeriodCalendarFact,
} from '@thesis-ledger/domain';
import type { MarketService } from './market.service.js';
import type { MarketPeriodCalendarReader } from './market-period-calendar-reader.js';
import type { MarketActionCoverage } from './market-action-coverage.js';
import type { LiveExecutionScope } from './market-live-execution-reader.js';
import { liveQuoteInCurrentSession } from './market-live-quote-session.js';

type Dependencies = {
  market: Pick<MarketService, 'getQuote' | 'getSession'>;
  calendars: Pick<MarketPeriodCalendarReader, 'read'>;
  actions: Pick<MarketActionCoverage, 'read'>;
};

/** 独立当前美股资料支持股票及 ETF；不消费历史身份接口或股票日状态合同。 */
export async function readUsLiveExecution(
  d: Dependencies,
  i: LiveExecutionScope,
  at: Date,
  day: string,
) {
  const missing = (reason: string) => ({ status: 'unavailable' as const, reason });
  if (i.currency !== 'USD') return missing('live_quote_currency_mismatch');
  const end = [
    ...i.expiresOn,
    new Date(Date.parse(day + 'T00:00:00Z') + 14 * 86400000).toISOString().slice(0, 10),
  ]
    .sort()
    .at(-1)!;
  const [quote, calendar, events] = await Promise.all([
    d.market.getQuote(i.symbol, { assetType: i.assetType, allowStale: false }),
    d.calendars.read({ market: 'US', start: day, end, evaluationAsOf: at.toISOString() }),
    i.previousDay
      ? d.actions.read({ ...i, previousDay: i.previousDay, now: at }, day)
      : Promise.resolve([]),
  ]);
  const observedAt = new Date(),
    now = observedAt.getTime(),
    facts = quote.executionFacts,
    rules = quote.executionRules;
  if (calendar.status !== 'ready') return missing(calendar.reason);
  if (!events) return missing('corporate_action_unverified');
  if (!qualifiedUsQuote(quote, i, now)) return missing('live_quote_unqualified');
  if (!qualifiedUsFacts(facts, i, quote.marketTime, now))
    return missing('live_tradability_unavailable');
  if (!qualifiedUsRules(rules, facts, i, day, now)) return missing('execution_rules_unavailable');
  const current = await d.market.getSession('US', observedAt);
  if (current.state !== 'open' || current.date !== day)
    return missing(current.reason ?? 'market_closed');
  if (!liveQuoteInCurrentSession(current, quote.marketTime, observedAt))
    return missing('live_quote_unqualified');
  const ends = usExecutionSessionEnds(calendar.calendar);
  const dates = [...ends.keys()].sort(),
    index = dates.indexOf(day);
  const positionAvailableOn = dates[index + rules.positionSettlementDays];
  const cashAvailableOn = dates[index + rules.sellCashSettlementDays];
  if (index < 0 || !positionAvailableOn || !cashAvailableOn) return missing('calendar_incomplete');
  const priceStep = (price: string) =>
    DecimalValue.from(price).compareTo('1') >= 0
      ? rules.priceIncrements.atOrAboveOne
      : rules.priceIncrements.belowOne;
  const evidence = { quote, facts, rules, calendar: calendar.calendar, events };
  const sourceRef = createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
  const fee = (amount: string, quantity = '1', price = amount) =>
    arenaPublicFees(
      [
        {
          code: 'section31',
          side: 'sell',
          basis: 'turnover',
          currency: 'USD',
          rate: rules.section31SellRate,
        },
        // 已核实暂停收费期不生成 charged TAF；正费率计算器仍保持严格正费率约束。
      ],
      'sell',
      'USD',
      quantity,
      price,
    );
  const blocked = facts.tradingState !== 'normal' || facts.securityStatus !== 'NORMAL';
  const observation = {
    symbol: i.symbol,
    price: String(quote.price),
    marketTime: new Date(quote.marketTime).toISOString(),
    observedAt: observedAt.toISOString(),
    tradingDate: day,
    positionAvailableOn,
    cashAvailableOn,
    lot: facts.sharesPerLot,
    tick: priceStep(String(quote.price)),
    priceStep,
    sourceRef,
    evidence,
    buyBlocked: blocked ? 'suspended' : null,
    sellBlocked: blocked ? 'suspended' : null,
    statutoryBuyFee: () => '0',
    statutorySellFee: fee,
  } satisfies ArenaPaperQuote;
  return { status: 'available' as const, ends, evidence, observation };
}

type LiveQuote = Awaited<ReturnType<MarketService['getQuote']>>;

function qualifiedUsQuote(
  quote: LiveQuote,
  i: LiveExecutionScope,
  now: number,
): quote is LiveQuote & { marketTime: string } {
  return !(
    quote.symbol !== i.symbol ||
    quote.provider !== 'futu' ||
    quote.upstreamSource !== 'futu' ||
    quote.stale ||
    quote.refreshFailure ||
    quote.freshness !== 'live' ||
    quote.units?.priceCurrency !== 'USD' ||
    !quote.marketTime ||
    !Number.isFinite(quote.price) ||
    quote.price <= 0 ||
    Date.parse(quote.marketTime) > now ||
    now - Date.parse(quote.marketTime) > i.maxQuoteAgeSeconds * 1000
  );
}

function qualifiedUsFacts(
  facts: LiveQuote['executionFacts'],
  i: LiveExecutionScope,
  marketTime: string,
  now: number,
): facts is NonNullable<LiveQuote['executionFacts']> & { sharesPerLot: string } {
  return !(
    !facts ||
    facts.symbol !== i.symbol ||
    facts.assetType !== i.assetType ||
    facts.market !== 'US' ||
    !facts.securityId ||
    !facts.exchange ||
    !facts.sharesPerLot ||
    facts.delisted !== false ||
    facts.marketTime === null ||
    Date.parse(facts.marketTime) !== Date.parse(marketTime) ||
    Date.parse(facts.observedAt) < Date.parse(marketTime) ||
    Date.parse(facts.observedAt) > now ||
    now - Date.parse(facts.observedAt) > i.maxQuoteAgeSeconds * 1000 ||
    facts.tradingState === 'unknown'
  );
}

function qualifiedUsRules(
  rules: LiveQuote['executionRules'],
  facts: NonNullable<LiveQuote['executionFacts']>,
  i: LiveExecutionScope,
  day: string,
  now: number,
): rules is NonNullable<LiveQuote['executionRules']> {
  return !(
    !rules ||
    rules.provider !== 'official-us-rules' ||
    rules.market !== 'US' ||
    rules.currency !== 'USD' ||
    !rules.assetTypes.includes(i.assetType) ||
    !rules.exchanges.some((exchange) => exchange === facts.exchange) ||
    rules.effectiveFrom > day ||
    rules.effectiveUntil < day ||
    rules.verifiedThrough !== day ||
    Date.parse(rules.reviewedAt) > now ||
    Date.parse(rules.observedAt) > now ||
    Date.parse(rules.observedAt) !== Date.parse(facts.observedAt) ||
    Date.parse(rules.reviewedAt) > Date.parse(rules.observedAt)
  );
}

function usExecutionSessionEnds(calendar: MarketPeriodCalendarFact) {
  const ends = new Map<string, string>();
  for (const session of calendar.sessions) {
    const previous = ends.get(session.tradingDate);
    if (!previous || Date.parse(previous) < Date.parse(session.endAt))
      ends.set(session.tradingDate, new Date(session.endAt).toISOString());
  }

  return ends;
}
