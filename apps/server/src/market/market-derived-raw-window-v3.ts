import {
  marketDataBarSeriesRequestResponseV3Schema,
  marketFrozenWindowRefV3Schema,
  type MarketFrozenWindowRefV3,
} from '@thesis-ledger/schemas';
import type { FrozenMarketWindowV3 } from './market-frozen-window-view-v3.js';
import { marketFrozenWindowHashV3 } from './market-frozen-window-v3.js';
import type { MarketDerivedSeriesInputV3 } from './market-derived-series-v3.js';
import { freezeMarketDerivedSeriesV3 } from './market-derived-series-snapshot-v3.js';
import { compareDerivedInstantV3, latestDerivedInstantV3 } from './market-derived-instant-v3.js';

/** 转换证据必须绑定同一份完整 raw 响应；调用方另行核验其准入及撤销状态。 */
export function freezeDerivedRawWindowV3(
  frozen: FrozenMarketWindowV3,
  reference: MarketFrozenWindowRefV3,
  conversion: MarketDerivedSeriesInputV3['conversion'] & { rawResponseHash: string },
  dataAsOf: string,
) {
  const ref = marketFrozenWindowRefV3Schema.parse(reference);
  const { rawResponseHash, ...factors } = conversion;
  if (
    ref.identityFingerprint !== frozen.evidence.identityFingerprint ||
    ref.responseHash !== frozen.completeResponseHash ||
    rawResponseHash !== ref.responseHash ||
    marketFrozenWindowHashV3(frozen.response) !== ref.responseHash
  )
    throw new Error('派生转换证据未绑定同一完整 raw 窗口');
  const { response } = marketDataBarSeriesRequestResponseV3Schema.parse({
    request: frozen.request,
    response: frozen.response,
  });
  if (
    response.routeKey.adjustment !== 'none' ||
    response.sourcePriceBasis.adjustment !== 'none' ||
    response.sourcePriceBasis.method !== 'provider-native' ||
    response.sourcePriceBasis.volumeBasis !== 'original'
  )
    throw new Error('派生输入必须为已冻结的原生 raw 价格和原始成交量');
  const fetchedAt = frozen.evidence.fetchedAt.getTime();
  if (
    !Number.isFinite(fetchedAt) ||
    compareDerivedInstantV3(response.sourcePriceBasis.observedAt, dataAsOf) > 0 ||
    compareDerivedInstantV3(frozen.evidence.fetchedAt.toISOString(), dataAsOf) > 0
  )
    throw new Error('冻结 raw 来源观测晚于派生截点');
  return freezeMarketDerivedSeriesV3({
    identity: {
      symbol: response.symbol,
      assetType: response.routeKey.assetType,
      timeframe: response.routeKey.timeframe,
      adjustment: 'none',
    },
    rawEvidenceRef: `${ref.identityFingerprint}:${ref.responseHash}`,
    dataAsOf,
    bars: response.bars.map((bar) => ({
      ...bar,
      availableAt: latestDerivedInstantV3([
        bar.availableAt,
        response.sourcePriceBasis.observedAt,
        frozen.evidence.fetchedAt.toISOString(),
      ]),
    })),
    conversion: factors,
  });
}
