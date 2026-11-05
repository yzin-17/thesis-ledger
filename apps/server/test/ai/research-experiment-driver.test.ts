import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { DEFAULT_AI_RESEARCH_POLICY_V1, aiInvocationFactSchema } from '@thesis-ledger/schemas';
import {
  runControlledResearchExperiment,
  type ExperimentGenerate,
} from '../../src/ai/research-experiment-driver.js';
import {
  researchExperimentProtocolSchema,
  experimentFingerprint,
  type ResearchExperimentStage,
} from '../../src/ai/research-experiment-protocol.js';

const fixed = JSON.parse(
  readFileSync(
    new URL('../fixtures/research-experiment-controlled-v1.json', import.meta.url),
    'utf8',
  ),
);
function fixture(firstOnly = false) {
  const protocol = researchExperimentProtocolSchema.parse(structuredClone(fixed));
  if (firstOnly) protocol.cases = protocol.cases.slice(0, 1);
  const contexts: Array<{
    caseId: string;
    stage: ResearchExperimentStage;
    arm: string;
    previous: unknown[];
  }> = [];
  const messages: string[] = [];
  const generate = vi.fn<ExperimentGenerate>(async (request) => {
    const content = (request.messages[0] as { content: string }).content;
    const context = JSON.parse(content) as (typeof contexts)[number];
    contexts.push(context);
    messages.push(content);
    const entry = protocol.cases.find((item) => item.id === context.caseId)!;
    return {
      output: structuredClone(entry.controlledResponses[context.stage]),
      finishReason: 'stop',
      rawFinishReason: 'stop',
      usage: { status: 'reported', inputTokens: 70, outputTokens: 30 },
      actualModel: protocol.model.id,
      providerCost: null,
      providerCostCurrency: null,
      timeToFirstEventMs: null,
      timeToFirstTextMs: null,
    };
  });
  return {
    protocol,
    contexts,
    messages,
    generate,
    binding: { baseURL: 'http://127.0.0.1:1/v1', generate, cleanupReserveMs: 0 as const },
  };
}
it('两个固定模式均运行单链与三阶段，冻结输入、资金假设及模型一致，生产调用上限不变', async () => {
  const value = fixture(),
    before = experimentFingerprint(value.protocol);
  const report = await runControlledResearchExperiment(value.protocol, value.binding);
  expect(report).toMatchObject({
    passed: true,
    activation: 'not_evaluated',
    mode: 'controlled-offline',
  });
  expect(value.generate).toHaveBeenCalledTimes(8);
  for (const entry of report.cases) {
    expect(entry.single.frozenInputFingerprint).toBe(entry.staged.frozenInputFingerprint);
    expect(entry.single.assumptionsFingerprint).toBe(entry.staged.assumptionsFingerprint);
    expect(entry.single.modelRevision).toBe(entry.staged.modelRevision);
    expect(entry.single.requests).toHaveLength(1);
    expect(entry.staged.requests).toHaveLength(3);
    expect(entry.staged.stages.map((stage) => stage.stage)).toEqual([
      'organize',
      'challenge',
      'synthesize',
    ]);
    expect(entry.staged.finalOutputFingerprint).not.toBeNull();
  }
  expect(experimentFingerprint(value.protocol)).toBe(before);
  expect(DEFAULT_AI_RESEARCH_POLICY_V1.maxAiCalls).toBe(2);
});
it('阶段只消费已核验的前序结果，封存评价不进入模型消息', async () => {
  const value = fixture(true);
  await runControlledResearchExperiment(value.protocol, value.binding);
  expect(value.contexts.map((context) => context.previous.length)).toEqual([0, 0, 1, 2]);
  for (const message of value.messages) {
    expect(message).not.toContain('sealedEvaluation');
    expect(message).not.toContain('qualityGrade');
    expect(message).not.toContain('strategyExcessMean');
  }
});
it('估算与实际费用完整性分列，派发及接收事实不会重复计费，缺失成绩保持空值', async () => {
  const value = fixture();
  const report = await runControlledResearchExperiment(value.protocol, value.binding);
  const arm = report.cases[0]!.staged;
  expect(arm.totals).toMatchObject({
    requests: 3,
    knownInput: 210,
    knownOutput: 90,
    estimatedCostRequests: 3,
    unknownCost: 0,
    actualCostComplete: false,
    actualTotals: null,
  });
  expect(arm.totals.costs).toEqual([{ currency: 'USD', known: '0', estimated: '0.00039' }]);
  expect(arm.qualityGrade).toBeNull();
  expect(arm.returnGrade).toBeNull();
  expect(report.cases[1]!.financialReference).toMatchObject({
    status: 'unknown',
    periods: null,
    strategyExcessMean: null,
  });
  const facts = arm.requests.flatMap((request) => request.facts);
  expect(new Set(facts.map((fact) => fact.eventKey)).size).toBe(facts.length);
  for (const fact of facts) expect(aiInvocationFactSchema.safeParse(fact).success).toBe(true);
});
it('无风险基准逐日对齐后才计算封存参考，未把参考收益分配为模型收益成绩', async () => {
  const value = fixture(true);
  const report = await runControlledResearchExperiment(value.protocol, value.binding);
  expect(report.cases[0]!.financialReference).toMatchObject({
    status: 'aligned',
    periods: 2,
    strategyExcessMean: '0.0024',
    benchmarkExcessMean: '0.0014',
  });
  expect(report.cases[0]!.single.returnGrade).toBeNull();
  expect(report.cases[0]!.staged.returnGrade).toBeNull();
});
it.each(['frequency', 'capital', 'window', 'grade'] as const)(
  '%s 不一致时在调用前拒绝，不补零或重新换算',
  async (kind) => {
    const value = fixture(true),
      raw = structuredClone(value.protocol) as unknown as {
        cases: Array<{
          sealedEvaluation: {
            qualityGrade: unknown;
            economics: {
              riskFree: { frequency: string };
              benchmark: { initialCapital: string };
              strategy: { end: string };
            };
          };
        }>;
      };
    const entry = raw.cases[0]!,
      financial = entry.sealedEvaluation.economics;
    if (kind === 'frequency') financial.riskFree.frequency = 'annual';
    else if (kind === 'capital') financial.benchmark.initialCapital = '5000';
    else if (kind === 'window') financial.strategy.end = '2026-10-22';
    else entry.sealedEvaluation.qualityGrade = 0;
    await expect(runControlledResearchExperiment(raw, value.binding)).rejects.toThrow();
    expect(value.generate).not.toHaveBeenCalled();
  },
);
it('预算不足在请求前阻断，不把单链和阶段组的预算拆开加倍', async () => {
  const value = fixture(true);
  value.protocol.budget.maxInputTokens = 1;
  const report = await runControlledResearchExperiment(value.protocol, value.binding);
  expect(report.cases[0]!.single).toMatchObject({
    status: 'blocked',
    reason: 'budget_exceeded',
    requests: [],
  });
  expect(report.cases[0]!.staged.requests).toEqual([]);
  expect(value.generate).not.toHaveBeenCalled();
});
it.each(['unknown', 'partial'] as const)(
  '%s 计量保留未知消耗并停止后续阶段，不能显示为零实际费用',
  async (kind) => {
    const value = fixture(true),
      original = value.generate.getMockImplementation()!;
    value.generate.mockImplementation(async (request) => ({
      ...(await original(request)),
      usage:
        kind === 'unknown'
          ? { status: 'unknown', inputTokens: null, outputTokens: null }
          : { status: 'partial', inputTokens: 70, outputTokens: null },
    }));
    const report = await runControlledResearchExperiment(value.protocol, value.binding);
    expect(report.cases[0]!.staged).toMatchObject({ status: 'blocked', reason: 'usage_unknown' });
    expect(report.cases[0]!.staged.totals).toMatchObject({
      requests: 1,
      knownInput: kind === 'partial' ? 70 : 0,
      unknownInput: kind === 'partial' ? 0 : 1,
      unknownCost: 1,
      actualTotals: null,
    });
    expect(value.generate).toHaveBeenCalledTimes(2);
  },
);
it('失败的模型绑定仍保留已报告费用并进入调用分母', async () => {
  const value = fixture(true),
    original = value.generate.getMockImplementation()!;
  value.generate.mockImplementation(async (request) => ({
    ...(await original(request)),
    actualModel: 'unexpected-model',
    providerCost: '0.01',
    providerCostCurrency: 'USD',
  }));
  const report = await runControlledResearchExperiment(value.protocol, value.binding);
  expect(report.cases[0]!.staged).toMatchObject({ status: 'blocked', reason: 'model_unqualified' });
  expect(report.cases[0]!.staged.totals).toMatchObject({
    requests: 1,
    knownCostRequests: 1,
    actualCostComplete: true,
    actualTotals: [{ currency: 'USD', amount: '0.01' }],
  });
});
it('数值或引用核验失败成为阻断，不能将未核验的中间结果送到下一阶段', async () => {
  const value = fixture(true);
  const output = value.protocol.cases[0]!.controlledResponses.organize;
  const numeric = output.numericClaims[0]!;
  if (numeric.kind === 'field') numeric.source.value += 1;
  else numeric.value += 1;
  const report = await runControlledResearchExperiment(value.protocol, value.binding);
  expect(report.cases[0]!.staged).toMatchObject({
    status: 'failed',
    reason: 'critical_violation',
    finalOutputFingerprint: null,
  });
  expect(value.generate).toHaveBeenCalledTimes(2);
  expect(report.cases[0]!.staged.requests[0]!.facts.at(-1)!.kind).toBe('received');
});
it('取消后停止两组及后续案例，保留已经尝试的请求与未知费用', async () => {
  const value = fixture(),
    abort = new AbortController();
  value.generate.mockImplementation(async () => {
    abort.abort();
    return new Promise(() => {});
  });
  const report = await runControlledResearchExperiment(value.protocol, {
    ...value.binding,
    signal: abort.signal,
  });
  expect(value.generate).toHaveBeenCalledTimes(1);
  expect(report.cases[0]!.single.status).toBe('cancelled');
  expect(report.cases[0]!.staged.requests).toEqual([]);
  expect(report.cases[0]!.single.totals.actualTotals).toBeNull();
});
it('受控端忽略取消时仍按总时限收敛，不无限等待或重试', async () => {
  const value = fixture(true);
  value.protocol.budget.maxDurationMs = 20;
  value.generate.mockImplementation(async () => new Promise(() => {}));
  const report = await runControlledResearchExperiment(value.protocol, value.binding);
  expect(report.cases[0]!.single.status).toBe('timeout');
  expect(report.cases[0]!.staged.status).toBe('timeout');
  expect(value.generate).toHaveBeenCalledTimes(2);
  expect(report.cases[0]!.staged.requests[0]!.facts.at(-1)).toMatchObject({
    kind: 'unknown',
    cost: { status: 'unknown', amount: null },
  });
});
it('外部响应端及生产模式在适配器调用前被拒绝', async () => {
  const value = fixture(true);
  await expect(
    runControlledResearchExperiment(value.protocol, {
      ...value.binding,
      baseURL: 'https://example.com/v1',
    }),
  ).rejects.toThrow('回环');
  await expect(
    runControlledResearchExperiment({ ...value.protocol, mode: 'live' }, value.binding),
  ).rejects.toThrow();
  expect(value.generate).not.toHaveBeenCalled();
});

