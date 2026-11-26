import { createHash } from 'node:crypto';
import { arenaPublicFees, type MarketPeriodCalendarFact } from '@thesis-ledger/domain';
import {
  dailyPriceRuleResultV1Schema,
  dailyTradingStatusResultV1Schema,
} from '@thesis-ledger/schemas';
import type { DsaClient } from '../integration/dsa/dsa.client.js';
import type { MarketService } from './market.service.js';
import type { MarketPeriodCalendarReader } from './market-period-calendar-reader.js';
import type { MarketLifecycleReaderV3 } from './market-lifecycle-reader-v3.js';
import type { MarketActionCoverage } from './market-action-coverage.js';
import type { LiveExecutionScope } from './market-live-execution-reader.js';
import {
  qualifiedLiveQuote,
  liveQuoteInCurrentSession,
  liveQuoteDiagnostics,
} from './market-live-quote-session.js';
import {
  readLiveRuleInputs,
  failedLiveInput,
  type LiveInputDiagnostic,
  type LiveRulePort,
} from './market-live-rule-inputs.js';

type Dependencies = {
  market: Pick<MarketService, 'getSession' | 'getQuote'>;
  calendars: Pick<MarketPeriodCalendarReader, 'read'>;
  status: Pick<MarketLifecycleReaderV3, 'readComposition'>;
  actions: Pick<MarketActionCoverage, 'read'>;
  dsa: LiveRulePort & Pick<DsaClient, 'backtestInstrumentFacts'>;
};
type InstrumentScope = Awaited<ReturnType<DsaClient['backtestInstrumentFacts']>>;
type ComposedStatus = Awaited<ReturnType<MarketLifecycleReaderV3['readComposition']>>;

export function executionSessionEnds(calendar: MarketPeriodCalendarFact) {
  const ends = new Map<string, string>();
  for (const s of calendar.sessions) {
    const previous = ends.get(s.tradingDate);
    if (!previous || Date.parse(previous) < Date.parse(s.endAt))
      ends.set(s.tradingDate, new Date(s.endAt).toISOString());
  }
  return ends;
}

