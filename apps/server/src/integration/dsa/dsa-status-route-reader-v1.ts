import { isDeepStrictEqual } from 'node:util';
import {
  correlateStatusCapabilityV1, effectiveProviderPolicyV3Schema, marketRouteKeyIdV3,
  statusCapabilityRequestV1Schema,
  type EffectiveProviderPolicyV3, type StatusCapabilityRequestV1, type StatusCapabilityResultV1,
} from '@thesis-ledger/schemas';
import { DsaV3ProtocolError, type DsaV3ErrorCode } from './dsa-v3-protocol.js';

type UnpinnedRequest<T> = T extends StatusCapabilityRequestV1 ? Omit<T, 'routeTarget' | 'policyRevision'> : never;
export type RoutedStatusRequestV1 = UnpinnedRequest<StatusCapabilityRequestV1>;
export type StatusPolicyReadV1 = () => Promise<EffectiveProviderPolicyV3 | null>;
type TargetRead = (request: StatusCapabilityRequestV1) => Promise<StatusCapabilityResultV1>;
type Attempt = { target: StatusCapabilityRequestV1['routeTarget']; error: DsaV3ErrorCode | null };
export type RoutedStatusResultV1 = {
  outcome: 'complete' | 'partial' | 'observed'; result: StatusCapabilityResultV1; attempts: Attempt[];
};

const recoverable = new Set<DsaV3ErrorCode>(['timeout', 'unavailable', 'unsupported-capability',
  'insufficient-coverage', 'source-symbol-unrecognized', 'permission-denied', 'source-authentication-failed']);

function routeIn(policy: EffectiveProviderPolicyV3, input: RoutedStatusRequestV1) {
  return policy.routes.find((item) => marketRouteKeyIdV3(item.key) === marketRouteKeyIdV3(input.routeKey));
}
async function assertCurrent(policy: EffectiveProviderPolicyV3, input: RoutedStatusRequestV1, read: StatusPolicyReadV1) {
  const parsed = effectiveProviderPolicyV3Schema.safeParse(await read());
  if (!parsed.success) throw new DsaV3ProtocolError('独立功能有效政策已失效', 'stale-revision');
  const current = parsed.data;
  if (!isDeepStrictEqual({ revision: policy.revision, sourceDesiredRevision: policy.sourceDesiredRevision,
    enabled: policy.enabled, route: routeIn(policy, input) }, { revision: current.revision,
    sourceDesiredRevision: current.sourceDesiredRevision, enabled: current.enabled, route: routeIn(current, input) })) {
    throw new DsaV3ProtocolError('独立功能读取期间有效政策已变化', 'stale-revision');
  }
}

/** Server 唯一切源边界；DSA 每次只收到一个人工选择的精确目标。 */
export async function readStatusRouteV1(input: RoutedStatusRequestV1, readPolicy: StatusPolicyReadV1, readTarget: TargetRead): Promise<RoutedStatusResultV1> {
  const parsed = effectiveProviderPolicyV3Schema.safeParse(await readPolicy());
  if (!parsed.success) throw new DsaV3ProtocolError('独立功能有效政策不可用', 'control-rejected');
  const policy = parsed.data;
  const route = routeIn(policy, input);
  if (!policy.enabled || !route || route.enabled === false) {
    throw new DsaV3ProtocolError('独立功能尚未启用', 'control-rejected');
  }
  const attempts: Attempt[] = [];
  for (const target of route.targets) {
    if (!target.eligible) continue;
    const request = statusCapabilityRequestV1Schema.parse({ ...input, policyRevision: policy.revision,
      routeTarget: { providerId: target.providerId, upstreamSource: target.upstreamSource, routeIndex: target.routeIndex } });
    let result: StatusCapabilityResultV1;
    try {
      result = correlateStatusCapabilityV1(request, await readTarget(request));
    } catch (error) {
      await assertCurrent(policy, input, readPolicy);
      if (!(error instanceof DsaV3ProtocolError) || !recoverable.has(error.code)) throw error;
      attempts.push({ target: request.routeTarget, error: error.code });
      continue;
    }
    await assertCurrent(policy, input, readPolicy);
    attempts.push({ target: request.routeTarget, error: null });
    let outcome: RoutedStatusResultV1['outcome'] = 'observed';
    if ('coverage' in result) outcome = result.coverage.complete ? 'complete' : 'partial';
    return { outcome, result, attempts };
  }
  throw new DsaV3ProtocolError('已选独立功能目标未取得本次数据', 'unavailable');
}
