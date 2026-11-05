import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  aiExecutionSummarySchema,
  aiFrozenResearchV2Schema,
  researchResultV2Schema,
  type AiExecutionSummary,
} from '@thesis-ledger/schemas';
import { researchTraceInputV1Schema } from '../../src/ai/ai-research-trace-contract.js';
import { evaluateResearchTraceInputV1 } from '../../src/ai/ai-research-trace-evaluation.js';

const fixture = () =>
  researchTraceInputV1Schema.parse(
    JSON.parse(
      readFileSync(new URL('./fixtures/research-trace-v1.samples.json', import.meta.url), 'utf8'),
    ),
  );
type Input = ReturnType<typeof fixture>;
const evaluate = (input: Input) => evaluateResearchTraceInputV1(JSON.stringify(input));
const run = (input: Input, index = 0) => {
  const item = input.records[index];
  if (item?.kind !== 'ai-run') throw new Error('需要固定研究样例');
  return item;
};
const metadata = (input: Input, index = 0) =>
  run(input, index).record.modelMetadata as Record<string, unknown>;
const changeExecution = (
  input: Input,
  change: (execution: AiExecutionSummary) => void,
  index = 0,
) => {
  const value = metadata(input, index);
  const execution = aiExecutionSummarySchema.parse(value.sdkExecution);
  change(execution);
  value.sdkExecution = execution;
};

it('实际合同入口分别计算工具出现、调用成功和有效覆盖，失败/取消/未知费用保留', () => {
  const report = evaluate(fixture());
  expect(report.passed).toBe(true);
  expect(report.metrics.traces).toBe(4);
  expect(report.metrics.runStates).toMatchObject({
    succeeded: 1,
    failed: 1,
    cancelled: 1,
    deadlineExpired: 1,
  });
  expect(report.metrics.requests).toMatchObject({
    total: 5,
    states: { success: 1, failed: 3, unknown: 1 },
    retries: 1,
    cancelled: 1,
    timedOut: null,
    successRate: { numerator: 1, denominator: 5 },
    failureRate: { numerator: 3, denominator: 5 },
  });
  expect(report.metrics.tools).toMatchObject({
    total: 4,
    appearanceRate: { numerator: 2, denominator: 3 },
    successRate: { numerator: 3, denominator: 4 },
    repeatedSummaries: 1,
  });
  expect(report.metrics.evidence).toMatchObject({
    required: 1,
    usableRequired: 1,
    unknownTraces: 2,
  });
  expect(report.metrics.evidence.coverageRate).toMatchObject({
    value: null,
    observedValue: 1,
    denominatorCompleteness: 'partial',
  });
  expect(report.metrics.costs).toEqual({
    unknownRequests: 1,
    currencies: [
      { currency: 'CNY', known: '1.2', estimated: '0', unconfirmedReserved: '0' },
      { currency: 'USD', known: '0.6', estimated: '0', unconfirmedReserved: '0.4' },
    ],
  });
  expect(report.metrics.timing.runs).toEqual({ known: 2, unknown: 1, totalMs: 1400, maxMs: 1200 });
  expect(report.metrics.settlement.history).toBe('unknown');
});

it('投影丢弃问题、Prompt、配置、原材料、原摘要和原错误，只保留标识/计量', () => {
  const input = fixture();
  Object.assign(run(input).record, {
    question: 'synthetic-question-marker',
    context: { mode: 'actual' },
  });
  const text = JSON.stringify(evaluate(input));
  for (const marker of [
    'synthetic-private-input-marker',
    'synthetic-private-output-marker',
    'synthetic-configuration-marker',
    'synthetic-error-marker',
    'synthetic-question-marker',
    '只根据冻结资料进行研究',
  ])
    expect(text).not.toContain(marker);
  expect(evaluate(input).metrics.modeUnknownRuns).toBe(2);
});

it('相同字节和评价版本可重现，不同输入字节保留不同指纹', () => {
  const text = JSON.stringify(fixture());
  expect(evaluateResearchTraceInputV1(text)).toEqual(evaluateResearchTraceInputV1(text));
  expect(evaluateResearchTraceInputV1(`${text}\n`).inputFingerprint).not.toBe(
    evaluateResearchTraceInputV1(text).inputFingerprint,
  );
});