export async function readCnLiveExecution(
  d: Dependencies,
  i: LiveExecutionScope,
  at: Date,
  day: string,
) {
  const missing = (reason: string, diagnostics?: LiveInputDiagnostic[]) => ({
    status: 'unavailable' as const,
    reason,
    ...(diagnostics ? { diagnostics } : {}),
  });
  const end = [
    ...i.expiresOn,
    new Date(Date.parse(day + 'T00:00:00Z') + 14 * 86400000).toISOString().slice(0, 10),
  ]
    .sort()
    .at(-1)!;
  const [quote, calendar, events] = await Promise.all([
    d.market.getQuote(i.symbol, { assetType: i.assetType, allowStale: false }),
    d.calendars.read({ market: 'CN', start: day, end, evaluationAsOf: at.toISOString() }),
    i.previousDay
      ? d.actions.read({ ...i, previousDay: i.previousDay, now: at }, day)
      : Promise.resolve([]),
  ]);
  if (calendar.status !== 'ready') return missing(calendar.reason);
  if (!qualifiedLiveQuote(quote, i, new Date()))
    return missing('live_quote_unqualified', liveQuoteDiagnostics(quote, i, new Date()));
  if (!events) return missing('corporate_action_unverified');
  const [identity, inputs] = await Promise.all([
    d.dsa
      .backtestInstrumentFacts({
        market: 'CN',
        symbol: i.symbol,
        instrumentType: i.assetType,
        start: day,
        end: day,
        executionStart: day,
        executionEnd: day,
        dataAsOf: at.toISOString(),
        identityOnly: true,
      })
      .then(
        (value) => ({ value, error: null }),
        (error: unknown) => ({ value: null, error }),
      ),
    readLiveRuleInputs(d.dsa, d.status, { ...i, market: 'CN' }, day),
  ]);
  const diagnostics = [...inputs.diagnostics];
  const observedAt = new Date();
  const instrument = executionInstrument(identity.value, i, day, observedAt);
  if (!instrument) diagnostics.push(failedLiveInput('instrumentIdentity', identity.error));
  const tradability = currentTradability(inputs.statuses, i, day, observedAt);
  if (tradability.status === 'unavailable')
    diagnostics.push(
      ...tradability.diagnostics.filter(
        (item) => !diagnostics.some((known) => known.field === item.field),
      ),
    );
  const rule = instrument?.rule;
  if (!rule)
    diagnostics.push(
      { field: 'positionSettlement', status: 'unavailable', reason: 'unsupported-capability' },
      { field: 'cashSettlement', status: 'unavailable', reason: 'unsupported-capability' },
    );
  if (!instrument || !rule) return missing('execution_rules_unavailable', diagnostics);
  if (rule.cashSettlement.buyDebitAfterTradingDays !== 0)
    return missing('settlement_unqualified', diagnostics);
  if (tradability.status === 'unavailable') return missing(tradability.reason, diagnostics);
  if (!inputs.fees) return missing('execution_rules_unavailable', diagnostics);
  if (!qualifiedLiveQuote(quote, i, observedAt))
    return missing('live_quote_unqualified', liveQuoteDiagnostics(quote, i, observedAt));
  const current = await d.market.getSession('CN', observedAt);
  if (!liveQuoteInCurrentSession(current, quote.marketTime, observedAt))
    return missing('live_quote_unqualified');
  const availability = executionAvailabilityDates(calendar.calendar, day, rule);
  if (!availability) return missing('calendar_incomplete');
  const { fact, lot, tick } = instrument;
  const blocked = executionBlocked(tradability.tradeDay, observedAt);
  const charges = inputs.fees.segments.flatMap((segment) => segment.charges);
  const charge = (side: 'buy' | 'sell', amount: string, quantity = '1', price = amount) =>
    arenaPublicFees(charges, side, i.currency, quantity, price);
  const evidence = {
    quote,
    fact,
    statuses: inputs.statuses,
    fees: inputs.fees,
    calendar: calendar.calendar,
    events,
  };
  return {
    status: 'available' as const,
    ends: availability.ends,
    evidence,
    observation: {
      symbol: i.symbol,
      price: String(quote.price),
      marketTime: new Date(quote.marketTime).toISOString(),
      observedAt: observedAt.toISOString(),
      tradingDate: day,
      positionAvailableOn: availability.positionAvailableOn,
      cashAvailableOn: availability.cashAvailableOn,
      lot,
      tick,
      sourceRef: createHash('sha256').update(JSON.stringify(evidence)).digest('hex'),
      evidence,
      buyBlocked: blocked ? 'suspended' : null,
      sellBlocked: blocked ? 'suspended' : null,
      ...(tradability.priceDay.rule.kind === 'exact'
        ? {
            upperLimit: tradability.priceDay.rule.upper,
            lowerLimit: tradability.priceDay.rule.lower,
          }
        : {}),
      statutoryBuyFee: (amount: string, quantity?: string, price?: string) =>
        charge('buy', amount, quantity, price),
      statutorySellFee: (amount: string, quantity?: string, price?: string) =>
        charge('sell', amount, quantity, price),
    },
  };
}

function executionInstrument(
  scope: InstrumentScope | null,
  i: LiveExecutionScope,
  day: string,
  at: Date,
) {
  if (scope === null) return null;
  const matching = scope.facts.filter(
    (fact) =>
      fact.symbol === i.symbol &&
      fact.market === i.market &&
      fact.currency === i.currency &&
      fact.instrumentType === i.assetType &&
      Date.parse(fact.availableAt) <= at.getTime(),
  );
  const fact = matching[0];
  if (matching.length !== 1 || !fact?.lotSize || !fact.tickSize) return null;
  const raw = fact.executionRules;
  const rule =
    raw.status === 'supported' && raw.range.start <= day && raw.range.end >= day ? raw : null;
  return { fact, rule, lot: fact.lotSize, tick: fact.tickSize };
}

