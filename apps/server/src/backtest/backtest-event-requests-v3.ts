import type { MarketEventRequestV3 } from '@thesis-ledger/schemas';
import type { BacktestEventDependency } from './backtest-dependency-plan.js';

type EventScopeV3 = Omit<MarketEventRequestV3, 'routeTarget'>;
type EventIdentityV3 = Pick<EventScopeV3,
  'symbol' | 'desiredRevision' | 'effectivePolicyRevision' | 'catalogRevision' | 'dataAsOf'> & {
    market: EventScopeV3['routeKey']['market'];
    assetType: EventScopeV3['routeKey']['assetType'];
  };

/** 调用方已按 instrument 分组；分红与拆分分别固定覆盖窗口。 */
export function planBacktestEventRequestsV3(
  identity: EventIdentityV3,
  dependencies: readonly BacktestEventDependency[],
  requestId: (capability: EventScopeV3['routeKey']['capability']) => string,
): EventScopeV3[] {
  const capabilities = ['CASH_DISTRIBUTION', 'SPLIT_EVENT'] as const;
  return capabilities.flatMap((capability) => {
    const relevant = dependencies.filter((dependency) => dependency.eventTypes.some((type) =>
      (type === 'CASH_DIVIDEND') === (capability === 'CASH_DISTRIBUTION')));
    if (relevant.length === 0) return [];
    const starts = relevant.map((dependency) => dependency.effectiveDateWindow.startDate).sort();
    const ends = relevant.map((dependency) => dependency.effectiveDateWindow.endDate).sort();
    return [{
      contractVersion: 3 as const,
      requestId: requestId(capability),
      symbol: identity.symbol,
      routeKey: { kind: 'data' as const, market: identity.market, assetType: identity.assetType, capability },
      desiredRevision: identity.desiredRevision,
      effectivePolicyRevision: identity.effectivePolicyRevision,
      catalogRevision: identity.catalogRevision,
      start: starts[0]!,
      end: ends[ends.length - 1]!,
      dataAsOf: identity.dataAsOf,
    }];
  });
}
