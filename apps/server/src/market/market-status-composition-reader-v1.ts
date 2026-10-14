import { isDeepStrictEqual } from 'node:util';
import {
  effectiveProviderPolicyV3Schema,
  marketStatusCompositionV1Schema,
  statusCapabilityRequestV1Schema,
  statusCompositionDemandV1Schema,
  type StatusCompositionDemandV1,
  type StatusCompositionEntryV1,
  type EffectiveProviderPolicyV3,
} from '@thesis-ledger/schemas';
import type { DsaDataCapabilityReaderV3 } from '../integration/dsa/dsa-data-capability-reader-v3.js';
import { DsaV3ProtocolError } from '../integration/dsa/dsa-v3-protocol.js';
import type { StatusPolicyReadV1 } from '../integration/dsa/dsa-status-route-reader-v1.js';

const sourceErrors = new Set([
  'timeout',
  'unavailable',
  'unsupported-capability',
  'insufficient-coverage',
  'source-symbol-unrecognized',
  'permission-denied',
  'source-authentication-failed',
]);

// appliedAt是DSA每次重新投影的采样时刻；冻结仍保留首份完整政策。
function policyIdentity({ appliedAt, ...identity }: EffectiveProviderPolicyV3) {
  void appliedAt;
  return identity;
}

export function sameStatusCompositionPolicyV1(
  first: EffectiveProviderPolicyV3 | null | undefined,
  second: EffectiveProviderPolicyV3 | null | undefined,
) {
  if (!first || !second) return false;
  return isDeepStrictEqual(policyIdentity(first), policyIdentity(second));
}

/** 组合只消费标准结果；原能力 Reader 仍独占每能力的主备选择。 */
export async function readMarketStatusCompositionV1(
  demands: readonly StatusCompositionDemandV1[],
  reader: Pick<DsaDataCapabilityReaderV3, 'routedStatusCapability'>,
  readPolicy: StatusPolicyReadV1,
) {
  const parsed = demands.map((demand) => statusCompositionDemandV1Schema.parse(demand));
  const policy = effectiveProviderPolicyV3Schema.parse(await readPolicy());
  // 整组输入先校验，再启动来源；placeholder 只用于结构校验，不发布为结果。
  marketStatusCompositionV1Schema.parse({
    version: 'market-status-composition-v1',
    policy,
    entries: parsed.map((demand) => ({ ...demand, status: 'failed', error: 'unavailable' })),
  });
  const entries = await Promise.all(
    parsed.map(async (demand): Promise<StatusCompositionEntryV1> => {
      try {
        const read = await reader.routedStatusCapability(demand.query);
        const request = statusCapabilityRequestV1Schema.parse({
          ...demand.query,
          routeTarget: read.result.routeTarget,
          policyRevision: read.result.policyRevision,
        });
        return { ...demand, status: 'included', request, result: read.result };
      } catch (error) {
        if (!(error instanceof DsaV3ProtocolError) || !sourceErrors.has(error.code)) throw error;
        return {
          ...demand,
          status: 'failed',
          error: error.code as Extract<StatusCompositionEntryV1, { status: 'failed' }>['error'],
        };
      }
    }),
  );
  const after = effectiveProviderPolicyV3Schema.parse(await readPolicy());
  if (!sameStatusCompositionPolicyV1(policy, after))
    throw new DsaV3ProtocolError('组合读取期间有效政策变化', 'stale-revision');
  return marketStatusCompositionV1Schema.parse({
    version: 'market-status-composition-v1',
    policy,
    entries,
  });
}
