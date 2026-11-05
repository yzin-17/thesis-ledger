import { createHash } from 'node:crypto';
import {
  aiExecutionSummarySchema,
  aiFrozenResearchV2Schema,
  aiInvocationFactSchema,
  correlateResearchResultV2,
  classifyAiResearchTask,
  researchScopeSnapshotV2Schema,
  type AiRequestAttempt,
  type ResearchScopeSnapshotV2,
} from '@thesis-ledger/schemas';
import { canAppendInvocationFact } from './ai-invocation-policy.js';
import { aiFrozenResearchSchema } from './ai-frozen-research.js';
import { qualifyFrozenResearchEvidenceV2 } from './ai-research-evidence-quality-v2.js';
import type {
  ResearchAuditTraceV1,
  ResearchTraceRecord,
  ResearchTraceRequest,
} from './ai-research-trace-contract.js';

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const elapsed = (start: string | null, end: string | null) => {
  if (start === null || end === null) return null;
  const value = Date.parse(end) - Date.parse(start);
  return Number.isFinite(value) && value >= 0 ? value : null;
};
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

function requestState(value: AiRequestAttempt): ResearchTraceRequest['state'] {
  if (value.error?.externalResult === 'not_sent') return 'not_sent';
  if (value.error?.externalResult === 'unknown') return 'unknown';
  if (value.error) return 'failed';
  if (value.state === 'prepared') return 'prepared';
  if (value.state !== 'completed') return 'unknown';
  if (value.outcome?.schemaAccepted && value.outcome.status === 'complete') return 'success';
  return 'failed';
}
function projectRequest(value: AiRequestAttempt): ResearchTraceRequest {
  const latest = value.usageRevisions.at(-1);
  return {
    requestId: value.requestId,
    state: requestState(value),
    errorCode: value.error?.code ?? null,
    usage: latest?.usage ?? null,
    cost: latest?.cost ?? null,
    reservation: value.reservation.cost,
    settledRevision: value.settledRevision,
    dispatchMs: elapsed(value.preparedAt, value.dispatchingAt),
    responseMs: elapsed(value.dispatchingAt, value.completedAt),
  };
}

type RunTraceSource = Extract<ResearchTraceRecord, { kind: 'ai-run' }>;
function projectEvidence(
  value: RunTraceSource,
  metadata: Record<string, unknown>,
  scope: ResearchScopeSnapshotV2 | null,
  issues: string[],
): ResearchAuditTraceV1['evidence'] {
  const run = value.record;
  const frozen = aiFrozenResearchV2Schema.safeParse(metadata.frozenResearch);
  if (
    'frozenResearch' in metadata &&
    !frozen.success &&
    !aiFrozenResearchSchema.safeParse(metadata.frozenResearch).success
  )
    issues.push('FROZEN_INVALID');
  let evidence: ResearchAuditTraceV1['evidence'] = null;
  if (record(run.result).version === 2 && !frozen.success) issues.push('V2_FROZEN_MISSING');
  if (frozen.success) {
    if (scope === null || JSON.stringify(scope) !== JSON.stringify(frozen.data.scopeSnapshot))
      issues.push('SCOPE_MISMATCH');
    let boundIds = new Set<string>();
    if (run.status === 'succeeded') {
      try {
        const result = correlateResearchResultV2(
          frozen.data,
          run.result,
          value.toolCalls
            .filter((tool) => tool.status === 'ok' && tool.aiRunId === run.id)
            .map((tool) => tool.id),
        );
        boundIds = new Set(result.evidenceBindings.map((binding) => binding.audit.evidenceId));
      } catch {
        issues.push('RESULT_BINDING_INVALID');
      }
    }
    evidence = frozen.data.evidence.map((entry) => ({
      id: entry.audit.evidenceId,
      required: entry.required,
      availability: qualifyFrozenResearchEvidenceV2(entry),
      bound: boundIds.has(entry.audit.evidenceId),
    }));
    if (
      run.status === 'succeeded' &&
      evidence.some((entry) => entry.required && (entry.availability !== 'usable' || !entry.bound))
    )
      issues.push('REQUIRED_EVIDENCE_MISSING');
  }
  return evidence;
}

function projectExecution(
  run: RunTraceSource['record'],
  metadata: Record<string, unknown>,
  issues: string[],
) {
  const parsed = aiExecutionSummarySchema.safeParse(metadata.sdkExecution);
  if (!parsed.success) {
    if ('sdkExecution' in metadata) issues.push('EXECUTION_INVALID');
    return { requests: null, budget: null, terminationReason: run.errorCode ?? null };
  }
  const execution = parsed.data;
  if (
    execution.requests.some(
      (request) =>
        request.outcome !== null &&
        JSON.stringify(request.outcome.contract) !== JSON.stringify(execution.contract),
    )
  )
    issues.push('REQUEST_CONTRACT_MISMATCH');
  const requests = execution.requests.map(projectRequest);
  if (
    execution.requests.some(
      (request, index) =>
        request.sequence !== index + 1 ||
        (request.dispatchExecutionAttempt ?? 0) > run.executionAttempt,
    )
  )
    issues.push('REQUEST_SEQUENCE_INVALID');
  if (execution.frozenPolicy && execution.requests.length > execution.frozenPolicy.maxAiCalls)
    issues.push('CALL_BUDGET_EXCEEDED');
  const policy = execution.frozenPolicy;
  const budget = policy
    ? {
        maxAiCalls: policy.maxAiCalls,
        maxInputTokens: policy.maxInputTokens,
        maxOutputTokens: policy.maxOutputTokens,
        maxCost: policy.maxCost,
        costCurrency: policy.costCurrency,
      }
    : null;
  const terminationReason = execution.continuationBlockedReason ?? run.errorCode ?? null;
  return { requests, budget, terminationReason };
}

