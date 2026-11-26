import type { ArenaLiveProtocol } from '@thesis-ledger/schemas';
import type { MarketService } from '../../market/market.service.js';
import type { MarketLiveExecutionReader } from '../../market/market-live-execution-reader.js';

export type LiveResearchExecution = Pick<MarketLiveExecutionReader, 'read'> &
  Partial<Pick<MarketLiveExecutionReader, 'hkStockOrderReference'>>;

export async function readLiveResearchQuote(
  protocol: ArenaLiveProtocol, symbol: string, assetType: 'STOCK' | 'ETF', signal: AbortSignal,
  market: Pick<MarketService, 'getQuote'>, execution?: LiveResearchExecution,
) {
  signal.throwIfAborted();
  const quote = await market.getQuote(symbol, { assetType, allowStale: false, signal });
  signal.throwIfAborted();
  const orderRuleReference = protocol.market === 'HK' && protocol.currency === 'HKD' && assetType === 'STOCK'
    ? await execution?.hkStockOrderReference?.(symbol, quote)
    : undefined;
  signal.throwIfAborted();
  const reference = orderRuleReference ? { ...quote, orderRuleReference } : quote;
  if (!execution) return { ...reference, execution: { status: 'unavailable', reason: 'execution_reader_unavailable' } };
  try {
    const checked = await execution.read({ symbol, assetType, market: protocol.market,
      currency: protocol.currency, maxQuoteAgeSeconds: protocol.resources.maxQuoteAgeSeconds, expiresOn: [],
      needsBuySettlement: false,
      ...(protocol.simulationPolicy ? { simulationPolicy: protocol.simulationPolicy } : {}) });
    signal.throwIfAborted();
    if (checked.status === 'unavailable') return { ...reference, execution: checked };
    return { ...reference, execution: { status: 'available', reason: null,
      price: checked.observation.price, marketTime: checked.observation.marketTime,
      observedAt: checked.observation.observedAt } };
  } catch {
    signal.throwIfAborted();
    return { ...reference, execution: { status: 'unavailable', reason: 'execution_evidence_unavailable' } };
  }
}
