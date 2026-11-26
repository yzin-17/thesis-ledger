import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DecimalValue, type MarketPeriodCalendarFact } from '@thesis-ledger/domain';
import {
  dailyPriceRuleResultV1Schema,
  dailyTradingStatusResultV1Schema,
  statusCompositionDemandV1Schema,
} from '@thesis-ledger/schemas';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import { MarketService } from './market.service.js';
import { MarketPeriodCalendarReader } from './market-period-calendar-reader.js';
import { MarketLifecycleReaderV3 } from './market-lifecycle-reader-v3.js';
import { MarketActionCoverage } from './market-action-coverage.js';
import { liveQuoteInCurrentSession } from './market-live-quote-session.js';
import { readUsLiveExecution } from './market-us-live-execution.js';

export interface LiveExecutionScope {
  symbol: string;
  assetType: 'STOCK' | 'ETF';
  market: 'CN' | 'HK' | 'US';
  currency: 'CNY' | 'HKD' | 'USD';
  maxQuoteAgeSeconds: number;
  expiresOn: string[];
  previousDay?: string;
}
const D = (value: string) => DecimalValue.from(value);
export function executionSessionEnds(calendar: MarketPeriodCalendarFact) {
  const ends = new Map<string, string>();
  for (const s of calendar.sessions) {
    const previous = ends.get(s.tradingDate);
    if (!previous || Date.parse(previous) < Date.parse(s.endAt))
      ends.set(s.tradingDate, new Date(s.endAt).toISOString());
  }
  return ends;
}

/** 当前执行证据与回测规则分别核验；报价刷新时间不能替代来源行情时间。 */
@Injectable()
export class MarketLiveExecutionReader {
  constructor(
    @Inject(MarketService) private readonly market: Pick<MarketService, 'getSession' | 'getQuote'>,
    @Inject(MarketPeriodCalendarReader)
    private readonly calendars: Pick<MarketPeriodCalendarReader, 'read'>,
    @Inject(MarketLifecycleReaderV3)
    private readonly status: Pick<MarketLifecycleReaderV3, 'readComposition'>,
    @Inject(MarketActionCoverage) private readonly actions: Pick<MarketActionCoverage, 'read'>,
    @Inject(DsaClient) private readonly dsa: Pick<DsaClient, 'backtestInstrumentFacts'>,
  ) {}
  async read(i: LiveExecutionScope, at = new Date()) {
    const missing = (reason: string) => ({ status: 'unavailable' as const, reason });
    const session = await this.market.getSession(i.market, at);
    if (session.state !== 'open' || !session.date) return sessionUnavailable(session);
    const day = session.date;
    if (i.market === 'US')
      return readUsLiveExecution(
        { market: this.market, calendars: this.calendars, actions: this.actions },
        i,
        at,
        day,
      );
    // 现行独立状态合同的身份是 STOCK；不得把它当作 ETF 可交易性证明。
    if (i.assetType !== 'STOCK') return missing('live_tradability_unavailable');
    const end = [
      ...i.expiresOn,
      new Date(Date.parse(day + 'T00:00:00Z') + 14 * 86400000).toISOString().slice(0, 10),
    ]
      .sort()
      .at(-1)!;
    const calendar = await this.calendars.read({
      market: i.market,
      start: day,
      end,
      evaluationAsOf: at.toISOString(),
    });
    if (calendar.status !== 'ready') return missing(calendar.reason);
    const [scope, quote, statuses, events] = await Promise.all([
      this.dsa.backtestInstrumentFacts({
        market: i.market,
        symbol: i.symbol,
        instrumentType: i.assetType,
        start: day,
        end: day,
        executionStart: day,
        executionEnd: day,
        dataAsOf: at.toISOString(),
        identityOnly: true,
      }),
      this.market.getQuote(i.symbol, { assetType: i.assetType, allowStale: false }),
      this.status.readComposition(
        (['DAILY_TRADING_STATUS', 'DAILY_PRICE_RULE'] as const).map((capability) =>
          statusCompositionDemandV1Schema.parse({
            requirement: 'completeWindow' as const,
            query: {
              contractVersion: 1 as const,
              capabilityVersion: 1 as const,
              consumer: 'thesis-ledger' as const,
              requestId: randomUUID(),
              symbol: i.symbol,
              range: { start: day, end: day },
              routeKey: {
                kind: 'data' as const,
                market: i.market,
                assetType: 'STOCK' as const,
                capability,
              },
              ...(capability === 'DAILY_PRICE_RULE'
                ? { representation: 'exactPrices' as const }
                : {}),
            },
          }),
        ),
      ),
      i.previousDay
        ? this.actions.read({ ...i, previousDay: i.previousDay, now: at }, day)
        : Promise.resolve([]),
    ]);
    const observedAt = new Date();
    if (!qualifiedLiveQuote(quote, i, observedAt)) return missing('live_quote_unqualified');
    if (!events) return missing('corporate_action_unverified');
    const instrument = executionInstrument(scope, i, day, observedAt);
    if (!instrument) return missing('execution_rules_unavailable');
    const { fact, rule, lot, tick } = instrument;
    if (rule.cashSettlement.buyDebitAfterTradingDays !== 0)
      return missing('settlement_unqualified');
    const tradability = currentTradability(statuses, i, day, observedAt);
    if (tradability.status !== 'available') return missing(tradability.reason);
    const { tradeDay, priceDay } = tradability;
    const current = await this.market.getSession(i.market, observedAt);
    if (current.state !== 'open' || current.date !== day) return sessionUnavailable(current);
    if (!liveQuoteInCurrentSession(current, quote.marketTime, observedAt))
      return missing('live_quote_unqualified');
    const availability = executionAvailabilityDates(calendar.calendar, day, rule);
    if (!availability) return missing('calendar_incomplete');
    const { ends, positionAvailableOn, cashAvailableOn } = availability;
    const blocked = executionBlocked(fact, tradeDay, observedAt);
    const charge = (side: 'buy' | 'sell', amount: string) => executionCharge(rule, side, amount);
    const evidence = { quote, fact, statuses, calendar: calendar.calendar, events };
    return {
      status: 'available' as const,
      ends,
      evidence,
      observation: {
        symbol: i.symbol,
        price: String(quote.price),
        marketTime: new Date(quote.marketTime).toISOString(),
        observedAt: observedAt.toISOString(),
        tradingDate: day,
        positionAvailableOn,
        cashAvailableOn,
        lot,
        tick,
        sourceRef: createHash('sha256').update(JSON.stringify(evidence)).digest('hex'),
        evidence,
        buyBlocked: blocked ? 'suspended' : null,
        sellBlocked: blocked ? 'suspended' : null,
        ...(priceDay.rule.kind === 'exact'
          ? { upperLimit: priceDay.rule.upper, lowerLimit: priceDay.rule.lower }
          : {}),
        statutoryBuyFee: (amount: string) => charge('buy', amount),
        statutorySellFee: (amount: string) => charge('sell', amount),
      },
    };
  }
}

