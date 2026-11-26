import type { LiveExecutionScope } from './market-live-execution-reader.js';
import type { MarketService } from './market.service.js';
import type { MarketLifecycleReaderV3 } from './market-lifecycle-reader-v3.js';
import { hkStockPriceReference } from './market-hk-stock-order-reference.js';
import {
  qualifiedLiveQuote,
  liveQuoteInCurrentSession,
  liveQuoteDiagnostics,
} from './market-live-quote-session.js';
import {
  readLiveRuleInputs,
  type LiveInputDiagnostic,
  type LiveRulePort,
} from './market-live-rule-inputs.js';

type Dependencies = {
  market: Pick<MarketService, 'getQuote' | 'getSession'>;
  status: Pick<MarketLifecycleReaderV3, 'readComposition'>;
  dsa: LiveRulePort;
};

/** 港股当前观察独立于历史身份；费用、价格限制和结算缺口各自保留。 */
export async function readHkLiveExecution(
  d: Dependencies,
  i: LiveExecutionScope,
  at: Date,
  day: string,
) {
  const quote = await d.market.getQuote(i.symbol, { assetType: i.assetType, allowStale: false });
  const observedAt = new Date();
  const diagnostics: LiveInputDiagnostic[] = [];
  if (
    !qualifiedLiveQuote(quote, i, observedAt) ||
    !liveQuoteInCurrentSession(
      await d.market.getSession('HK', observedAt),
      quote.marketTime ?? '',
      observedAt,
    )
  ) {
    return {
      status: 'unavailable' as const,
      reason: 'live_quote_unqualified',
      diagnostics: liveQuoteDiagnostics(quote, i, observedAt),
    };
  }
  const facts = currentHkFacts(quote, i, observedAt);
  const tradingKnown =
    facts !== null && facts.delisted === false && facts.tradingState !== 'unknown';
  const tradingAllowed =
    tradingKnown && facts.tradingState === 'normal' && facts.securityStatus === 'NORMAL';
  diagnostics.push({
    field: 'tradingState',
    status: tradingKnown ? 'available' : 'unavailable',
    ...(!tradingKnown ? { reason: 'live_tradability_unavailable' } : {}),
  });
  diagnostics.push({
    field: 'sharesPerLot',
    status: facts?.sharesPerLot ? 'available' : 'unavailable',
  });
  const spread =
    i.assetType === 'STOCK' && i.currency === 'HKD'
      ? hkStockPriceReference(i.symbol, quote, at)
      : null;
  diagnostics.push({
    field: 'priceStep',
    status: spread?.incrementAtQuote ? 'available' : 'unavailable',
  });
  const rules = await readLiveRuleInputs(d.dsa, d.status, { ...i, market: 'HK' }, day);
  diagnostics.push(
    ...rules.diagnostics,
    { field: 'DAILY_PRICE_RULE', status: 'unavailable', reason: 'unsupported-capability' },
    { field: 'positionSettlement', status: 'unavailable', reason: 'unsupported-capability' },
    { field: 'cashSettlement', status: 'unavailable', reason: 'unsupported-capability' },
  );
  return {
    status: 'unavailable' as const,
    reason: tradingAllowed ? 'execution_rules_unavailable' : 'live_tradability_unavailable',
    diagnostics,
    evidence: { quote, fees: rules.fees, priceReference: spread },
  };
}

function currentHkFacts(
  quote: Awaited<ReturnType<MarketService['getQuote']>>,
  scope: LiveExecutionScope,
  at: Date,
) {
  const facts = quote.executionFacts;
  if (
    !facts ||
    facts.market !== 'HK' ||
    facts.symbol !== scope.symbol ||
    facts.assetType !== scope.assetType ||
    quote.provider !== 'futu' ||
    quote.upstreamSource !== 'futu' ||
    facts.marketTime === null ||
    Date.parse(facts.marketTime) !== Date.parse(quote.marketTime ?? '') ||
    Date.parse(facts.observedAt) > at.getTime() ||
    Date.parse(facts.observedAt) < Date.parse(facts.marketTime)
  )
    return null;
  return facts;
}
