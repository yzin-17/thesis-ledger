import {
  compareMarketPitEvidenceInstantStringsV1,
  effectiveProviderPolicyV3Schema,
  marketEventExchangeV3Schema,
  marketEventAdmissionCatalogV3Schema,
  marketEventRequestV3Schema,
  marketRouteCatalogV3Schema,
  marketRouteKeyIdV3,
  marketSplitAcquisitionClockV3Schema,
  marketSplitAcquisitionV3Schema,
  type MarketEventRequestV3,
  type MarketEventResponseV3,
  type MarketSplitAcquisitionV3,
  type MarketSplitAcquisitionClockV3,
} from '@thesis-ledger/schemas';
import {
  selectMarketEventV3,
  type MarketEventSelectionInputV3,
  type MarketEventSelectionV3,
} from './market-event-selector-v3.js';
import { verifySplitMappingV3 } from './market-split-mapping-v3.js';

type Exchange = { request: MarketEventRequestV3; response: MarketEventResponseV3 };
type Unavailable = Extract<MarketEventSelectionV3, { status: 'unavailable' }>;
export type MarketSplitAcquisitionSelectionV3 =
  | (Exchange & { status: 'observed'; acquisition: MarketSplitAcquisitionV3 })
  | (Omit<Unavailable, 'reason'> & {
      reason: Unavailable['reason'] | 'unsupported_source' | 'clock_invalid' | 'clock_expired'
        | 'control_changed' | 'control_unverified';
      exchange?: Exchange;
    });

function planAcquisitionClock(intent: MarketEventRequestV3, readTimeoutMs: number, now: () => string) {
  const startedAt = now();
  const clock = marketSplitAcquisitionClockV3Schema.parse({
    mode: 'after-acquisition', readTimeoutMs, startedAt,
    readDeadlineAt: new Date(Date.parse(startedAt) + readTimeoutMs).toISOString(),
    completedAt: startedAt, finalDataAsOf: startedAt,
  });
  const order = compareMarketPitEvidenceInstantStringsV1(intent.dataAsOf, startedAt);
  if (order === undefined || order > 0) throw new Error('原意图截止晚于采集开始');
  return clock;
}

function prepareControlState(options: { effective: unknown; catalog: unknown; admissions?: unknown }) {
  const effective = effectiveProviderPolicyV3Schema.safeParse(options.effective);
  const catalog = marketRouteCatalogV3Schema.safeParse(options.catalog);
  if (!effective.success) return { status: 'unavailable', reason: 'policy_mismatch' } as const;
  if (!catalog.success) return { status: 'unavailable', reason: 'catalog_unavailable' } as const;
  const view = marketEventAdmissionCatalogV3Schema.safeParse({
    protocolVersion: 'event-admission-catalog-v1', catalog: catalog.data, admissions: options.admissions,
  });
  if (!view.success) return { status: 'unavailable', reason: 'control_unverified' } as const;
  return { status: 'ready', state: { effective: effective.data, catalog: catalog.data, admissions: view.data.admissions } } as const;
}

/** 显式投影完成截止；原deadline交换在acquisition内保留，覆盖未知保持。 */
export function consumeMarketSplitAcquisitionV3(value: unknown): Exchange {
  try {
    const acquisition = marketSplitAcquisitionV3Schema.parse(value);
    verifySplitMappingV3(acquisition.exchange.response);
    const request = { ...acquisition.intent, dataAsOf: acquisition.clock.finalDataAsOf };
    const exchange = marketEventExchangeV3Schema.parse({
      request,
      response: { ...acquisition.exchange.response, ...request },
    });
    verifySplitMappingV3(exchange.response);
    return exchange;
  } catch {
    throw new Error('拆分采集信封、原文或消费关联无效');
  }
}

function postControlStatus(
  before: { effective: unknown; catalog: unknown; admissions?: unknown },
  after: { effective: unknown; catalog: unknown; admissions?: unknown },
  request: MarketEventRequestV3,
): 'unchanged' | 'changed' | 'unverified' {
  if (!after || typeof after !== 'object') return 'unverified';
  const policies = [before, after].map((state) => effectiveProviderPolicyV3Schema.safeParse(state.effective));
  const views = [before, after].map((state) => marketEventAdmissionCatalogV3Schema.safeParse({
    protocolVersion: 'event-admission-catalog-v1', catalog: state.catalog, admissions: state.admissions,
  }));
  if (!policies[0]?.success || !policies[1]?.success || !views[0]?.success || !views[1]?.success) return 'unverified';
  const current = [views[0].data, views[1].data].map((view) => view.admissions.find((record) =>
    marketRouteKeyIdV3(record.routeKey) === marketRouteKeyIdV3(request.routeKey)
    && record.target.providerId === request.routeTarget.providerId
    && record.target.upstreamSource === request.routeTarget.upstreamSource));
  if (!current[0] || !current[1] || JSON.stringify(current[0]) !== JSON.stringify(current[1])) return 'changed';
  // appliedAt是只读投影的观察时刻；完整验证并保留原值，比较其余稳定控制身份。
  const identities = policies.map((policy) => ({ ...policy.data, appliedAt: undefined }));
  if (JSON.stringify(identities[0]) !== JSON.stringify(identities[1])
    || views[0].data.catalog.catalogRevision !== views[1].data.catalog.catalogRevision
    || views[1].data.catalog.integrity !== 'complete') return 'changed';
  const ready = views[1].data.catalog.entries.some((entry) =>
    marketRouteKeyIdV3(entry.key) === marketRouteKeyIdV3(request.routeKey)
    && entry.target.providerId === request.routeTarget.providerId
    && entry.target.upstreamSource === request.routeTarget.upstreamSource
    && entry.state === 'ready');
  return ready ? 'unchanged' : 'changed';
}