it('没有 SDK 记录时请求数未知，不能从 AiRun 累计 cost/Token 推造零次或零费用', () => {
  const input = fixture();
  delete metadata(input, 1).sdkExecution;
  Object.assign(run(input, 1).record, { cost: '999', inputTokens: 999, outputTokens: 999 });
  const report = evaluate(input);
  expect(report.metrics.requests.unknownTraces).toBe(1);
  expect(report.metrics.requests.successRate).toMatchObject({
    value: null,
    denominatorCompleteness: 'partial',
  });
  expect(report.traces[1]!.requests).toBeNull();
  expect(JSON.stringify(report.metrics.costs)).not.toContain('999');
});

it('费用估算和已知零分别保存，不与未知实际费用合并', () => {
  const input = fixture();
  changeExecution(input, (execution) => {
    execution.requests[0]!.usageRevisions[0]!.cost.amount = '0';
  });
  changeExecution(
    input,
    (execution) => {
      execution.requests[0]!.usageRevisions[0]!.cost.status = 'estimated';
    },
    1,
  );
  const report = evaluate(input);
  expect(report.metrics.costs.unknownRequests).toBe(1);
  expect(report.metrics.costs.currencies.find((cost) => cost.currency === 'USD')).toMatchObject({
    known: '0.1',
    estimated: '0.3',
    unconfirmedReserved: '0.4',
  });
});

it('冻结、数据库与最终结果跨模式时阻断', () => {
  const input = fixture();
  const frozen = aiFrozenResearchV2Schema.parse(metadata(input).frozenResearch);
  run(input).record.researchScopeSnapshot = { ...frozen.scopeSnapshot, mode: 'actual' };
  expect(evaluate(input).violations).toContainEqual({
    traceId: run(input).record.id,
    code: 'SCOPE_MISMATCH',
  });
});

it('引用其他调用或其他任务的工具记录必须失败', () => {
  const input = fixture();
  const result = researchResultV2Schema.parse(run(input).record.result);
  result.evidenceBindings[0]!.toolCallId = randomUUID();
  run(input).record.result = result;
  expect(evaluate(input).violations.some((issue) => issue.code === 'RESULT_BINDING_INVALID')).toBe(
    true,
  );
  const outside = fixture();
  run(outside).toolCalls[0]!.aiRunId = randomUUID();
  expect(evaluate(outside).violations.some((issue) => issue.code === 'TOOL_OUTSIDE_RUN')).toBe(
    true,
  );
  expect(evaluate(outside).metrics.evidence.usableRequired).toBe(0);
});

it.each(['empty', 'unknown'] as const)(
  '成功调用的 %s 材料不能贡献有效覆盖，必需材料阻断成功报告',
  (kind) => {
    const input = fixture();
    const frozen = aiFrozenResearchV2Schema.parse(metadata(input).frozenResearch);
    const result = researchResultV2Schema.parse(run(input).record.result);
    if (kind === 'empty') {
      frozen.evidence[0]!.audit.kind = 'news';
      result.evidenceBindings[0]!.audit.kind = 'news';
      frozen.evidence[0]!.data = { items: [] };
    } else frozen.evidence[0]!.data = { status: 'unknown' };
    metadata(input).frozenResearch = frozen;
    run(input).record.result = result;
    const report = evaluate(input);
    expect(report.metrics.tools.successRate.numerator).toBe(3);
    expect(report.metrics.evidence.usableRequired).toBe(0);
    expect(report.metrics.evidence[kind]).toBe(1);
    expect(report.violations.some((issue) => issue.code === 'REQUIRED_EVIDENCE_MISSING')).toBe(
      true,
    );
  },
);

it('重复计量/结算修订不能被最后一项覆盖掩盖', () => {
  const input = fixture();
  changeExecution(input, (execution) => {
    execution.requests[0]!.usageRevisions.push(
      structuredClone(execution.requests[0]!.usageRevisions[0]!),
    );
  });
  const report = evaluate(input);
  expect(report.passed).toBe(false);
  expect(report.violations.some((issue) => issue.code === 'EXECUTION_INVALID')).toBe(true);
});

