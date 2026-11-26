import { createHash } from 'node:crypto';
import { DecimalValue, type ArenaPaperQuote } from '@thesis-ledger/domain';
import { z } from 'zod';
import type { DsaClient } from '../integration/dsa/dsa.client.js';
import type { MarketService } from './market.service.js';
import type { MarketPeriodCalendarReader } from './market-period-calendar-reader.js';
import type { MarketActionCoverage } from './market-action-coverage.js';
import type { LiveExecutionScope } from './market-live-execution-reader.js';
import { qualifiedLiveQuote, liveQuoteInCurrentSession } from './market-live-quote-session.js';
import { hkStockPriceReference } from './market-hk-stock-order-reference.js';
import { sampledCalendar } from './market-sampled-calendar.js';
import { hkEtfPriceStep, hkEtfSpreadEvidence } from './market-hk-etf-price-step.js';

type Ports = {
  market: Pick<MarketService, 'getQuote' | 'getSession'>;
  calendars: Pick<MarketPeriodCalendarReader, 'read'>;
  actions: Pick<MarketActionCoverage, 'read'>;
  dsa: Pick<DsaClient, 'get' | 'backtestInstrumentFacts'>;
};
const statusSchema = z.object({
  symbol: z.string(),
  assetType: z.enum(['STOCK', 'ETF']),
  day: z.string(),
  observedAt: z.iso.datetime({ offset: true }),
  state: z.enum(['normal', 'suspended', 'unknown']),
  evidence: z.unknown(),
});
const positive = (value: string | null | undefined): value is string =>
  !!value && /^\d+(\.\d+)?$/.test(value) && DecimalValue.from(value).isPositive();

export async function readSampledLiveExecution(
  d: Ports,
  i: LiveExecutionScope,
  at: Date,
  day: string,
) {
  const missing = (reason: string) => ({ status: 'unavailable' as const, reason });
  const quote = await d.market.getQuote(i.symbol, { assetType: i.assetType, allowStale: false });
  let observedAt = new Date();
  if (
    !qualifiedLiveQuote(quote, i, observedAt) ||
    !liveQuoteInCurrentSession(
      await d.market.getSession(i.market, observedAt),
      quote.marketTime,
      observedAt,
    )
  )
    return missing('live_quote_unqualified');
  const units = await sampledUnits(d, i, quote, day, observedAt);
  if (!units) return missing('live_tradability_unavailable');
  if (i.previousDay) {
    const events = await d.actions.read(
      { ...i, previousDay: i.previousDay, now: at },
      day,
      'sampled-v1',
    );
    if (events === null) return missing('corporate_action_unprocessed');
  }
  const calendar = await sampledCalendar(
    d.calendars,
    i.market,
    day,
    at,
    i.market === 'CN' && i.needsBuySettlement !== false,
    i.expiresOn,
  );
  if (!calendar) return missing('calendar_incomplete');
  observedAt = new Date();
  if (!qualifiedLiveQuote(quote, i, observedAt)) return missing('live_quote_unqualified');
  const evidence = {
    quote,
    units: units.evidence,
    calendar: [...calendar.ends],
    simulationPolicy: 'sampled-v1',
    assumptions: {
      fees: 'configured-only',
      dailyPriceLimits: 'not-simulated',
      incompleteCorporateActions: 'assumed-none',
      sellCash: 'same-day',
    },
  };
  const observation: ArenaPaperQuote = {
    symbol: i.symbol,
    price: String(quote.price),
    marketTime: new Date(quote.marketTime).toISOString(),
    observedAt: observedAt.toISOString(),
    tradingDate: day,
    positionAvailableOn: calendar.positionAvailableOn,
    cashAvailableOn: day,
    lot: units.lot,
    tick: units.priceStep(String(quote.price)),
    priceStep: units.priceStep,
    buyBlocked: units.blocked ? 'suspended' : null,
    sellBlocked: units.blocked ? 'suspended' : null,
    sourceRef: createHash('sha256').update(JSON.stringify(evidence)).digest('hex'),
    evidence,
    statutoryBuyFee: () => '0',
    statutorySellFee: () => '0',
  };
  return { status: 'available' as const, ends: calendar.ends, observation, evidence };
}

async function sampledUnits(
  d: Ports,
  i: LiveExecutionScope,
  quote: Awaited<ReturnType<MarketService['getQuote']>>,
  day: string,
  at: Date,
) {
  if (i.market === 'CN') {
    const [identity, raw] = await Promise.all([
      d.dsa.backtestInstrumentFacts({
        market: 'CN',
        symbol: i.symbol,
        instrumentType: i.assetType,
        start: day,
        end: day,
        executionStart: day,
        executionEnd: day,
        dataAsOf: at.toISOString(),
        identityOnly: true,
      }),
      d.dsa.get(
        '/api/v1/thesis-ledger/market/trading-observation?' +
          new URLSearchParams({
            symbol: i.symbol,
            assetType: i.assetType,
          }).toString(),
        1,
      ),
    ]);
    const parsed = statusSchema.safeParse(raw);
    const checkedAt = new Date();
    const facts = identity.facts.filter(
      (f) =>
        f.symbol === i.symbol &&
        f.instrumentType === i.assetType &&
        f.market === i.market &&
        f.currency === i.currency &&
        Date.parse(f.availableAt) <= checkedAt.getTime(),
    );
    const fact = facts[0];
    if (
      facts.length !== 1 ||
      !fact ||
      !positive(fact.lotSize) ||
      !positive(fact.tickSize) ||
      !parsed.success
    )
      return null;
    const status = parsed.data;
    if (
      status.symbol !== i.symbol ||
      status.assetType !== i.assetType ||
      status.day !== day ||
      status.state === 'unknown' ||
      Date.parse(status.observedAt) > checkedAt.getTime() ||
      checkedAt.getTime() - Date.parse(status.observedAt) > i.maxQuoteAgeSeconds * 1000
    )
      return null;
    return {
      lot: fact.lotSize,
      priceStep: () => fact.tickSize!,
      blocked: status.state === 'suspended',
      evidence: { fact, status },
    };
  }
  const f = quote.executionFacts;
  if (
    !f ||
    quote.provider !== 'futu' ||
    quote.upstreamSource !== 'futu' ||
    f.symbol !== i.symbol ||
    f.market !== i.market ||
    f.assetType !== i.assetType ||
    !f.securityId ||
    !f.exchange ||
    !positive(f.sharesPerLot) ||
    f.delisted !== false ||
    f.tradingState === 'unknown' ||
    Date.parse(f.marketTime ?? '') !== Date.parse(quote.marketTime ?? '') ||
    Date.parse(f.observedAt) < Date.parse(f.marketTime ?? '') ||
    Date.parse(f.observedAt) > at.getTime()
  )
    return null;
  const priceStep = (price: string) => {
    if (i.market === 'US') return DecimalValue.from(price).compareTo('1') >= 0 ? '0.01' : '0.0001';
    if (i.assetType === 'ETF') {
      return hkEtfPriceStep(i.symbol, price);
    }
    const reference = hkStockPriceReference(i.symbol, { ...quote, price: Number(price) }, at);
    if (!reference?.incrementAtQuote) throw new Error('price_step_unavailable');
    return reference.incrementAtQuote;
  };
  priceStep(String(quote.price));
  return {
    lot: f.sharesPerLot,
    priceStep,
    blocked: f.tradingState !== 'normal' || f.securityStatus !== 'NORMAL',
    evidence: {
      executionFacts: f,
      ...(i.market === 'HK' && i.assetType === 'ETF' ? { spreadTable: hkEtfSpreadEvidence } : {}),
    },
  };
}