type StatusEntry = ComposedStatus['entries'][number] | undefined;

function currentTradability(
  statuses: ComposedStatus | null,
  i: LiveExecutionScope,
  day: string,
  at: Date,
) {
  const tradingEntry = statuses?.entries.find(
    (entry) => entry.query.routeKey.capability === 'DAILY_TRADING_STATUS',
  );
  const priceEntry = statuses?.entries.find(
    (entry) => entry.query.routeKey.capability === 'DAILY_PRICE_RULE',
  );
  const tradeDay = currentTradingDay(tradingEntry, i, day, at);
  const priceDay = currentPriceDay(priceEntry, i, day, at);
  const diagnostics: LiveInputDiagnostic[] = [];
  if (tradeDay === null)
    diagnostics.push({
      field: 'DAILY_TRADING_STATUS',
      status: 'unavailable',
      reason: tradingEntry?.status === 'failed' ? tradingEntry.error : 'insufficient-coverage',
    });
  if (priceDay === null)
    diagnostics.push({
      field: 'DAILY_PRICE_RULE',
      status: 'unavailable',
      reason: priceEntry?.status === 'failed' ? priceEntry.error : 'insufficient-coverage',
    });
  if (!tradeDay || !priceDay)
    return { status: 'unavailable' as const, reason: 'live_tradability_unavailable', diagnostics };
  if (priceDay.rule.kind === 'exact' && priceDay.rule.currency !== i.currency)
    return {
      status: 'unavailable' as const,
      reason: 'price_limit_currency_mismatch',
      diagnostics: [
        {
          field: 'DAILY_PRICE_RULE',
          status: 'unavailable' as const,
          reason: 'price_limit_currency_mismatch',
        },
      ],
    };
  return { status: 'available' as const, tradeDay, priceDay };
}

function currentTradingDay(entry: StatusEntry, scope: LiveExecutionScope, day: string, at: Date) {
  const parsed = dailyTradingStatusResultV1Schema.safeParse(
    entry?.status === 'included' ? entry.result : null,
  );
  if (!parsed.success || !currentStatusWindow(parsed.data, scope, day, at)) return null;
  const fact = parsed.data.days.find((item) => item.date === day);
  if (!fact || fact.state === 'unknown') return null;
  return fact;
}

function currentPriceDay(entry: StatusEntry, scope: LiveExecutionScope, day: string, at: Date) {
  const parsed = dailyPriceRuleResultV1Schema.safeParse(
    entry?.status === 'included' ? entry.result : null,
  );
  if (!parsed.success || !currentStatusWindow(parsed.data, scope, day, at)) return null;
  const fact = parsed.data.days.find((item) => item.date === day);
  if (!fact || (fact.rule.kind !== 'exact' && fact.rule.kind !== 'unlimited')) return null;
  return fact;
}

function currentStatusWindow(
  result:
    | ReturnType<typeof dailyTradingStatusResultV1Schema.parse>
    | ReturnType<typeof dailyPriceRuleResultV1Schema.parse>,
  scope: LiveExecutionScope,
  day: string,
  at: Date,
) {
  return (
    result.symbol === scope.symbol &&
    result.range.start === day &&
    result.range.end === day &&
    result.coverage.complete &&
    Date.parse(result.clock.observedAt) <= at.getTime()
  );
}

function executionBlocked(
  tradeDay: ReturnType<typeof dailyTradingStatusResultV1Schema.parse>['days'][number],
  observedAt: Date,
) {
  return (
    tradeDay.state === 'suspended' ||
    tradeDay.intradayHalts.some(
      (h) =>
        Date.parse(h.startedAt) <= observedAt.getTime() &&
        (!h.endedAt || Date.parse(h.endedAt) > observedAt.getTime()),
    )
  );
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