/** 仅执行一次原selector数据读取；只读后置控制端口不签发或改政策。 */
export async function acquireMarketSplitAfterAcquisitionV3(
  options: MarketEventSelectionInputV3 & {
    mode: 'after-acquisition';
    readTimeoutMs: number;
    admissions?: unknown;
    readStateAfter: () => Promise<{ effective: unknown; catalog: unknown; admissions?: unknown }>;
    now?: () => string;
  },
): Promise<MarketSplitAcquisitionSelectionV3> {
  if (options.mode !== 'after-acquisition') return { status: 'unavailable', reason: 'invalid_input' };
  const intent = marketEventRequestV3Schema.safeParse({
    ...options.scope, routeTarget: { providerId: 'akshare', upstreamSource: 'eastmoney', routeIndex: 0 },
  });
  if (!intent.success || intent.data.routeKey.kind !== 'data' || intent.data.routeKey.market !== 'CN'
    || intent.data.routeKey.assetType !== 'ETF' || intent.data.routeKey.capability !== 'SPLIT_EVENT')
    return { status: 'unavailable', reason: 'invalid_input' };
  const scope: MarketEventSelectionInputV3['scope'] = { ...intent.data };
  Reflect.deleteProperty(scope, 'routeTarget');
  const now = options.now ?? (() => new Date().toISOString());
  let clock: MarketSplitAcquisitionClockV3;
  try {
    clock = planAcquisitionClock(intent.data, options.readTimeoutMs, now);
  } catch {
    return { status: 'unavailable', reason: 'clock_invalid' };
  }
  const controlPlan = prepareControlState(options);
  if (controlPlan.status !== 'ready') return controlPlan;
  const before = controlPlan.state;
  let guardFailure: 'unsupported_source' | 'clock_invalid' | 'clock_expired' | 'control_unverified' | 'not_admitted' | undefined;
  const selection = await selectMarketEventV3({
    scope: { ...scope, dataAsOf: clock.readDeadlineAt },
    ...before,
    read: async (request) => {
      if (request.routeTarget.providerId !== 'akshare' || request.routeTarget.upstreamSource !== 'eastmoney')
        guardFailure = 'unsupported_source';
      const admission = before.admissions.find((record) => marketRouteKeyIdV3(record.routeKey) === marketRouteKeyIdV3(request.routeKey)
        && record.target.providerId === request.routeTarget.providerId && record.target.upstreamSource === request.routeTarget.upstreamSource);
      if (!admission) guardFailure = 'control_unverified';
      else if (!admission.scopeSymbols.includes(request.symbol) || admission.scopeDateFrom > request.start || admission.scopeDateTo < request.end)
        guardFailure = 'not_admitted';
      try {
        const instant = now();
        const start = compareMarketPitEvidenceInstantStringsV1(clock.startedAt, instant);
        const deadline = compareMarketPitEvidenceInstantStringsV1(instant, clock.readDeadlineAt);
        if (start === undefined || start > 0 || deadline === undefined) guardFailure = 'clock_invalid';
        else if (deadline >= 0) guardFailure = 'clock_expired';
      } catch {
        guardFailure = 'clock_invalid';
      }
      if (guardFailure) throw new Error('拆分采集前置围栏拒绝');
      return options.read(structuredClone(request));
    },
  });
  if (selection.status !== 'observed') {
    if (guardFailure) return { ...selection, reason: guardFailure };
    return selection;
  }
  const exchange = { request: selection.request, response: selection.response };
  let after;
  try {
    after = await options.readStateAfter();
  } catch {
    return { status: 'unavailable', reason: 'control_unverified', request: exchange.request, exchange };
  }
  try {
    const completedAt = now();
    const deadline = compareMarketPitEvidenceInstantStringsV1(completedAt, clock.readDeadlineAt);
    if (deadline !== undefined && deadline >= 0)
      return { status: 'unavailable', reason: 'clock_expired', request: exchange.request, exchange };
    clock = marketSplitAcquisitionClockV3Schema.parse({ ...clock, completedAt, finalDataAsOf: completedAt });
  } catch {
    return { status: 'unavailable', reason: 'clock_invalid', request: exchange.request, exchange };
  }
  const control = postControlStatus(before, after, exchange.request);
  if (control !== 'unchanged') {
    const reason = control === 'unverified' ? 'control_unverified' : 'control_changed';
    return { status: 'unavailable', reason, request: exchange.request, exchange };
  }
  try {
    const afterView = marketEventAdmissionCatalogV3Schema.parse({
      protocolVersion: 'event-admission-catalog-v1', catalog: after.catalog, admissions: after.admissions,
    });
    const admissionForTarget = (records: typeof before.admissions) => records.find((record) =>
      marketRouteKeyIdV3(record.routeKey) === marketRouteKeyIdV3(exchange.request.routeKey)
      && record.target.providerId === exchange.request.routeTarget.providerId
      && record.target.upstreamSource === exchange.request.routeTarget.upstreamSource);
    const acquisition = marketSplitAcquisitionV3Schema.parse({
      version: 'eastmoney-split-acquisition-v1', clock, exchange,
      intent: { ...intent.data, routeTarget: { ...exchange.request.routeTarget } },
      admissionSnapshots: { before: admissionForTarget(before.admissions), after: admissionForTarget(afterView.admissions) },
    });
    return { status: 'observed', acquisition, ...consumeMarketSplitAcquisitionV3(acquisition) };
  } catch {
    return { status: 'unavailable', reason: 'invalid_response', request: exchange.request, exchange };
  }
}