type LiveQuote = Awaited<ReturnType<MarketService['getQuote']>>;
type InstrumentScope = Awaited<ReturnType<DsaClient['backtestInstrumentFacts']>>;
type ComposedStatus = Awaited<ReturnType<MarketLifecycleReaderV3['readComposition']>>;

function qualifiedLiveQuote(
  quote: LiveQuote,
  i: LiveExecutionScope,
  observedAt: Date,
): quote is LiveQuote & { marketTime: string } {
  return !(
    quote.symbol !== i.symbol ||
    quote.stale ||
    quote.refreshFailure ||
    quote.freshness !== 'live' ||
    !quote.marketTime ||
    quote.units?.priceCurrency !== i.currency ||
    quote.price <= 0 ||
    Date.parse(quote.marketTime) > observedAt.getTime() ||
    observedAt.getTime() - Date.parse(quote.marketTime) > i.maxQuoteAgeSeconds * 1000
  );
}

function executionInstrument(
  scope: InstrumentScope,
  i: LiveExecutionScope,
  day: string,
  observedAt: Date,
) {
  const matching = scope.facts.filter(
    (f) =>
      f.symbol === i.symbol &&
      f.market === i.market &&
      f.currency === i.currency &&
      f.instrumentType === i.assetType &&
      Date.parse(f.availableAt) <= observedAt.getTime(),
  );
  const fact = matching[0];
  if (
    matching.length !== 1 ||
    !fact?.lotSize ||
    !fact.tickSize ||
    fact.executionRules.status !== 'supported' ||
    fact.executionRules.range.start > day ||
    fact.executionRules.range.end < day
  )
    return null;
  const rule = fact.executionRules;

  return { fact, rule, lot: fact.lotSize, tick: fact.tickSize };
}

