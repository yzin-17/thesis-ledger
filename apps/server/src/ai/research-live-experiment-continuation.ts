import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { aiInvocationFactSchema } from '@thesis-ledger/schemas';
import { experimentFingerprint } from './research-experiment-protocol.js';
import type { LiveArmResult } from './research-live-experiment-arm.js';
import type {
  LiveExperimentProtocol,
  LiveExperimentHistory,
} from './research-live-experiment-protocol.js';
import { verifyLiveExperimentHistory } from './research-live-experiment-resume.js';

export interface LiveRateLimitContinuation {
  sourceProtocolFingerprint: string;
  caseId: string;
  single: LiveArmResult;
  staged: LiveArmResult;
  historicalBudget: LiveExperimentHistory;
  realRequestsTotal: number;
}

export function verifyFirstRateLimitContinuation(
  protocol: LiveExperimentProtocol,
  source: LiveRateLimitContinuation,
) {
  assertRateLimitContinuationProtocol(protocol, source);
  assertRateLimitArmStates(source);
  const { single } = source;
  assertRateLimitRequestAudit(single);
  const initial = verifyLiveExperimentHistory(protocol, source.historicalBudget);
  if (initial.requests + 1 !== source.realRequestsTotal)
    throw new Error('原单链与跨协议累计请求数不符');
  const reserved = new Prisma.Decimal(protocol.budget.maxInputTokensPerArm)
    .mul(protocol.pricing.costPer1kInput)
    .plus(
      new Prisma.Decimal(protocol.budget.maxOutputTokensPerArm).mul(
        protocol.pricing.costPer1kOutput,
      ),
    )
    .div(1000);
  return {
    completed: new Map([[source.caseId + ':single', single]]),
    initial: {
      amount: new Prisma.Decimal(initial.amount).plus(reserved).toFixed(),
      reservedUnknown: new Prisma.Decimal(initial.reservedUnknown).plus(reserved).toFixed(),
      requests: source.realRequestsTotal,
    },
    unresolved: [],
    historicalBudget: source.historicalBudget,
  };
}

function assertRateLimitContinuationProtocol(
  protocol: LiveExperimentProtocol,
  source: LiveRateLimitContinuation,
) {
  const freeProtocol =
    protocol.version === 'research-live-experiment-v3' &&
    protocol.model.id.endsWith(':free') &&
    protocol.pricing.costPer1kInput === 0 &&
    protocol.pricing.costPer1kOutput === 0;
  const cloudflareProtocol =
    protocol.version === 'research-live-experiment-v4' &&
    protocol.model.providerId === 'cloudflare' &&
    protocol.budget.authorizedCalls === 68 &&
    source.historicalBudget.requests === 48 &&
    source.realRequestsTotal === 49;
  if (
    (!freeProtocol && !cloudflareProtocol) ||
    source.sourceProtocolFingerprint !== experimentFingerprint(protocol) ||
    !('caseIds' in protocol) ||
    source.caseId !== protocol.caseIds[0]
  )
    throw new Error('只接续同一免费协议或获准Cloudflare五例的首例429终态');
}

function assertRateLimitArmStates(source: LiveRateLimitContinuation) {
  const { single, staged } = source;
  if (
    single.status !== 'failed' ||
    single.reason !== 'provider_rejected' ||
    single.requests.length !== 1 ||
    single.output !== null ||
    single.grade !== null ||
    single.scoreChecks.length !== 0 ||
    single.criticalViolations !== 0 ||
    single.actualCost !== null ||
    single.estimatedCost !== 0 ||
    !Number.isFinite(single.durationMs) ||
    single.durationMs < 0 ||
    staged.status !== 'blocked' ||
    staged.reason !== 'unknown_outcome' ||
    staged.requests.length !== 0 ||
    staged.output !== null ||
    staged.grade !== null ||
    staged.scoreChecks.length !== 0 ||
    staged.criticalViolations !== 0
  )
    throw new Error('原失败或未派发事实被修改');
}

function assertRateLimitRequestAudit(single: LiveRateLimitContinuation['single']) {
  const request = single.requests[0]!;
  z.uuid().parse(request.requestId);
  const facts = request.facts.map((fact) => aiInvocationFactSchema.parse(fact));
  const first = facts[0];
  const last = facts[1];
  if (
    request.stage !== 'single' ||
    !/^[a-f0-9]{64}$/.test(request.inputFingerprint) ||
    facts.length !== 2 ||
    first?.kind !== 'dispatching' ||
    first.cost.status !== 'unknown' ||
    last?.kind !== 'unknown' ||
    last.errorCode !== 'provider_rejected' ||
    last.actualModel !== null ||
    last.outputFingerprint !== null ||
    last.cost.status !== 'unknown' ||
    last.usage?.status !== 'unknown' ||
    last.usage.inputTokens !== null ||
    last.usage.outputTokens !== null ||
    first.eventKey === last.eventKey
  )
    throw new Error('原单链请求缺少精确未知审计');
}