function consumerForRun(
  run: RunTraceSource['record'],
  metadata: Record<string, unknown>,
): ResearchAuditTraceV1['consumer'] {
  const experimentId = metadata.optimizationExperimentId;
  const relation = run.relationExperimentId;
  if (relation)
    return experimentId && experimentId !== relation ? 'unknown' : 'experiment_internal';
  if (experimentId) return 'unknown';
  const frozen = aiFrozenResearchV2Schema.safeParse(metadata.frozenResearch);
  const execution = aiExecutionSummarySchema.safeParse(metadata.sdkExecution);
  if (
    frozen.success &&
    execution.success &&
    run.promptVersion === frozen.data.prompt.version &&
    execution.data.contract.id === 'research' &&
    execution.data.contract.version === 'research-generation-v2' &&
    researchScopeSnapshotV2Schema.safeParse(run.researchScopeSnapshot).success
  )
    return 'research';
  const kind = classifyAiResearchTask({ promptVersion: run.promptVersion, context: run.context });
  return kind === 'research' ? 'research' : 'unknown';
}
function projectRun(value: RunTraceSource): ResearchAuditTraceV1 {
  const run = value.record;
  const issues: string[] = [];
  const metadata = record(run.modelMetadata);
  const tools = value.toolCalls.map((call) => {
    if (call.aiRunId !== run.id) issues.push('TOOL_OUTSIDE_RUN');
    return {
      id: call.id,
      name: call.tool,
      status: call.status,
      inputSummaryFingerprint: digest(call.inputSummary),
      durationMs: call.durationMs,
    };
  });
  const scope = researchScopeSnapshotV2Schema.safeParse(run.researchScopeSnapshot);
  if (run.researchScopeSnapshot != null && !scope.success) issues.push('SCOPE_INVALID');
  const evidence = projectEvidence(value, metadata, scope.success ? scope.data : null, issues);
  const execution = projectExecution(run, metadata, issues);
  return {
    id: run.id,
    lineageId: run.id,
    executionAttempt: run.executionAttempt,
    consumer: consumerForRun(run, metadata),
    status: run.status,
    mode: scope.success ? scope.data.mode : null,
    durationMs: run.durationMs,
    ...execution,
    tools,
    evidence,
    issues,
  };
}

function projectInvocation(
  value: Extract<ResearchTraceRecord, { kind: 'ai-invocation' }>,
): ResearchAuditTraceV1 {
  const issues: string[] = [];
  const facts = [...value.facts].sort((left, right) => left.sequence - right.sequence);
  let previous: 'dispatching' | 'received' | 'not_sent' | 'unknown' | null = null;
  const keys = new Set<string>();
  for (let index = 0; index < facts.length; index++) {
    const row = facts[index]!;
    const fact = aiInvocationFactSchema.safeParse(row.details);
    if (
      !fact.success ||
      row.requestId !== value.record.requestId ||
      row.sequence !== index + 1 ||
      keys.has(row.eventKey)
    ) {
      issues.push('INVOCATION_FACT_INVALID');
      continue;
    }
    keys.add(row.eventKey);
    if (
      fact.data.eventKey !== row.eventKey ||
      fact.data.kind !== row.kind ||
      !canAppendInvocationFact(previous, fact.data.kind)
    )
      issues.push('INVOCATION_FACT_INVALID');
    previous = fact.data.kind;
  }
  const latest = aiInvocationFactSchema.safeParse(facts.at(-1)?.details);
  let state: ResearchTraceRequest['state'] = 'prepared';
  if (latest.success) {
    if (latest.data.kind === 'not_sent') state = 'not_sent';
    else if (latest.data.kind === 'received')
      state =
        latest.data.errorCode === null && latest.data.outputFingerprint !== null
          ? 'success'
          : 'failed';
    else state = 'unknown';
  }
  return {
    id: value.record.requestId,
    lineageId: digest(
      `${value.record.ownerId}:${value.record.consumer}:${value.record.referenceId}`,
    ),
    executionAttempt: value.record.executionAttempt,
    consumer: 'strategy_authoring',
    status: null,
    mode: null,
    durationMs: null,
    terminationReason: null,
    budget: null,
    requests: [
      {
        requestId: value.record.requestId,
        state,
        errorCode: latest.success ? latest.data.errorCode : null,
        usage: latest.success ? latest.data.usage : null,
        cost: latest.success ? latest.data.cost : null,
        reservation: null,
        settledRevision: null,
        dispatchMs: null,
        responseMs: null,
      },
    ],
    tools: [],
    evidence: null,
    issues,
  };
}

/** 只投影已有事实，不调用模型、数据源或数据库，也不返回原始摘要和配置。 */
export function projectResearchAuditTraceV1(value: ResearchTraceRecord) {
  return value.kind === 'ai-run' ? projectRun(value) : projectInvocation(value);
}
