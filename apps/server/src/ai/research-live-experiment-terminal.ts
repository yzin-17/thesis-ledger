import { z } from 'zod';
import { aiInvocationFactSchema, type ResearchGenerationV2 } from '@thesis-ledger/schemas';
import { experimentFingerprint } from './research-experiment-protocol.js';
import { verifyLiveExperimentOutput, type LiveArmResult } from './research-live-experiment-arm.js';
import type { ExperimentRequestAudit } from './research-experiment-audit.js';
import {
  matchesLiveExperimentModel,
  type LiveBenchmark,
  type LiveEvaluation,
  type LiveExperimentHistory,
  type LiveExperimentProtocol,
} from './research-live-experiment-protocol.js';
import {
  verifyLiveExperimentHistory,
  verifyLiveExperimentResume,
} from './research-live-experiment-resume.js';
import {
  verifyFreeProbeBudget,
  type LiveSupplementalBudget,
} from './research-live-experiment-supplemental.js';

export interface LiveTerminalContinuation {
  kind: 'terminal-groups-v1';
  sourceProtocolFingerprint: string;
  retainedArms: Array<{ caseId: string; arm: 'single' | 'staged'; result: LiveArmResult }>;
  historicalBudget: LiveExperimentHistory;
  sourceRequests: number;
  sourceSupplementalRequests: number;
  supplementalBudget: LiveSupplementalBudget;
  retainedStageOutputs?: Array<{ requestId: string; output: ResearchGenerationV2 }>;
}

export function verifyTerminalContinuation(
  protocol: LiveExperimentProtocol,
  benchmark: LiveBenchmark,
  evaluation: LiveEvaluation,
  source: LiveTerminalContinuation,
) {
  if (
    protocol.version !== 'research-live-experiment-v3' ||
    !protocol.model.id.endsWith(':free') ||
    protocol.pricing.costPer1kInput !== 0 ||
    protocol.pricing.costPer1kOutput !== 0 ||
    source.kind !== 'terminal-groups-v1' ||
    source.sourceProtocolFingerprint !== experimentFingerprint(protocol)
  )
    throw new Error('多组接续只接受原固定免费协议');
  const completedOnly = source.retainedArms.filter((entry) => entry.result.status === 'complete');
  const recovered = verifyLiveExperimentResume(protocol, benchmark, evaluation, {
    sourceProtocolFingerprint: source.sourceProtocolFingerprint,
    completedArms: completedOnly,
    unresolvedRequests: [],
  });
  if (recovered.initial.amount !== '0') throw new Error('免费接续不能丢弃已记录非零费用');
  const ids = new Set<string>(),
    keys = new Set<string>();
  const sequence = protocol.caseIds.flatMap((caseId, index) =>
    (index % 2 === 0 ? ['single', 'staged'] : ['staged', 'single']).map(
      (arm) => caseId + ':' + arm,
    ),
  );
  let requests = 0;
  const stageOutputs = new Map<string, ResearchGenerationV2>();
  const usedStageOutputs = new Set<string>();
  for (const entry of source.retainedStageOutputs ?? []) {
    z.uuid().parse(entry.requestId);
    if (stageOutputs.has(entry.requestId)) throw new Error('保留中间输出重复');
    stageOutputs.set(entry.requestId, entry.output);
  }
  for (const [index, entry] of source.retainedArms.entries()) {
    const key = entry.caseId + ':' + entry.arm,
      value = entry.result;
    if (keys.has(key) || key !== sequence[index] || !value.requests.length)
      throw new Error('保留组必须是原执行顺序的唯一连续前缀');
    keys.add(key);
    const stages = entry.arm === 'single' ? ['single'] : ['organize', 'challenge', 'synthesize'];
    for (const [ordinal, request] of value.requests.entries()) {
      z.uuid().parse(request.requestId);
      if (ids.has(request.requestId) || request.stage !== stages[ordinal])
        throw new Error('保留请求重复或阶段顺序不符');
      ids.add(request.requestId);
      requests++;
    }
    if (value.status === 'complete') continue;
    if (
      value.status !== 'failed' ||
      !['provider_rejected', 'schema_invalid'].includes(value.reason ?? '') ||
      !retainableFailedRequestCount(entry.arm, value) ||
      value.output !== null ||
      value.grade !== null ||
      value.scoreChecks.length !== 0 ||
      value.criticalViolations !== 0 ||
      !Number.isFinite(value.durationMs) ||
      value.durationMs < 0 ||
      value.estimatedCost !== 0 ||
      (value.actualCost !== null && value.actualCost !== 0)
    )
      throw new Error('保留失败组不符合已核对的终态');
    for (const request of value.requests.slice(0, -1)) {
      const fact = verifyRetainedRequest(request, protocol, null);
      const output = stageOutputs.get(request.requestId);
      if (!output || fact.outputFingerprint !== experimentFingerprint(output))
        throw new Error('保留前序输出缺失或指纹不符');
      verifyLiveExperimentOutput(
        benchmark.cases.find((sample) => sample.id === entry.caseId)!,
        output,
        protocol,
        Date.now(),
      );
      usedStageOutputs.add(request.requestId);
    }
    verifyRetainedRequest(value.requests.at(-1)!, protocol, value.reason);
    recovered.completed.set(key, value);
  }
  if (usedStageOutputs.size !== stageOutputs.size) throw new Error('存在无对应前序请求的中间输出');
  const history = verifyLiveExperimentHistory(protocol, source.historicalBudget);
  const supplemental = verifyFreeProbeBudget(source.supplementalBudget);
  if (
    !Number.isInteger(source.sourceSupplementalRequests) ||
    source.sourceSupplementalRequests < 0 ||
    source.sourceSupplementalRequests > supplemental.requests ||
    history.requests + requests + source.sourceSupplementalRequests !== source.sourceRequests ||
    supplemental.budget.entries.some((entry) => ids.has(entry.requestId))
  )
    throw new Error('保留请求与原终态/补充预算无法对账');
  return {
    completed: recovered.completed,
    initial: {
      amount: history.amount,
      reservedUnknown: history.reservedUnknown,
      requests: history.requests + requests + supplemental.requests,
    },
    unresolved: [],
    historicalBudget: source.historicalBudget,
    supplementalBudget: supplemental.budget,
  };
}