it('重复请求身份不能在费用汇总时重复结算或静默去重', () => {
  const input = fixture();
  changeExecution(input, (execution) => {
    const duplicate = structuredClone(execution.requests[0]!);
    duplicate.sequence = 2;
    execution.requests.push(duplicate);
  });
  expect(evaluate(input).violations.some((issue) => issue.code === 'REQUEST_DUPLICATE')).toBe(true);
});

it('AiInvocation 事实的重复修订、顺序和归属接受同一门禁', () => {
  const input = fixture();
  const invocation = input.records[3]!;
  if (invocation.kind !== 'ai-invocation') throw new Error('固定调用样例缺失');
  invocation.facts.push(structuredClone(invocation.facts[1]!));
  expect(evaluate(input).violations.some((issue) => issue.code === 'INVOCATION_FACT_INVALID')).toBe(
    true,
  );
});

it('fail → success → success 只算一次重试，后一次成功调用与全部费用单列', () => {
  const input = fixture();
  const successful = aiExecutionSummarySchema.parse(metadata(input).sdkExecution).requests[0]!;
  changeExecution(
    input,
    (execution) => {
      const second = structuredClone(successful),
        third = structuredClone(successful);
      second.requestId = randomUUID();
      second.sequence = 2;
      second.outcome!.contract = execution.contract;
      third.requestId = randomUUID();
      third.sequence = 3;
      third.outcome!.contract = execution.contract;
      execution.requests = [execution.requests[0]!, second, third];
    },
    1,
  );
  const report = evaluate(input);
  expect(report.metrics.requests).toMatchObject({
    retries: 1,
    additionalAfterSuccess: 1,
    total: 6,
  });
  expect(report.metrics.costs.currencies.find((cost) => cost.currency === 'USD')?.known).toBe('1');
  expect(report.violations.some((issue) => issue.code === 'CALL_BUDGET_EXCEEDED')).toBe(true);
});

it.each(['cost', 'currency', 'tokens'] as const)(
  '实际记录的 %s 预算越界阻断，币种不自动折算',
  (kind) => {
    const input = fixture();
    changeExecution(input, (execution) => {
      const revision = execution.requests[0]!.usageRevisions[0]!;
      if (kind === 'cost') revision.cost.amount = '2';
      else if (kind === 'currency') revision.cost.currency = 'CNY';
      else revision.usage.inputTokens = 100001;
    });
    const report = evaluate(input);
    expect(report.passed).toBe(false);
    expect(report.violations.some((issue) => issue.code.includes('BUDGET'))).toBe(true);
  },
);

it('零分母为未知；没有资料记录不返回满覆盖或零耗时', () => {
  const input = fixture();
  input.records = [run(input, 2)];
  run(input).record.durationMs = null;
  const report = evaluate(input);
  expect(report.metrics.tools.successRate.value).toBeNull();
  expect(report.metrics.evidence.coverageRate.value).toBeNull();
  expect(report.metrics.evidence.unknownTraces).toBe(1);
  expect(report.metrics.timing.runs.totalMs).toBeNull();
});

it('重复导出同一任务或请求不产生看似成功的评估', () => {
  const input = fixture();
  input.records.push(structuredClone(input.records[0]!));
  const report = evaluate(input);
  expect(report.passed).toBe(false);
  expect(report.violations.some((issue) => issue.code === 'TRACE_DUPLICATE')).toBe(true);
});

it('Journal、内部实验和关系冲突不因结果像研究而混入研究分母，费用仍保留', () => {
  const unknown = fixture();
  run(unknown).record.promptVersion = 'journal-review-v1';
  expect(evaluate(unknown).metrics).toMatchObject({
    researchRuns: 2,
    unclassifiedTraces: 1,
    requests: { total: 5 },
  });
  const experiment = fixture();
  const relation = randomUUID();
  run(experiment).record.relationExperimentId = relation;
  metadata(experiment).optimizationExperimentId = relation;
  expect(evaluate(experiment).metrics).toMatchObject({
    researchRuns: 2,
    experimentTraces: 1,
    requests: { total: 5 },
  });
  metadata(experiment).optimizationExperimentId = randomUUID();
  expect(evaluate(experiment).metrics.unclassifiedTraces).toBe(1);
});
