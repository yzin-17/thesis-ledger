import type { MarketDataBarSeriesResponseV3, ExecutionPriceProtocol } from '@thesis-ledger/schemas';
import type { ArtifactRow } from './backtest-artifact-store.js';

/** 来源市场总成交额与模拟成交额分开，缺失额保持null。 */
export function executionBarRowsV3(
  response: MarketDataBarSeriesResponseV3,
  symbol: string,
  protocol: ExecutionPriceProtocol | ExecutionPriceProtocol['accountingBasis'],
): ArtifactRow[] {
  const routeKey = response.routeKey;
  const accountingBasis = typeof protocol === 'string' ? protocol : protocol.accountingBasis;
  const sharePriceResearch =
    typeof protocol === 'object' &&
    protocol.accountingBasis === 'raw-events' &&
    protocol.marketRuleResearch === 'raw-prices-no-corporate-actions-v1' &&
    protocol.history.basis === 'fixed-provider-snapshot' &&
    protocol.priceBasis.quantityBasis === 'actual-units' &&
    (routeKey.market === 'US' || (routeKey.market === 'HK' && symbol === '00147.HK' &&
      response.provenance.providerId === 'yfinance' && response.provenance.upstreamSource === 'yahoo-hk-share-window')) && routeKey.assetType === 'STOCK' &&
    routeKey.timeframe === '1d' && routeKey.adjustment === 'none';
  if (
    response.bars.some(
      (point) =>
        point.volume === null ||
        (accountingBasis !== 'normalized-series' && !sharePriceResearch && point.amount === null),
    )
  )
    throw new Error(`回测执行行情缺少成交量或成交额: ${symbol}`);
  return response.bars.map((point) => ({
    kind: 'market-bar-v3',
    purpose: 'execution',
    symbol,
    market: routeKey.market,
    assetType: routeKey.assetType,
    timeframe: routeKey.timeframe,
    adjustment: routeKey.adjustment,
    occurredAt: point.timestamp,
    availableAt: point.availableAt,
    open: String(point.open),
    high: String(point.high),
    low: String(point.low),
    close: String(point.close),
    volume: String(point.volume),
    amount: point.amount === null ? null : String(point.amount),
    providerId: response.provenance.providerId,
    upstreamSource: response.provenance.upstreamSource,
    routeIndex: response.provenance.routeIndex,
    effectivePolicyRevision: response.provenance.effectivePolicyRevision,
    inputFingerprint: response.inputFingerprint,
    completionStatus: point.completionStatus,
    quality: 'complete',
  }));
}
