import { DecimalValue } from '@thesis-ledger/domain';
import {
  dailyPriceRuleResultV1Schema,
  dailyTradingStatusResultV1Schema,
  type ArenaLiveProtocol,
  type SampledHistoricalExecutionContext,
} from '@thesis-ledger/schemas';
import type { DsaClient } from '../integration/dsa/dsa.client.js';
import type { MarketLifecycleReaderV3 } from './market-lifecycle-reader-v3.js';
type ReplayInstrument = { symbol: string; assetType: 'STOCK' | 'ETF' };
type InstrumentScope = Awaited<ReturnType<DsaClient['backtestInstrumentFacts']>>;
type ReplayFact = InstrumentScope['facts'][number] | SampledHistoricalExecutionContext['fact'];
type ComposedStatus = Awaited<ReturnType<MarketLifecycleReaderV3['readComposition']>>;

export function replayExecutionInstrument(
  scope: { facts: ReplayFact[] },
  p: ArenaLiveProtocol,
  symbol: string,
  instrument: ReplayInstrument,
  at: string,
  day: string,
) {
  const fact = scope.facts.find(
    (item) =>
      item.symbol === symbol &&
      item.market === p.market &&
      item.currency === p.currency &&
      item.instrumentType === instrument.assetType &&
      Date.parse(item.availableAt) <= Date.parse(at),
  );
  if (
    p.simulationPolicy &&
    fact?.lotSize &&
    fact.tickSize &&
    DecimalValue.from(fact.lotSize).isPositive() &&
    DecimalValue.from(fact.tickSize).isPositive()
  ) {
    return {
      fact,
      lot: fact.lotSize,
      tick: fact.tickSize,
      rule: {
        positionSettlement: { sellableAfterTradingDays: p.market === 'CN' ? 1 : 0 },
        cashSettlement: { buyDebitAfterTradingDays: 0, sellCreditAfterTradingDays: 0 },
        statutoryCharges: [] as { side: string; rate: string; minimum: string | null }[],
      },
    };
  }
  if (
    !fact?.lotSize ||
    !fact.tickSize ||
    !('tradable' in fact) || !fact.tradable ||
    !('executionRules' in fact) ||
    fact.executionRules.status !== 'supported' ||
    fact.executionRules.range.start > day ||
    fact.executionRules.range.end < day ||
    fact.executionRules.cashSettlement.buyDebitAfterTradingDays !== 0
  )
    throw new Error('replay_rules_unavailable');
  const rule = fact.executionRules;

  return { fact, rule, lot: fact.lotSize, tick: fact.tickSize };
}

export function replayTradingLimits(
  status: ComposedStatus,
  symbol: string,
  day: string,
  at: string,
  sampled = false,
) {
  const tradingRaw = status.entries.find(
    (e) => e.query.routeKey.capability === 'DAILY_TRADING_STATUS',
  );
  const priceRaw = status.entries.find((e) => e.query.routeKey.capability === 'DAILY_PRICE_RULE');
  if (tradingRaw?.status !== 'included' || (!sampled && priceRaw?.status !== 'included'))
    throw new Error('replay_rules_unavailable');
  const trading = dailyTradingStatusResultV1Schema.parse(tradingRaw.result),
    limits =
      priceRaw?.status === 'included' ? dailyPriceRuleResultV1Schema.parse(priceRaw.result) : null;
  const tradingDay = trading.days.find((item) => item.date === day),
    priceRule = sampled
      ? { kind: 'unlimited' as const }
      : limits?.days.find((item) => item.date === day)?.rule;
  if (
    trading.symbol !== symbol ||
    (!sampled && limits?.symbol !== symbol) ||
    !trading.coverage.complete ||
    (!sampled && !limits?.coverage.complete) ||
    Date.parse(trading.clock.observedAt) > Date.parse(at) ||
    (!sampled && Date.parse(limits?.clock.observedAt ?? '') > Date.parse(at)) ||
    !tradingDay ||
    tradingDay.state === 'unknown' ||
    !priceRule ||
    (priceRule.kind !== 'exact' && priceRule.kind !== 'unlimited')
  )
    throw new Error('replay_rules_unavailable');

  return { tradingDay, priceRule };
}