it.each(['EUR', 'USD'] as const)(
  '已报告 %s 费用保留原币种，明确零费用与未知费用分开',
  async (currency) => {
    const value = fixture(true),
      original = value.generate.getMockImplementation()!;
    value.generate.mockImplementation(async (request) => ({
      ...(await original(request)),
      providerCost: currency === 'USD' ? '0' : '0.01',
      providerCostCurrency: currency,
    }));
    const report = await runControlledResearchExperiment(value.protocol, value.binding);
    const arm = report.cases[0]!.staged;
    if (currency === 'EUR')
      expect(arm).toMatchObject({ status: 'blocked', reason: 'cost_currency_mismatch' });
    else expect(arm.status).toBe('complete');
    expect(arm.totals.actualCostComplete).toBe(true);
    expect(arm.totals.actualTotals).toEqual([
      { currency, amount: currency === 'USD' ? '0' : '0.01' },
    ]);
  },
);

it.each(['tokens', 'cost'] as const)('收到超额 %s 后保留消耗且停止后续调用', async (kind) => {
  const value = fixture(true),
    original = value.generate.getMockImplementation()!;
  value.generate.mockImplementation(async (request) => {
    const result = await original(request);
    if (kind === 'tokens')
      result.usage = { status: 'reported', inputTokens: 100001, outputTokens: 30 };
    else {
      result.providerCost = '0.03';
      result.providerCostCurrency = 'USD';
    }
    return result;
  });
  const report = await runControlledResearchExperiment(value.protocol, value.binding);
  expect(value.generate).toHaveBeenCalledTimes(2);
  expect(report.cases[0]!.staged).toMatchObject({
    status: 'blocked',
    reason: kind === 'tokens' ? 'token_budget_exceeded' : 'cost_budget_exceeded',
  });
  if (kind === 'cost')
    expect(report.cases[0]!.staged.totals.actualTotals).toEqual([
      { currency: 'USD', amount: '0.03' },
    ]);
});
it('总截止时间跨阶段共享，不给每个阶段重新分配完整时限', async () => {
  const value = fixture(true),
    original = value.generate.getMockImplementation()!;
  value.protocol.budget.maxDurationMs = 50;
  let clock = Date.now();
  value.generate.mockImplementation(async (request) => {
    const result = await original(request);
    clock += 30;
    return result;
  });
  const report = await runControlledResearchExperiment(value.protocol, {
    ...value.binding,
    now: () => clock,
  });
  expect(report.cases[0]!.single.status).toBe('complete');
  expect(report.cases[0]!.staged).toMatchObject({
    status: 'timeout',
    finalOutputFingerprint: null,
  });
  expect(report.cases[0]!.staged.requests).toHaveLength(2);
  expect(value.generate).toHaveBeenCalledTimes(3);
});
