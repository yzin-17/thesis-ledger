import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  correlateResearchResultV2,
  researchResultV2Schema,
  researchGenerationV2Contract,
  type ResearchGenerationV2,
  type AiUsageFacts,
} from '@thesis-ledger/schemas';
import type { AiSdkGenerationRequest, AiSdkGenerationResult } from './ai-sdk-generation.adapter.js';
import { AiSdkGenerationError } from './ai-sdk-generation-facts.js';
import { verifyAiFrozenResearchV2 } from './ai-research-frozen-integrity-v2.js';
import { verifyResearchNumericEvidenceV2 } from './ai-research-numeric-evidence-v2.js';
import { researchInputTokenEstimate, researchRouteCost } from './ai-research-sdk-reservation.js';
import {
  researchExperimentProtocolSchema,
  RESEARCH_EXPERIMENT_STAGES,
  RESEARCH_EXPERIMENT_PROMPT_VERSION,
  RESEARCH_EXPERIMENT_INSTRUCTIONS,
  experimentFingerprint,
  experimentFinancialReference,
  type ResearchExperimentProtocol,
  type ResearchExperimentCase,
  type ResearchExperimentStage,
} from './research-experiment-protocol.js';
import {
  experimentAuditTotals,
  experimentFact,
  experimentResultCost,
  experimentUnknownCost,
  type ExperimentRequestAudit,
} from './research-experiment-audit.js';

