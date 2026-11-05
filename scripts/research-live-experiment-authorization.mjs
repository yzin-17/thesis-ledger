import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../apps/server/package.json', import.meta.url));
const { Prisma } = require('@prisma/client');

export function assertExperimentAuthorization(
  protocol,
  initial,
  checkpoint,
  continuationSource = null,
  historySource = null,
) {
  if (
    !checkpoint ||
    !Number.isSafeInteger(checkpoint.authorizedModelRequestsTotal) ||
    protocol.budget.authorizedCalls === null ||
    protocol.budget.authorizedCalls > checkpoint.authorizedModelRequestsTotal ||
    new Prisma.Decimal(protocol.budget.maxCost).gt(checkpoint.authorizedCostUSD)
  )
    throw new Error('缺少足够的累计次数/费用授权，旧无限次数协议不能派发');
  if (protocol.version === 'research-live-experiment-v5') {
    const authorization = checkpoint.cloudflareOptimizationAuthorization;
    if (
      initial.requests !== 50 ||
      authorization?.providerId !== protocol.model.providerId ||
      authorization.model !== protocol.model.id ||
      authorization.modelRevision !== protocol.model.revision ||
      authorization.initialLocalAttempts !== initial.requests ||
      authorization.maxNewRequests !== 18 ||
      authorization.maxCumulativeRequests !== protocol.budget.authorizedCalls ||
      authorization.cumulativeCostCapUSD !== protocol.budget.maxCost ||
      authorization.outputTokenLimit !== protocol.budget.outputTokenLimit ||
      authorization.modelContextTokens !== protocol.budget.modelContextTokens ||
      authorization.reasoningEffort !== protocol.reasoningEffort ||
      authorization.failurePolicy !== protocol.failurePolicy ||
      initial.requests + authorization.maxNewRequests !== protocol.budget.authorizedCalls ||
      continuationSource ||
      !historySource
    )
      throw new Error('优化协议缺少当前纠正授权或50次起点/剩余18次/输出策略不符');
    assert.deepEqual(protocol.caseIds, authorization.caseIds, '优化案例漂移');
    assert.deepEqual(protocol.pricing, authorization.pricing, '优化费率漂移');
    assert.deepEqual(historySource, authorization.historySource, '优化前的累计来源漂移');
    return;
  }
  if (protocol.version !== 'research-live-experiment-v4') return;
  const authorization = checkpoint.cloudflareScreeningAuthorization;
  if (
    authorization?.providerId !== 'cloudflare' ||
    authorization.model !== protocol.model.id ||
    authorization.modelRevision !== protocol.model.revision ||
    authorization.initialLocalAttempts !== 48 ||
    authorization.maxNewRequests !== 20 ||
    authorization.maxCumulativeRequests !== 68 ||
    protocol.budget.authorizedCalls !== authorization.maxCumulativeRequests ||
    authorization.cumulativeCostCapUSD !== protocol.budget.maxCost ||
    authorization.initialLocalAttempts + authorization.maxNewRequests >
      authorization.maxCumulativeRequests
  )
    throw new Error('Cloudflare五例范围或48次累计起点与本次授权不符');
  assert.deepEqual(protocol.caseIds, authorization.caseIds, '获准五例或顺序漂移');
  assert.deepEqual(protocol.pricing, authorization.pricing, '获准费率漂移');
  if (initial.requests === authorization.initialLocalAttempts && !continuationSource) return;
  const continuation = checkpoint.cloudflareContinuationAuthorization;
  if (
    initial.requests !== 49 ||
    continuation?.providerId !== 'cloudflare' ||
    continuation.model !== protocol.model.id ||
    continuation.initialLocalAttempts !== initial.requests ||
    continuation.maxNewRequests !== 19 ||
    continuation.maxCumulativeRequests !== protocol.budget.authorizedCalls ||
    continuation.cumulativeCostCapUSD !== protocol.budget.maxCost ||
    continuation.retainFailedSingle !== true ||
    continuation.firstNewStage !== 'organize' ||
    continuation.stopOnAnyNewFailure !== true ||
    initial.requests + continuation.maxNewRequests !== protocol.budget.authorizedCalls ||
    !continuationSource
  )
    throw new Error('缺少Cloudflare首429后的明确续接授权或19次边界漂移');
  assert.deepEqual(continuationSource, continuation.sourceProof, '获准续接来源及摘要漂移');
  assert.deepEqual(protocol.caseIds, continuation.caseIds, '获准续接案例漂移');
}
