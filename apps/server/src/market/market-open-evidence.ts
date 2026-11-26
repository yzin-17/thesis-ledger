import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  dailyPriceRuleResultV1Schema,
  dailyTradingStatusResultV1Schema,
} from '@thesis-ledger/schemas';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import { MarketService } from './market.service.js';
import { MarketLifecycleReaderV3 } from './market-lifecycle-reader-v3.js';
import { MarketActionCoverage } from './market-action-coverage.js';
type Input = {
  symbol: string;
  assetType: 'STOCK' | 'ETF';
  market: 'CN' | 'HK' | 'US';
  currency: string;
  timeZone: string;
  openAt: Date;
  previousDay: string;
  held: string;
  now: Date;
};
@Injectable()
export class MarketOpenEvidence {
  constructor(
    @Inject(MarketService) private readonly market: MarketService,
    @Inject(MarketLifecycleReaderV3) private readonly status: MarketLifecycleReaderV3,
    @Inject(MarketActionCoverage) private readonly actions: MarketActionCoverage,
    @Inject(DsaClient) private readonly dsa: DsaClient,
  ) {}
  async read(i: Input) {
    const unavailable = (reason: string) => ({ status: 'unavailable', reason }) as const;
    if (i.market !== 'CN' || i.assetType !== 'STOCK')
      return unavailable('market_rules_unqualified');
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: i.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const day = date.format(i.openAt);
    if (i.now < i.openAt || date.format(i.now) !== day) return unavailable('opening_window_missed');
    const scope = await this.dsa.backtestInstrumentFacts({
      market: i.market,
      symbol: i.symbol,
      instrumentType: i.assetType,
      start: day,
      end: day,
      executionStart: day,
      executionEnd: day,
      dataAsOf: i.openAt.toISOString(),
    });
    const instrument = openingInstrument(scope, i, day);
    if (instrument.status !== 'available') return unavailable(instrument.reason);
    const { executionRules } = instrument;
    if (
      executionRules.positionSettlement.sellableAfterTradingDays > 1 ||
      executionRules.cashSettlement.sellCreditAfterTradingDays !== 0 ||
      executionRules.cashSettlement.buyDebitAfterTradingDays !== 0
    )
      return unavailable('settlement_unqualified');
    const [quote, status, events] = await Promise.all([
      this.market.getQuote(i.symbol, { allowStale: false, assetType: i.assetType }),
      readOpeningStatus(this.status, i.symbol, day),
      new Prisma.Decimal(i.held).isZero() ? [] : this.actions.read(i, day),
    ]);
    if (!events) return unavailable('corporate_action_unverified');
    if (!openingQuoteAvailable(quote, i, date, day))
      return unavailable('opening_price_unavailable');
    if (!status) return unavailable('trading_status_unknown');
    return openingExecutionFact(i, day, instrument, quote, status, events);
  }
}

async function readOpeningStatus(status: Pick<MarketLifecycleReaderV3, 'readComposition'>, symbol: string, date: string) {
  const route = { kind: 'data', market: 'CN', assetType: 'STOCK' } as const;
  const query = { contractVersion: 1, capabilityVersion: 1, consumer: 'thesis-ledger',
    symbol, range: { start: date, end: date } } as const;
  const composition = await status.readComposition([
    { requirement: 'optional', query: { ...query, requestId: randomUUID(),
      routeKey: { ...route, capability: 'DAILY_TRADING_STATUS' } } },
    { requirement: 'optional', query: { ...query, requestId: randomUUID(),
      routeKey: { ...route, capability: 'DAILY_PRICE_RULE' }, representation: 'rule' } },
  ]);
  const [statusEntry, priceEntry] = composition.entries;
  if (statusEntry?.status !== 'included' || priceEntry?.status !== 'included') return null;
  const trading = dailyTradingStatusResultV1Schema.parse(statusEntry.result);
  const prices = dailyPriceRuleResultV1Schema.parse(priceEntry.result);
  const tradingDay = trading.days.find((item) => item.date === date);
  const priceDay = prices.days.find((item) => item.date === date);
  if (!tradingDay || tradingDay.state === 'unknown' || !priceDay || priceDay.rule.kind === 'unknown') return null;
  return { tradingDay, priceRule: priceDay.rule, composition };
}

type OpeningStatus = NonNullable<Awaited<ReturnType<typeof readOpeningStatus>>>;
type InstrumentScope = Awaited<ReturnType<DsaClient['backtestInstrumentFacts']>>;
type LiveQuote = Awaited<ReturnType<MarketService['getQuote']>>;

