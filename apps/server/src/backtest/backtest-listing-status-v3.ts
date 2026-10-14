import {
  compareMarketPitEvidenceInstantStringsV1,
  tradingStatusExtendedFreezeVersionV3,
  tradingStatusLifecycleFreezeVersionV3,
  type MarketTradingStatusResponseV3,
  type RunConfigV3,
} from '@thesis-ledger/schemas';

export function extendedStatusFreezeVersion(response: MarketTradingStatusResponseV3) {
  if (response.days.some((day) => day.listingPhase || day.noDailyPriceLimit))
    return { freezeVersion: tradingStatusLifecycleFreezeVersionV3 };
  if (response.days.some((day) => day.riskWarning || day.dailyPriceLimit || day.intradayHalts))
    return { freezeVersion: tradingStatusExtendedFreezeVersionV3 };
  return {};
}

export function validateListingStatusV3(config: RunConfigV3, response: MarketTradingStatusResponseV3) {
  for (const day of response.days) {
    if (!day.listingPhase && !day.noDailyPriceLimit) continue;
    for (const id of day.sourceDocumentIds ?? []) {
      const doc = response.sourceDocuments.find((item) => item.id === id);
      const order = doc?.observedAt ? compareMarketPitEvidenceInstantStringsV1(doc.observedAt, config.dataAsOf) : undefined;
      if (!doc?.sha256 || !doc.observedAt || order === undefined || order > 0)
        throw new Error('上市阶段缺少原件摘要或核验时钟晚于冻结截点');
    }
  }
}

/** 上市资格与全天停牌是独立事实；执行视图统一禁止交易所成交。 */
export function listingForbidsExchangeTrade(day: MarketTradingStatusResponseV3['days'][number]) {
  return day.listingPhase === 'notListed' || day.listingPhase === 'delisted';
}