function retainableFailedRequestCount(arm: 'single' | 'staged', value: LiveArmResult) {
  if (value.requests.length === 1) return true;
  return (
    arm === 'staged' &&
    value.reason === 'schema_invalid' &&
    value.requests.length >= 2 &&
    value.requests.length <= 3
  );
}

function verifyRetainedRequest(
  request: ExperimentRequestAudit,
  protocol: LiveExperimentProtocol,
  errorCode: string | null,
) {
  const facts = request.facts.map((fact) => aiInvocationFactSchema.parse(fact));
  const first = facts[0],
    last = facts.at(-1);
  if (
    facts.length !== 2 ||
    first?.kind !== 'dispatching' ||
    first.cost.status !== 'unknown' ||
    !last ||
    !['received', 'unknown'].includes(last.kind) ||
    last.errorCode !== errorCode ||
    first.eventKey === last.eventKey ||
    (last.actualModel !== null && !matchesLiveExperimentModel(protocol, last.actualModel)) ||
    !/^[a-f0-9]{64}$/.test(request.inputFingerprint)
  )
    throw new Error('保留请求缺少匹配的派发和终态审计');
  verifyRetainedFreeCost(last);
  if (errorCode === null) {
    if (
      last.kind !== 'received' ||
      !matchesLiveExperimentModel(protocol, last.actualModel) ||
      !/^[a-f0-9]{64}$/.test(last.outputFingerprint ?? '')
    )
      throw new Error('前序请求不是已核实的成功阶段');
  } else if (last.outputFingerprint !== null) throw new Error('失败请求不能带成功输出指纹');
  return last;
}

function verifyRetainedFreeCost(last: ReturnType<typeof aiInvocationFactSchema.parse>) {
  if (last.cost.status === 'unknown') {
    if (last.kind !== 'unknown') throw new Error('未知费用不能改写为已接收');
  } else if (
    last.kind !== 'received' ||
    last.cost.currency !== 'USD' ||
    last.cost.amount !== '0' ||
    last.usage?.inputTokens == null ||
    last.usage.outputTokens == null
  )
    throw new Error('免费保留请求已知费用或用量不符');
}