function currentTradabilityContract(
  trading: ReturnType<typeof dailyTradingStatusResultV1Schema.parse>,
  prices: ReturnType<typeof dailyPriceRuleResultV1Schema.parse>,
  i: LiveExecutionScope,
  day: string,
  observedAt: Date,
) {
  return !(
    trading.symbol !== i.symbol ||
    prices.symbol !== i.symbol ||
    trading.range.start !== day ||
    trading.range.end !== day ||
    prices.range.start !== day ||
    prices.range.end !== day ||
    !trading.coverage.complete ||
    !prices.coverage.complete ||
    Date.parse(trading.clock.observedAt) > observedAt.getTime() ||
    Date.parse(prices.clock.observedAt) > observedAt.getTime()
  );
}

function currentTradability(
  statuses: ComposedStatus,
  i: LiveExecutionScope,
  day: string,
  observedAt: Date,
) {
  const tradingEntry = statuses.entries.find(
    (e) => e.query.routeKey.capability === 'DAILY_TRADING_STATUS',
  );
  const priceEntry = statuses.entries.find(
    (e) => e.query.routeKey.capability === 'DAILY_PRICE_RULE',
  );
  if (tradingEntry?.status !== 'included' || priceEntry?.status !== 'included')
    return { status: 'unavailable' as const, reason: 'live_tradability_unavailable' };
  const trading = dailyTradingStatusResultV1Schema.parse(tradingEntry.result);
  const prices = dailyPriceRuleResultV1Schema.parse(priceEntry.result);
  if (!currentTradabilityContract(trading, prices, i, day, observedAt))
    return { status: 'unavailable' as const, reason: 'live_tradability_unavailable' };
  const tradeDay = trading.days.find((d) => d.date === day);
  const priceDay = prices.days.find((d) => d.date === day);
  if (
    !tradeDay ||
    tradeDay.state === 'unknown' ||
    !priceDay ||
    (priceDay.rule.kind !== 'exact' && priceDay.rule.kind !== 'unlimited')
  )
    return { status: 'unavailable' as const, reason: 'live_tradability_unavailable' };
  if (priceDay.rule.kind === 'exact' && priceDay.rule.currency !== i.currency)
    return { status: 'unavailable' as const, reason: 'price_limit_currency_mismatch' };

  return { status: 'available' as const, tradeDay, priceDay };
}

function executionBlocked(
  fact: InstrumentScope['facts'][number],
  tradeDay: ReturnType<typeof dailyTradingStatusResultV1Schema.parse>['days'][number],
  observedAt: Date,
) {
  return (
    !fact.tradable ||
    tradeDay.state === 'suspended' ||
    tradeDay.intradayHalts.some(
      (h) =>
        Date.parse(h.startedAt) <= observedAt.getTime() &&
        (!h.endedAt || Date.parse(h.endedAt) > observedAt.getTime()),
    )
  );
}
function executionCharge(
  rule: Extract<InstrumentScope['facts'][number]['executionRules'], { status: 'supported' }>,
  side: 'buy' | 'sell',
  amount: string,
) {
  return rule.statutoryCharges
    .filter((c) => c.side === side || c.side === 'both')
    .reduce((sum, c) => {
      const computed = D(amount).times(c.rate);
      return sum.plus(c.minimum && computed.compareTo(c.minimum) < 0 ? c.minimum : computed);
    }, D('0'))
    .toString();
}

function sessionUnavailable(session: Awaited<ReturnType<MarketService['getSession']>>) {
  return { status: 'unavailable' as const, reason: session.reason ?? 'market_closed' };
}
function executionAvailabilityDates(
  calendar: MarketPeriodCalendarFact,
  day: string,
  rule: Extract<InstrumentScope['facts'][number]['executionRules'], { status: 'supported' }>,
) {
  const ends = executionSessionEnds(calendar);
  const dates = [...ends.keys()].sort();
  const settle = (count: number) => dates[dates.indexOf(day) + count];
  const positionAvailableOn = settle(rule.positionSettlement.sellableAfterTradingDays);
  const cashAvailableOn = settle(rule.cashSettlement.sellCreditAfterTradingDays);
  if (!positionAvailableOn || !cashAvailableOn) return null;

  return { ends, positionAvailableOn, cashAvailableOn };
}