const openingUnavailable = (reason: string) => ({ status: 'unavailable' as const, reason });
function openingInstrument(scope: InstrumentScope, i: Input, day: string) {
  const matched = scope.facts.filter(
    (f) =>
      f.symbol === i.symbol &&
      f.market === i.market &&
      f.currency === i.currency &&
      f.instrumentType === i.assetType &&
      Date.parse(f.availableAt) <= i.openAt.getTime(),
  );
  const rule = matched[0];
  if (
    scope.status !== 'supported' ||
    !scope.coverage.complete ||
    matched.length !== 1 ||
    !rule?.lotSize ||
    !rule.tickSize ||
    rule.executionRules.status !== 'supported' ||
    rule.executionRules.range.start > day ||
    rule.executionRules.range.end < day
  ) {
    const missing = scope.missingInputs?.map((item) => item.field) ?? [];
    if (missing.includes('historicalTradability') && missing.includes('executionRules'))
      return openingUnavailable('opening_tradability_and_rules_missing');
    if (missing.includes('historicalTradability'))
      return openingUnavailable('opening_tradability_missing');
    if (missing.includes('executionRules'))
      return openingUnavailable('opening_execution_rules_missing');
    return openingUnavailable('market_rules_unqualified');
  }

  return {
    status: 'available' as const,
    rule,
    executionRules: rule.executionRules,
    lot: rule.lotSize,
    tick: rule.tickSize,
  };
}

function openingQuoteAvailable(
  quote: LiveQuote,
  i: Input,
  date: Intl.DateTimeFormat,
  day: string,
): quote is LiveQuote & { marketTime: string } {
  return !(
    quote.symbol !== i.symbol ||
    quote.units?.priceCurrency !== i.currency ||
    quote.stale ||
    !quote.marketTime ||
    Date.parse(quote.marketTime) < i.openAt.getTime() ||
    date.format(new Date(quote.marketTime)) !== day ||
    Date.parse(quote.marketTime) > Date.now() ||
    quote.open <= 0
  );
}

function openingBlocked(
  rule: InstrumentScope['facts'][number],
  status: OpeningStatus['tradingDay'],
  i: Input,
) {
  return !rule.tradable ||
    status.state === 'suspended' ||
    status.intradayHalts?.some(
      (h) =>
        Date.parse(h.startedAt) <= i.openAt.getTime() &&
        (!h.endedAt || Date.parse(h.endedAt) > i.openAt.getTime()),
    )
    ? 'suspended'
    : null;
}

function openingExecutionFact(
  i: Input,
  day: string,
  instrument: Extract<ReturnType<typeof openingInstrument>, { status: 'available' }>,
  quote: LiveQuote & { marketTime: string },
  status: OpeningStatus,
  events: NonNullable<Awaited<ReturnType<MarketActionCoverage['read']>>>,
) {
  const { rule, lot, tick: tickSize } = instrument;
  const blocked = openingBlocked(rule, status.tradingDay, i);
  const band = status.priceRule;
  if (band.kind === 'ratio' && quote.previousClose <= 0) return openingUnavailable('price_limit_unknown');
  if (band.kind === 'exact' && band.currency !== i.currency) return openingUnavailable('price_limit_currency_mismatch');
  const tick = new Prisma.Decimal(tickSize),
    previous = new Prisma.Decimal(quote.previousClose);
  const limit = (ratio: Prisma.Decimal) => previous.times(ratio).div(tick).round().times(tick);
  const upper = band.kind === 'ratio' ? limit(new Prisma.Decimal(1).plus(band.maxUpRatio))
    : band.kind === 'exact' ? new Prisma.Decimal(band.upper) : undefined;
  const lower = band.kind === 'ratio' ? limit(new Prisma.Decimal(1).minus(band.maxDownRatio))
    : band.kind === 'exact' ? new Prisma.Decimal(band.lower) : undefined;
  const sources = {
    quote: {
      provider: quote.provider,
      marketTime: quote.marketTime,
      fetchedAt: quote.fetchedAt,
      previousClose: quote.previousClose,
    },
    rule: rule.providerRevision,
    status: status.composition,
    events,
  };
  const sourceRef = createHash('sha256')
    .update(
      JSON.stringify([i.symbol, day, sources, quote.open, rule.lotSize, rule.tickSize]),
    )
    .digest('hex');
  return {
    status: 'available' as const,
    fact: {
      symbol: i.symbol,
      openAt: i.openAt.toISOString(),
      price: String(quote.open),
      lot,
      tick: tickSize,
      sourceRef,
      sources,
      sellable: i.held,
      buyBlocked: blocked ?? (upper && upper.lte(quote.open) ? 'price_limit' : null),
      sellBlocked: blocked ?? (lower && lower.gte(quote.open) ? 'price_limit' : null),
      ...(upper ? { upperLimit: upper.toFixed() } : {}),
      ...(lower ? { lowerLimit: lower.toFixed() } : {}),
    },
  };
}
