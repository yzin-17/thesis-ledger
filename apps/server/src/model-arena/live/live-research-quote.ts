import type { ArenaLiveProtocol } from '@thesis-ledger/schemas';
import type { MarketService } from '../../market/market.service.js';
import type { MarketLiveExecutionReader } from '../../market/market-live-execution-reader.js';

export async function readLiveResearchQuote(
  protocol: ArenaLiveProtocol, symbol: string, assetType: 'STOCK' | 'ETF', signal: AbortSignal,
  market: Pick<MarketService, 'getQuote'>, execution?: Pick<MarketLiveExecutionReader, 'read'>,
) {
  signal.throwIfAborted();
  const quote = await market.getQuote(symbol, { assetType, allowStale: false, signal });
  signal.throwIfAborted();
  if (!execution) return { ...quote, execution: { status: 'unavailable', reason: 'execution_reader_unavailable' } };
  try {
    const checked = await execution.read({ symbol, assetType, market: protocol.market,
      currency: protocol.currency, maxQuoteAgeSeconds: protocol.resources.maxQuoteAgeSeconds, expiresOn: [] });
    signal.throwIfAborted();
    if (checked.status === 'unavailable') return { ...quote, execution: checked };
    return { ...quote, execution: { status: 'available', reason: null,
      price: checked.observation.price, marketTime: checked.observation.marketTime,
      observedAt: checked.observation.observedAt } };
  } catch {
    signal.throwIfAborted();
    return { ...quote, execution: { status: 'unavailable', reason: 'execution_evidence_unavailable' } };
  }
}
