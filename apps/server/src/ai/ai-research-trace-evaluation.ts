import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  researchTraceInputV1Schema,
  type ResearchAuditTraceV1,
  type ResearchTraceRequest,
} from './ai-research-trace-contract.js';
import { projectResearchAuditTraceV1 } from './ai-research-trace-projection.js';

const rate = (numerator: number, denominator: number) => ({
  numerator,
  denominator,
  value: denominator === 0 ? null : numerator / denominator,
});
const observedRate = (numerator: number, denominator: number, unknownSources: number) => ({
  numerator,
  denominator,
  value: unknownSources > 0 ? null : rate(numerator, denominator).value,
  observedValue: rate(numerator, denominator).value,
  denominatorCompleteness: unknownSources > 0 ? 'partial' : 'complete',
});
const timing = (values: Array<number | null>) => {
  const known = values.filter((value): value is number => value !== null);
  return {
    known: known.length,
    unknown: values.length - known.length,
    totalMs: known.length === 0 ? null : known.reduce((sum, value) => sum + value, 0),
    maxMs: known.length === 0 ? null : Math.max(...known),
  };
};

function costs(requests: ResearchTraceRequest[]) {
  const buckets = new Map<
    string,
    { known: Prisma.Decimal; estimated: Prisma.Decimal; unconfirmedReserved: Prisma.Decimal }
  >();
  let unknownRequests = 0;
  const add = (
    currency: string,
    amount: string,
    kind: 'known' | 'estimated' | 'unconfirmedReserved',
  ) => {
    const value = buckets.get(currency) ?? {
      known: new Prisma.Decimal(0),
      estimated: new Prisma.Decimal(0),
      unconfirmedReserved: new Prisma.Decimal(0),
    };
    value[kind] = value[kind].plus(amount);
    buckets.set(currency, value);
  };
  for (const request of requests) {
    const cost = request.cost;
    if (cost?.status === 'known' || cost?.status === 'estimated')
      add(cost.currency!, cost.amount!, cost.status);
    else {
      unknownRequests++;
      const reserved = request.reservation;
      if (reserved?.currency && reserved.amount !== null)
        add(reserved.currency, reserved.amount, 'unconfirmedReserved');
    }
  }
  return {
    unknownRequests,
    currencies: [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, value]) => ({
        currency,
        known: value.known.toFixed(),
        estimated: value.estimated.toFixed(),
        unconfirmedReserved: value.unconfirmedReserved.toFixed(),
      })),
  };
}

function budgetIssues(trace: ResearchAuditTraceV1) {
  const limits = trace.budget;
  if (limits === null || trace.requests === null) return [];
  const issues: string[] = [];
  if (
    trace.requests.reduce((sum, request) => sum + (request.usage?.inputTokens ?? 0), 0) >
      limits.maxInputTokens ||
    trace.requests.reduce((sum, request) => sum + (request.usage?.outputTokens ?? 0), 0) >
      limits.maxOutputTokens
  )
    issues.push('TOKEN_BUDGET_EXCEEDED');
  for (const cost of costs(trace.requests).currencies) {
    if (new Prisma.Decimal(cost.known).isZero()) continue;
    if (limits.costCurrency === null) issues.push('COST_BUDGET_EXCEEDED');
    else if (limits.costCurrency !== cost.currency) issues.push('BUDGET_CURRENCY_MISMATCH');
    else if (new Prisma.Decimal(cost.known).greaterThan(limits.maxCost))
      issues.push('COST_BUDGET_EXCEEDED');
  }
  return issues;
}