export type ExperimentGenerate = (
  input: AiSdkGenerationRequest<ResearchGenerationV2>,
) => Promise<AiSdkGenerationResult<ResearchGenerationV2>>;
export interface ExperimentBinding {
  baseURL: string;
  generate: ExperimentGenerate;
  signal?: AbortSignal;
  now?: () => number;
}
type ArmStatus = 'complete' | 'blocked' | 'failed' | 'cancelled' | 'timeout';
interface ArmResult {
  arm: 'single' | 'staged';
  status: ArmStatus;
  reason: string | null;
  durationMs: number | null;
  frozenInputFingerprint: string;
  assumptionsFingerprint: string;
  modelRevision: string;
  finalOutputFingerprint: string | null;
  qualityGrade: null;
  returnGrade: null;
  stages: Array<{
    stage: ResearchExperimentStage;
    inputFingerprint: string;
    outputFingerprint: string | null;
    accepted: boolean;
  }>;
  requests: ExperimentRequestAudit[];
  totals: ReturnType<typeof experimentAuditTotals>;
}
function assertControlledBinding(binding: ExperimentBinding) {
  const url = new URL(binding.baseURL);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.pathname !== '/v1' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('受控实验只接受显式回环响应端');
}
function validateStage(
  entry: ResearchExperimentCase,
  output: ResearchGenerationV2,
  protocol: ResearchExperimentProtocol,
  now: number,
) {
  const result = researchResultV2Schema.parse({
    version: 2,
    inputFingerprint: entry.frozen.inputFingerprint,
    scopeSnapshot: entry.frozen.scopeSnapshot,
    createdAt: new Date(now).toISOString(),
    dataCutoffAt: entry.frozen.dataCutoffAt,
    promptVersion: entry.frozen.prompt.version,
    model: {
      providerId: protocol.model.providerId,
      modelId: protocol.model.id,
      researchSettingsRevision: entry.frozen.researchSettingsRevision,
    },
    inference: output,
    evidenceBindings: entry.bindings,
    quality: entry.frozen.quality,
  });
  correlateResearchResultV2(entry.frozen, result, entry.ownedToolCallIds);
  verifyResearchNumericEvidenceV2(entry.frozen, result.inference);
  if (
    entry.frozen.evidence.some(
      (evidence) =>
        evidence.required &&
        (!evidence.usable ||
          !entry.bindings.some(
            (binding) => binding.audit.evidenceId === evidence.audit.evidenceId,
          )),
    )
  )
    throw new Error('必需证据未满足');
}
function budgetPlan(
  protocol: ResearchExperimentProtocol,
  requests: ExperimentRequestAudit[],
  messages: unknown[],
  remainingStages: number,
) {
  const totals = experimentAuditTotals(requests);
  if (totals.unknownInput || totals.unknownOutput || totals.unknownCost) return null;
  if (
    requests.length >= protocol.budget.maxCalls ||
    totals.costs.some((cost) => cost.currency !== protocol.budget.currency)
  )
    return null;
  const inputTokens = researchInputTokenEstimate(messages);
  const outputTokens = Math.floor(
    (protocol.budget.maxOutputTokens - totals.knownOutput) / remainingStages,
  );
  if (totals.knownInput + inputTokens > protocol.budget.maxInputTokens || outputTokens <= 0)
    return null;
  const cost = researchRouteCost(
    { costCurrency: protocol.budget.currency },
    protocol.pricing,
    inputTokens,
    outputTokens,
  );
  const consumed = totals.costs.reduce(
    (sum, bucket) => sum.plus(bucket.known).plus(bucket.estimated),
    new Prisma.Decimal(0),
  );
  if (!cost?.amount || consumed.plus(cost.amount).gt(protocol.budget.maxCost)) return null;
  return { inputTokens, outputTokens, cost };
}
/** 即使受控端忽略取消，也必须有界结束等待；未知消耗不填零且不继续下一阶段。 */
async function boundedGeneration(
  binding: ExperimentBinding,
  input: AiSdkGenerationRequest<ResearchGenerationV2>,
) {
  if (input.signal.aborted) throw new Error('experiment_aborted');
  let abort!: () => void;
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new Error('experiment_aborted'));
    input.signal.addEventListener('abort', abort, { once: true });
  });
  try {
    return await Promise.race([binding.generate(input), cancelled]);
  } finally {
    input.signal.removeEventListener('abort', abort);
  }
}
interface ArmState {
  protocol: ResearchExperimentProtocol;
  entry: ResearchExperimentCase;
  arm: 'single' | 'staged';
  binding: ExperimentBinding;
  controller: AbortController;
  started: number;
  now: () => number;
  previous: ResearchGenerationV2[];
  result: ArmResult;
  stageCount: number;
}
function meterFailure(
  protocol: ResearchExperimentProtocol,
  value: AiSdkGenerationResult<ResearchGenerationV2>,
  requests: ExperimentRequestAudit[],
) {
  const totals = experimentAuditTotals(requests);
  if (value.actualModel !== protocol.model.id) return 'model_unqualified';
  if (totals.unknownInput > 0 || totals.unknownOutput > 0) return 'usage_unknown';
  if (totals.unknownCost > 0) return 'cost_unknown';
  if (totals.costs.some((bucket) => bucket.currency !== protocol.budget.currency))
    return 'cost_currency_mismatch';
  if (
    totals.knownInput > protocol.budget.maxInputTokens ||
    totals.knownOutput > protocol.budget.maxOutputTokens
  )
    return 'token_budget_exceeded';
  if (
    totals.costs.some((bucket) =>
      new Prisma.Decimal(bucket.known).plus(bucket.estimated).gt(protocol.budget.maxCost),
    )
  )
    return 'cost_budget_exceeded';
  return null;
}
function failRequest(state: ArmState, request: ExperimentRequestAudit, error: unknown) {
  let usage: AiUsageFacts | null = null;
  let errorCode = 'generation_failed',
    kind: 'unknown' | 'not_sent' = 'unknown';
  if (error instanceof AiSdkGenerationError) {
    usage = error.usage;
    errorCode = error.fact.code;
    if (error.fact.externalResult === 'not_sent') {
      kind = 'not_sent';
      usage = null;
    }
  }
  state.result.status = 'failed';
  if (errorCode === 'timeout') state.result.status = 'timeout';
  if (state.controller.signal.aborted) {
    state.result.status = state.binding.signal?.aborted ? 'cancelled' : 'timeout';
    errorCode = state.result.status;
  }
  const cost =
    usage === null
      ? experimentUnknownCost()
      : experimentResultCost(state.protocol, {
          usage,
          providerCost: null,
          providerCostCurrency: null,
        });
  state.result.reason = errorCode;
  request.facts.push(experimentFact(kind, { usage, errorCode, cost }));
  request.completedAt = new Date(state.now()).toISOString();
}
async function executeStage(state: ArmState, stage: ResearchExperimentStage, index: number) {
  const { protocol, entry, arm, binding, controller, result, now } = state;
  const context = {
    version: RESEARCH_EXPERIMENT_PROMPT_VERSION,
    caseId: entry.id,
    arm,
    stage,
    instruction:
      '只使用冻结资料并按既有研究生成合同输出 JSON。' + RESEARCH_EXPERIMENT_INSTRUCTIONS[stage],
    frozen: entry.frozen,
    assumptions: entry.assumptions,
    previous: state.previous,
  };
  const messages = [{ role: 'user', content: JSON.stringify(context) }];
  const reservation = budgetPlan(protocol, result.requests, messages, state.stageCount - index);
  if (!reservation) {
    result.status = 'blocked';
    result.reason = 'budget_exceeded';
    return false;
  }
  const request: ExperimentRequestAudit = {
    requestId: randomUUID(),
    stage,
    inputFingerprint: experimentFingerprint(context),
    preparedAt: new Date(now()).toISOString(),
    completedAt: null,
    reservation,
    facts: [experimentFact('dispatching')],
  };
  if (now() - state.started >= protocol.budget.maxDurationMs) {
    result.status = 'timeout';
    result.reason = 'timeout';
    return false;
  }
  result.requests.push(request);
  let value: AiSdkGenerationResult<ResearchGenerationV2>;
  try {
    value = await boundedGeneration(binding, {
      requestId: request.requestId,
      adapter: 'openai-compatible',
      authMode: 'none',
      providerId: protocol.model.providerId,
      baseURL: binding.baseURL,
      apiKey: '',
      model: protocol.model.id,
      messages,
      contract: researchGenerationV2Contract.ref,
      schema: researchGenerationV2Contract.schema,
      mode: 'native_schema',
      transport: 'single',
      maxOutputTokens: reservation.outputTokens,
      timeout: { totalMs: Math.max(1, protocol.budget.maxDurationMs - (now() - state.started)) },
      signal: controller.signal,
    });
  } catch (error) {
    failRequest(state, request, error);
    return false;
  }
  request.completedAt = new Date(now()).toISOString();
  const outputFingerprint = experimentFingerprint(value.output),
    cost = experimentResultCost(protocol, value);
  request.facts.push(
    experimentFact('received', {
      usage: value.usage,
      cost,
      actualModel: value.actualModel,
      outputFingerprint,
    }),
  );
  const snapshot = {
    stage,
    inputFingerprint: request.inputFingerprint,
    outputFingerprint,
    accepted: false,
  };
  result.stages.push(snapshot);
  try {
    validateStage(entry, value.output, protocol, now());
  } catch {
    result.status = 'failed';
    result.reason = 'critical_violation';
    return false;
  }
  const failure = meterFailure(protocol, value, result.requests);
  if (failure) {
    result.status = 'blocked';
    result.reason = failure;
    return false;
  }
  if (controller.signal.aborted || now() - state.started >= protocol.budget.maxDurationMs) {
    result.status = binding.signal?.aborted ? 'cancelled' : 'timeout';
    result.reason = result.status;
    return false;
  }
  snapshot.accepted = true;
  state.previous.push(value.output);
  if (index === state.stageCount - 1) result.finalOutputFingerprint = outputFingerprint;
  return true;
}
async function runArm(
  protocol: ResearchExperimentProtocol,
  entry: ResearchExperimentCase,
  arm: 'single' | 'staged',
  binding: ExperimentBinding,
): Promise<ArmResult> {
  const now = binding.now ?? Date.now,
    started = now();
  const controller = new AbortController();
  const cancelled = () => controller.abort();
  binding.signal?.addEventListener('abort', cancelled, { once: true });
  const timer = setTimeout(() => controller.abort(), protocol.budget.maxDurationMs);
  const stages: ResearchExperimentStage[] =
    arm === 'single' ? ['single'] : [...RESEARCH_EXPERIMENT_STAGES];
  const result: ArmResult = {
    arm,
    status: 'complete',
    reason: null,
    durationMs: 0,
    frozenInputFingerprint: entry.frozen.inputFingerprint,
    assumptionsFingerprint: experimentFingerprint(entry.assumptions),
    modelRevision: protocol.model.revision,
    finalOutputFingerprint: null,
    qualityGrade: null,
    returnGrade: null,
    stages: [],
    requests: [],
    totals: experimentAuditTotals([]),
  };
  const state: ArmState = {
    protocol,
    entry,
    arm,
    binding,
    controller,
    started,
    now,
    previous: [],
    result,
    stageCount: stages.length,
  };
  try {
    for (const [index, stage] of stages.entries()) {
      if (binding.signal?.aborted || controller.signal.aborted) {
        result.status = binding.signal?.aborted ? 'cancelled' : 'timeout';
        result.reason = result.status;
        break;
      }
      if (!(await executeStage(state, stage, index))) break;
    }
  } finally {
    clearTimeout(timer);
    binding.signal?.removeEventListener('abort', cancelled);
    const elapsed = now() - started;
    result.durationMs = elapsed >= 0 ? elapsed : null;
    if (elapsed < 0) {
      result.status = 'blocked';
      result.reason = 'clock_unqualified';
    }
    result.totals = experimentAuditTotals(result.requests);
  }
  if (result.status !== 'complete') result.finalOutputFingerprint = null;
  return result;
}
export async function runControlledResearchExperiment(raw: unknown, binding: ExperimentBinding) {
  assertControlledBinding(binding);
  const protocol = researchExperimentProtocolSchema.parse(raw);
  for (const entry of protocol.cases) verifyAiFrozenResearchV2(entry.frozen);
  const cases = [];
  for (const entry of protocol.cases)
    cases.push({
      caseId: entry.id,
      frozenInputFingerprint: entry.frozen.inputFingerprint,
      assumptionsFingerprint: experimentFingerprint(entry.assumptions),
      financialReference: experimentFinancialReference(entry),
      single: await runArm(protocol, entry, 'single', binding),
      staged: await runArm(protocol, entry, 'staged', binding),
    });
  return {
    version: 'research-experiment-report-v1',
    mode: 'controlled-offline',
    activation: 'not_evaluated',
    stageProtocol: {
      version: RESEARCH_EXPERIMENT_PROMPT_VERSION,
      fingerprint: experimentFingerprint(RESEARCH_EXPERIMENT_INSTRUCTIONS),
    },
    protocolFingerprint: experimentFingerprint(protocol),
    model: protocol.model,
    activationCriteria: protocol.activationCriteria,
    passed: cases.every(
      (entry) => entry.single.status === 'complete' && entry.staged.status === 'complete',
    ),
    cases,
  };
}
