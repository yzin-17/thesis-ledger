import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { aiInvocationFactSchema } from '@thesis-ledger/schemas';
import { experimentFingerprint } from './research-experiment-protocol.js';
import { verifyLiveExperimentOutput, type LiveArmResult } from './research-live-experiment-arm.js';
import { scoreLiveResearchOutput } from './research-live-experiment-evaluation.js';
import {
  historyReservationLotSchema,
  matchesLiveExperimentModel,
  OPENROUTER_EXPERIMENT_NEMOTRON_MODEL,
  type LiveBenchmark,
  type LiveEvaluation,
  type LiveExperimentProtocol,
  type LiveExperimentHistory,
} from './research-live-experiment-protocol.js';
import {
  verifyFreeProbeBudget,
  type LiveSupplementalBudget,
} from './research-live-experiment-supplemental.js';

export function verifyFreshLiveExperimentBudget(
  protocol: LiveExperimentProtocol,
  history: LiveExperimentHistory,
  rawSupplemental?: LiveSupplementalBudget,
) {
  const initial = verifyLiveExperimentHistory(protocol, history);
  const supplemental = verifyFreeProbeBudget(rawSupplemental);
  initial.requests += supplemental.requests;
  if (
    (protocol.model.id === OPENROUTER_EXPERIMENT_NEMOTRON_MODEL ||
      protocol.version === 'research-live-experiment-v4') &&
    protocol.budget.authorizedCalls !== null &&
    initial.requests + 20 > protocol.budget.authorizedCalls
  )
    throw new Error('累计剩余位置不足本轮五例20次上限');
  return { initial, supplementalBudget: rawSupplemental ? supplemental.budget : null };
}

export interface LiveExperimentResume {
  sourceProtocolFingerprint: string;
  completedArms: Array<{ caseId: string; arm: 'single' | 'staged'; result: LiveArmResult }>;
  unresolvedRequests: Array<{
    caseId: string;
    arm: 'single' | 'staged';
    ordinal: number;
    requestId: null;
  }>;
}

export function verifyLiveExperimentHistory(
  protocol: LiveExperimentProtocol,
  history: LiveExperimentHistory,
) {
  const crossProvider = protocol.version !== 'research-live-experiment-v2';
  if (
    history.sourceProtocolFingerprint === experimentFingerprint(protocol) ||
    (!crossProvider &&
      experimentFingerprint(history.model) !== experimentFingerprint(protocol.model)) ||
    (!crossProvider && history.pricingFingerprint !== experimentFingerprint(protocol.pricing)) ||
    history.benchmarkFingerprint !== protocol.benchmarkFingerprint ||
    history.evaluationFingerprint !== protocol.evaluationFingerprint ||
    !/^[a-f0-9]{64}$/.test(history.sourceReportSha256) ||
    !/^[a-f0-9]{64}$/.test(history.sourceProtocolFingerprint) ||
    !Number.isInteger(history.unknownRequests) ||
    history.unknownRequests < 0 ||
    !Number.isInteger(history.requests) ||
    history.requests < history.unknownRequests
  )
    throw new Error('历史预算的协议、模型或固定集/评价不符');
  let minimum: Prisma.Decimal;
  if (crossProvider) {
    const lots = z.array(historyReservationLotSchema).max(20).parse(history.unknownReservations);
    if (lots.reduce((sum, lot) => sum + lot.unknownRequests, 0) !== history.unknownRequests)
      throw new Error('跨Provider未知请求数与原预留明细不符');
    minimum = lots.reduce(
      (sum, lot) =>
        sum.plus(
          new Prisma.Decimal(lot.maxInputTokens)
            .mul(lot.costPer1kInput)
            .plus(new Prisma.Decimal(lot.maxOutputTokens).mul(lot.costPer1kOutput))
            .div(1000)
            .mul(lot.unknownRequests),
        ),
      new Prisma.Decimal(0),
    );
  } else {
    minimum = new Prisma.Decimal(protocol.budget.maxInputTokensPerArm)
      .mul(protocol.pricing.costPer1kInput)
      .plus(
        new Prisma.Decimal(protocol.budget.maxOutputTokensPerArm).mul(
          protocol.pricing.costPer1kOutput,
        ),
      )
      .div(1000)
      .mul(history.unknownRequests);
  }
  if (new Prisma.Decimal(history.reservedUnknown).lt(minimum))
    throw new Error('历史未知费用预留不足');
  return {
    amount: history.amount,
    reservedUnknown: history.reservedUnknown,
    requests: history.requests,
  };
}

