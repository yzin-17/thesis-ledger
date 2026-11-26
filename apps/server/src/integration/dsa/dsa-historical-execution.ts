import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';
import {
  correlateHistoricalExecution, effectiveProviderPolicyV3Schema, historicalExecutionCapability,
  historicalExecutionRequestSchema, marketRouteKeyIdV3,
  type EffectiveProviderPolicyV3, type HistoricalExecutionRequest,
} from '@thesis-ledger/schemas';
import { DsaV3ProtocolError } from './dsa-v3-protocol.js';

type Input = Pick<HistoricalExecutionRequest, 'symbol' | 'asOf'> & {
  assetType: 'STOCK' | 'ETF'; purpose?: HistoricalExecutionRequest['purpose'];
};
type Policy = () => Promise<EffectiveProviderPolicyV3 | null>;

/** 新能力须明确启用；缺省保留旧路径，启用后的缺录不能回退掩盖。 */
export async function readHistoricalExecution(
  input: Input, readPolicy: Policy, post: (path: string, body: HistoricalExecutionRequest) => Promise<unknown>,
) {
  const policy = effectiveProviderPolicyV3Schema.parse(await readPolicy());
  const key = { kind: 'data', market: 'CN', assetType: input.assetType, capability: historicalExecutionCapability } as const;
  const route = policy.routes.find(r => marketRouteKeyIdV3(r.key) === marketRouteKeyIdV3(key));
  if (!route || route.enabled === false) return null;
  if (!policy.enabled || route.enabled !== true) throw new DsaV3ProtocolError('历史执行能力尚未明确启用', 'control-rejected');
  const target = route.targets.find(t => t.eligible);
  if (!target) throw new DsaV3ProtocolError('历史执行能力没有合格目标', 'unavailable');
  const request = historicalExecutionRequestSchema.parse({ contractVersion: 1, consumer: 'thesis-ledger',
    requestId: randomUUID(), routeKey: key, policyRevision: policy.revision,
    routeTarget: { providerId: target.providerId, upstreamSource: target.upstreamSource, routeIndex: target.routeIndex },
    symbol: input.symbol, asOf: input.asOf, purpose: input.purpose ?? 'full' });
  let raw: unknown;
  let failure: unknown;
  let failed = false;
  try {
    raw = await post('/api/v1/thesis-ledger/arena/history/execution', request);
  } catch (error) {
    failed = true;
    failure = error;
  }
  const current = effectiveProviderPolicyV3Schema.safeParse(await readPolicy());
  if (!current.success || !isDeepStrictEqual(
    { revision: policy.revision, sourceDesiredRevision: policy.sourceDesiredRevision, enabled: policy.enabled, route },
    { revision: current.data.revision, sourceDesiredRevision: current.data.sourceDesiredRevision, enabled: current.data.enabled,
      route: current.data.routes.find(r => marketRouteKeyIdV3(r.key) === marketRouteKeyIdV3(key)) },
  )) throw new DsaV3ProtocolError('历史执行读取期间政策已变化', 'stale-revision');
  if (failed) throw failure;
  try { return correlateHistoricalExecution(request, raw).context; }
  catch { throw new DsaV3ProtocolError('历史执行响应无效', 'invalid-response'); }
}