/** 纯离线评价；每次调用的失败和费用事实都保留，缺失事实不补零。 */
export function evaluateResearchTraceInputV1(inputText: string) {
  const input = researchTraceInputV1Schema.parse(JSON.parse(inputText));
  const traces = input.records.map(projectResearchAuditTraceV1);
  const violations = traces.flatMap((trace) =>
    [...trace.issues, ...budgetIssues(trace)].map((code) => ({ traceId: trace.id, code })),
  );
  const traceIds = new Set<string>(),
    requestIds = new Set<string>(),
    toolIds = new Set<string>();
  for (const trace of traces) {
    if (traceIds.has(trace.id)) violations.push({ traceId: trace.id, code: 'TRACE_DUPLICATE' });
    traceIds.add(trace.id);
    for (const request of trace.requests ?? []) {
      if (requestIds.has(request.requestId))
        violations.push({ traceId: trace.id, code: 'REQUEST_DUPLICATE' });
      requestIds.add(request.requestId);
    }
    for (const tool of trace.tools) {
      if (toolIds.has(tool.id)) violations.push({ traceId: trace.id, code: 'TOOL_DUPLICATE' });
      toolIds.add(tool.id);
    }
  }
  const research = traces.filter((trace) => trace.consumer === 'research');
  const requests = traces.flatMap((trace) => trace.requests ?? []);
  const tools = research.flatMap((trace) => trace.tools);
  const evidence = research.flatMap((trace) => trace.evidence ?? []);
  const required = evidence.filter((entry) => entry.required);
  const lineages = new Map<string, typeof traces>();
  for (const trace of traces)
    lineages.set(trace.lineageId, [...(lineages.get(trace.lineageId) ?? []), trace]);
  let retries = 0,
    additionalAfterSuccess = 0;
  for (const group of lineages.values()) {
    const attempts = group
      .sort((a, b) => a.executionAttempt - b.executionAttempt)
      .flatMap((trace) => trace.requests ?? []);
    for (let index = 1; index < attempts.length; index++) {
      if (['failed', 'unknown', 'not_sent'].includes(attempts[index - 1]!.state)) retries++;
      else if (attempts[index - 1]!.state === 'success') additionalAfterSuccess++;
    }
  }
  const summaries = new Set<string>();
  let repeatedToolSummaries = 0;
  for (const trace of research)
    for (const tool of trace.tools) {
      const key = `${trace.id}:${tool.name}:${tool.inputSummaryFingerprint}`;
      if (summaries.has(key)) repeatedToolSummaries++;
      summaries.add(key);
    }
  const states = { success: 0, failed: 0, unknown: 0, not_sent: 0, prepared: 0 };
  for (const request of requests) states[request.state]++;
  return {
    version: 'research-trace-evaluation-v1' as const,
    datasetVersion: input.datasetVersion,
    inputFingerprint: createHash('sha256').update(inputText).digest('hex'),
    passed: violations.length === 0,
    violations,
    metrics: {
      traces: traces.length,
      researchRuns: research.length,
      experimentTraces: traces.filter((trace) => trace.consumer === 'experiment_internal').length,
      unclassifiedTraces: traces.filter((trace) => trace.consumer === 'unknown').length,
      runStates: {
        succeeded: research.filter((trace) => trace.status === 'succeeded').length,
        failed: research.filter((trace) => trace.status === 'failed').length,
        cancelled: research.filter((trace) => trace.status === 'cancelled').length,
        deadlineExpired: research.filter((trace) =>
          ['expired', 'research_deadline_expired'].includes(trace.terminationReason ?? ''),
        ).length,
        other: research.filter(
          (trace) => !['succeeded', 'failed', 'cancelled'].includes(trace.status ?? ''),
        ).length,
      },
      modeUnknownRuns: research.filter((trace) => trace.mode === null).length,
      requests: {
        total: requests.length,
        unknownTraces: traces.filter((trace) => trace.requests === null).length,
        states,
        successRate: observedRate(
          states.success,
          requests.length,
          traces.filter((trace) => trace.requests === null).length,
        ),
        failureRate: observedRate(
          states.failed + states.not_sent,
          requests.length,
          traces.filter((trace) => trace.requests === null).length,
        ),
        retries,
        additionalAfterSuccess,
        cancelled: requests.filter((request) => request.errorCode === 'cancelled').length,
        timedOut: null,
      },
      tools: {
        total: tools.length,
        appearanceRate: rate(
          research.filter((trace) => trace.tools.length > 0).length,
          research.length,
        ),
        successRate: rate(tools.filter((tool) => tool.status === 'ok').length, tools.length),
        unavailable: tools.filter((tool) => tool.status === 'unavailable').length,
        denied: tools.filter((tool) => tool.status === 'denied').length,
        repeatedSummaries: repeatedToolSummaries,
      },
      evidence: {
        required: required.length,
        usableRequired: required.filter((entry) => entry.availability === 'usable' && entry.bound)
          .length,
        coverageRate: observedRate(
          required.filter((entry) => entry.availability === 'usable' && entry.bound).length,
          required.length,
          research.filter((trace) => trace.evidence === null).length,
        ),
        usable: evidence.filter((entry) => entry.availability === 'usable' && entry.bound).length,
        empty: evidence.filter((entry) => entry.availability === 'empty').length,
        unavailable: evidence.filter((entry) => entry.availability === 'unavailable').length,
        unknown: evidence.filter((entry) => entry.availability === 'unknown').length,
        unknownTraces: research.filter((trace) => trace.evidence === null).length,
      },
      tokens: {
        reportedInput: requests.reduce(
          (sum, request) => sum + (request.usage?.inputTokens ?? 0),
          0,
        ),
        reportedOutput: requests.reduce(
          (sum, request) => sum + (request.usage?.outputTokens ?? 0),
          0,
        ),
        unknownInputRequests: requests.filter((request) => request.usage?.inputTokens == null)
          .length,
        unknownOutputRequests: requests.filter((request) => request.usage?.outputTokens == null)
          .length,
      },
      costs: costs(requests),
      settlement: {
        markedRequests: requests.filter((request) => (request.settledRevision ?? 0) > 0).length,
        history: 'unknown' as const,
      },
      timing: {
        runs: timing(research.map((trace) => trace.durationMs)),
        tools: timing(tools.map((tool) => tool.durationMs)),
        dispatch: timing(requests.map((request) => request.dispatchMs)),
        response: timing(requests.map((request) => request.responseMs)),
      },
    },
    budgets: research.map((trace) => ({
      traceId: trace.id,
      limits: trace.budget,
      observedCalls: trace.requests?.length ?? null,
      costs: trace.requests === null ? null : costs(trace.requests),
    })),
    traces,
  };
}
