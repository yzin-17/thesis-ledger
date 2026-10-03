import { z } from 'zod';
import {
  marketEventExchangeV3Schema,
  type BacktestCorporateActionsResponse,
} from '@thesis-ledger/schemas';
import { planBacktestEventRequestsV3 } from './backtest-event-requests-v3.js';
import { readBacktestEventObservationsV3 } from './backtest-event-observations-v3.js';
import type { BacktestEventObservationsV3 } from './backtest-event-observations-v3.js';
import {
  snapshotDependencyEvidenceRowV3,
  validateSnapshotDependencyResponseV3,
  type DependencyRequest,
  type SnapshotDependencyV3Input,
} from './backtest-snapshot-v3-dependencies.js';
import { SnapshotDependencyV3Error } from './backtest-snapshot-v3-dependency-error.js';
import { canonicalizeManifest, hashCanonicalManifest } from './backtest-snapshot.js';
import { verifySplitMappingV3 } from '../market/market-split-mapping-v3.js';
import { verifyRqdataFundIdentityV3 } from '../market/market-rqdata-identity-v3.js';
import { verifyTushareFundIdentityV3 } from '../market/market-tushare-identity-v3.js';
import { verifyHithinkFundIdentityV3 } from '../market/market-hithink-identity-v3.js';

export const snapshotEventRevisionsV3Schema = z.strictObject({
  desiredRevision: z.number().int().positive(),
  effectivePolicyRevision: z.number().int().positive(),
  catalogRevision: z.number().int().positive(),
});
export type SnapshotEventRevisionsV3 = z.infer<typeof snapshotEventRevisionsV3Schema>;
export class SnapshotEventObservationError extends SnapshotDependencyV3Error {
  constructor(readonly observations: BacktestEventObservationsV3['observations']) {
    super('event_plan_blocked', '事件能力观测不可用或覆盖不完整。');
  }
}
type EventRequest = Extract<DependencyRequest, { purpose: 'corporateActions' }>;
const bundleSchema = z.strictObject({
  kind: z.literal('snapshot-events-v3'),
  exchanges: z.array(marketEventExchangeV3Schema).min(1).max(2),
});
function fail(message: string): never {
  throw new SnapshotDependencyV3Error('event_plan_blocked', message);
}
function eventIdentity(input: SnapshotDependencyV3Input, request: EventRequest) {
  const revisions = snapshotEventRevisionsV3Schema.safeParse(input.eventRevisions);
  if (!revisions.success) return fail('Snapshot V3 事件读取缺少冻结行情版本。');
  const assetType = request.request.instrumentType;
  if (assetType !== 'STOCK' && assetType !== 'ETF')
    return fail('Snapshot V3 事件能力不支持该资产类型。');
  return {
    ...revisions.data,
    symbol: request.request.symbol,
    market: request.request.market,
    assetType,
    dataAsOf: request.request.dataAsOf,
  };
}

/** 离线重建领域投影，证据始终保存完整 V3 exchange，不持久化合成 V2 响应。 */
export function validateSnapshotEventsV3(
  input: SnapshotDependencyV3Input,
  request: EventRequest,
  value: unknown,
) {
  const parsed = bundleSchema.safeParse(value);
  if (!parsed.success) return fail('Snapshot V3 事件 exchange 或准入快照无效。');
  const bundle = parsed.data;
  const expected = planBacktestEventRequestsV3(
    eventIdentity(input, request),
    request.dependencies,
    (capability) =>
      bundle.exchanges.find((entry) => entry.request.routeKey.capability === capability)?.request
        .requestId ?? 'missing',
  );
  if (
    bundle.exchanges.length !== expected.length ||
    new Set(bundle.exchanges.map((entry) => entry.request.requestId)).size !== expected.length
  ) {
    return fail('Snapshot V3 事件能力集合重复或缺失。');
  }
  for (const [index, scope] of expected.entries()) {
    const exchange = bundle.exchanges[index]!;
    try {
      verifySplitMappingV3(exchange.response);
      verifyRqdataFundIdentityV3(exchange.response);
      verifyTushareFundIdentityV3(exchange.response);
      verifyHithinkFundIdentityV3(exchange.response);
    } catch {
      return fail('Snapshot V3 事件日期或身份映射证据无效。');
    }
    const actualScope = Object.fromEntries(
      Object.entries(exchange.request).filter(([key]) => key !== 'routeTarget'),
    );
    if (
      canonicalizeManifest(scope) !== canonicalizeManifest(actualScope) ||
      !exchange.response.coverage.complete
    ) {
      return fail('Snapshot V3 事件范围、版本或覆盖不满足依赖计划。');
    }
  }
  const response: BacktestCorporateActionsResponse = {
    version: 3,
    status: 'supported',
    provider: 'event-v3-composite',
    providerRevision: hashCanonicalManifest(bundle),
    coverage: { ...request.range, complete: true },
    facts: bundle.exchanges.flatMap((exchange) => exchange.response.facts),
  };
  const validated = validateSnapshotDependencyResponseV3(input, request, response);
  const evidence = {
    ...snapshotDependencyEvidenceRowV3(request, response, validated.facts, validated.rows),
    response: canonicalizeManifest(bundle),
  };
  return { response, rows: validated.rows, evidence };
}

export async function collectSnapshotEventsV3(
  input: SnapshotDependencyV3Input,
  request: EventRequest,
  dsa: Parameters<typeof readBacktestEventObservationsV3>[2],
) {
  const result = await readBacktestEventObservationsV3(
    eventIdentity(input, request),
    request.dependencies,
    dsa,
  );
  if (result.status !== 'complete') throw new SnapshotEventObservationError(result.observations);
  const exchanges = result.observations.map(({ result: observation }) => {
    if (observation.status !== 'observed') return fail('Snapshot V3 缺少事件观测。');
    return { request: observation.request, response: observation.response };
  });
  return validateSnapshotEventsV3(input, request, { kind: 'snapshot-events-v3', exchanges });
}
