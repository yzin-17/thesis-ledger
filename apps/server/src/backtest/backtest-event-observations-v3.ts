import { randomUUID } from 'node:crypto';
import type { MarketEventRequestV3 } from '@thesis-ledger/schemas';
import type { DsaClient } from '../integration/dsa/dsa.client.js';
import { selectMarketEventV3, type MarketEventSelectionV3 } from '../market/market-event-selector-v3.js';
import type { BacktestEventDependency } from './backtest-dependency-plan.js';
import { planBacktestEventRequestsV3 } from './backtest-event-requests-v3.js';

type EventScope = Omit<MarketEventRequestV3, 'routeTarget'>;
type EventDsa = Pick<DsaClient, 'effectiveControlPolicyV3' | 'marketRouteCatalogV3' | 'marketEventsV3'>;
type EventObservation = { scope: EventScope; result: MarketEventSelectionV3 };
export type BacktestEventObservationsV3 = {
  /** 每个能力的完整 exchange 留存，不能用合并事实取代。 */
  observations: readonly EventObservation[];
  status: 'unavailable' | 'incomplete' | 'complete' | 'not-required';
};

/** 共享 exchange 合同核验完整覆盖引用及准入快照，冻结仍保留各能力原始证据。 */
export async function readBacktestEventObservationsV3(
  identity: Parameters<typeof planBacktestEventRequestsV3>[0],
  dependencies: readonly BacktestEventDependency[],
  dsa: EventDsa,
): Promise<BacktestEventObservationsV3> {
  const scopes = planBacktestEventRequestsV3(identity, dependencies, () => randomUUID());
  if (scopes.length === 0) return { status: 'not-required', observations: [] };
  const [effective, catalog] = await Promise.allSettled([
    dsa.effectiveControlPolicyV3(), dsa.marketRouteCatalogV3(),
  ]);
  if (effective.status === 'rejected' || catalog.status === 'rejected') {
    const reason = effective.status === 'rejected' ? 'policy_mismatch' : 'catalog_unavailable';
    return {
      status: 'unavailable',
      observations: scopes.map((scope) => ({ scope, result: { status: 'unavailable', reason } })),
    };
  }
  const observations = await Promise.all(scopes.map(async (scope) => ({
    scope,
    result: await selectMarketEventV3({
      scope,
      effective: effective.value.projection?.effective ?? null,
      catalog: catalog.value,
      read: (request) => dsa.marketEventsV3(request),
    }),
  })));
  if (observations.some(({ result }) => result.status === 'unavailable')) {
    return { status: 'unavailable', observations };
  }
  if (observations.some(({ result }) => result.status === 'observed' && !result.response.coverage.complete)) {
    return { status: 'incomplete', observations };
  }
  return { status: 'complete', observations };
}