export function verifyLiveExperimentResume(
  protocol: LiveExperimentProtocol,
  benchmark: LiveBenchmark,
  evaluation: LiveEvaluation,
  resume?: LiveExperimentResume,
) {
  const completed = new Map<string, LiveArmResult>();
  let recordedCost = new Prisma.Decimal(0);
  let recordedRequests = 0;
  if (!resume)
    return {
      completed,
      initial: { amount: '0', reservedUnknown: '0', requests: 0 },
      unresolved: [],
    };
  if (resume.sourceProtocolFingerprint !== experimentFingerprint(protocol))
    throw new Error('接续协议与原封存摘要不一致');
  const ids = new Set(benchmark.cases.map((entry) => entry.id));
  for (const entry of resume.completedArms) {
    const key = entry.caseId + ':' + entry.arm;
    const value = entry.result;
    if (
      completed.has(key) ||
      !ids.has(entry.caseId) ||
      !['single', 'staged'].includes(entry.arm) ||
      value.status !== 'complete' ||
      value.reason !== null ||
      value.criticalViolations !== 0 ||
      !Number.isFinite(value.durationMs) ||
      value.durationMs < 0 ||
      !value.output ||
      value.requests.length !== (entry.arm === 'single' ? 1 : 3)
    )
      throw new Error('只复用已完成且身份精确的实验组');
    const sample = benchmark.cases.find((item) => item.id === entry.caseId)!;
    verifyLiveExperimentOutput(sample, value.output, protocol, Date.now());
    const score = scoreLiveResearchOutput(
      value.output,
      evaluation.cases.find((item) => item.caseId === entry.caseId)!,
    );
    if (
      value.grade !== score.grade ||
      experimentFingerprint(value.scoreChecks) !== experimentFingerprint(score.checks)
    )
      throw new Error('接续评分与封存评价不一致');
    for (const request of value.requests) {
      z.uuid().parse(request.requestId);
      const facts = request.facts.map((fact) => aiInvocationFactSchema.parse(fact));
      const received = facts.at(-1)!;
      if (
        facts[0]?.kind !== 'dispatching' ||
        received.kind !== 'received' ||
        !matchesLiveExperimentModel(protocol, received.actualModel) ||
        received.cost.status === 'unknown' ||
        received.cost.currency !== 'USD' ||
        received.cost.amount === null
      )
        throw new Error('接续组缺少完整请求审计');
      recordedCost = recordedCost.plus(received.cost.amount);
      recordedRequests++;
    }
    if (
      value.requests.at(-1)!.facts.at(-1)!.outputFingerprint !== experimentFingerprint(value.output)
    )
      throw new Error('接续结果与最后一次审计指纹不一致');
    completed.set(key, value);
  }
  const ordinals = new Set<number>();
  for (const request of resume.unresolvedRequests) {
    if (
      !ids.has(request.caseId) ||
      !['single', 'staged'].includes(request.arm) ||
      !Number.isInteger(request.ordinal) ||
      request.ordinal <= 0 ||
      ordinals.has(request.ordinal) ||
      request.requestId !== null
    )
      throw new Error('未知请求身份无效');
    ordinals.add(request.ordinal);
  }
  const perRequest = new Prisma.Decimal(protocol.budget.maxInputTokensPerArm)
    .mul(protocol.pricing.costPer1kInput)
    .plus(
      new Prisma.Decimal(protocol.budget.maxOutputTokensPerArm).mul(
        protocol.pricing.costPer1kOutput,
      ),
    )
    .div(1000);
  const reserved = perRequest.mul(resume.unresolvedRequests.length);
  const amount = recordedCost.plus(reserved);
  if (amount.gt(protocol.budget.maxCost)) throw new Error('原已耗与未知预留超过本次预算');
  return {
    completed,
    initial: {
      amount: amount.toFixed(),
      reservedUnknown: reserved.toFixed(),
      requests: recordedRequests + resume.unresolvedRequests.length,
    },
    unresolved: resume.unresolvedRequests,
  };
}
