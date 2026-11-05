import http from 'node:http';
import { expect, it } from 'vitest';
import { DEFAULT_AI_RESEARCH_POLICY_V1, type ResearchGenerationV2 } from '@thesis-ledger/schemas';
import { experimentFingerprint } from '../../src/ai/research-experiment-protocol.js';
import { runLiveResearchExperiment } from '../../src/ai/research-live-experiment-driver.js';
import {
  qualifyLiveExperiment,
  LIVE_EXPERIMENT_MODEL,
} from '../../src/ai/research-live-experiment-protocol.js';
import {
  evaluateLiveExperiment,
  scoreLiveResearchOutput,
} from '../../src/ai/research-live-experiment-evaluation.js';
import { createLiveExperimentBudget } from '../../src/ai/research-live-experiment-budget.js';
import { verifyLiveExperimentResume } from '../../src/ai/research-live-experiment-resume.js';
import { AiSdkGenerationAdapter } from '../../src/ai/ai-sdk-generation.adapter.js';
import type { LiveExperimentBinding } from '../../src/ai/research-live-experiment-arm.js';

import { fixture, openRouterFixture } from './research-live-experiment-fixture.js';
it('20个独立冻结案例与封存评价形成真实协议，原生产调用上限保持2', () => {
  const value = fixture();
  expect(
    qualifyLiveExperiment(value.protocol, value.benchmark, value.evaluation).benchmark.cases,
  ).toHaveLength(20);
  expect(DEFAULT_AI_RESEARCH_POLICY_V1.maxAiCalls).toBe(2);
});

it('相同协议下20例实际执行80个受控SDK请求，评价材料不进入消息', async () => {
  const v = fixture();
  const report = await runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, v.binding);
  expect(report.allCasesAttempted).toBe(true);
  expect(report.actualModelRequests).toBe(80);
  expect(v.generate).toHaveBeenCalledTimes(80);
  expect(
    report.cases.every(
      (entry) => entry.single.status === 'complete' && entry.staged.status === 'complete',
    ),
  ).toBe(true);
  for (const [request] of v.generate.mock.calls) {
    const content = JSON.stringify(request.messages);
    expect(content).not.toContain('fact-and-boundary-coverage');
    expect(content).not.toContain('criteria');
    expect(content).not.toContain('scoreChecks');
  }
  expect(
    report.cases.every(
      (entry) => entry.single.requests.length === 1 && entry.staged.requests.length === 3,
    ),
  ).toBe(true);
});

it('封存摘要变化、重复案例及错误引用在生成前拒绝', async () => {
  for (const change of ['digest', 'duplicate', 'binding']) {
    const v = fixture();
    if (change === 'digest') v.evaluation.cases[0]!.criteria[0]!.description = 'changed';
    else if (change === 'duplicate') v.benchmark.cases[1] = structuredClone(v.benchmark.cases[0]!);
    else v.benchmark.cases[0]!.ownedToolCallIds = [];
    if (change !== 'digest') v.protocol.benchmarkFingerprint = experimentFingerprint(v.benchmark);
    await expect(
      runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, v.binding),
    ).rejects.toThrow();
    expect(v.generate).not.toHaveBeenCalled();
  }
});

it('零费用预算在真实派发前阻断，不修改正费率或凭据', async () => {
  const v = fixture();
  v.protocol.budget.maxCost = '0';
  const report = await runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, v.binding);
  expect(v.generate).not.toHaveBeenCalled();
  expect(report.actualModelRequests).toBe(0);
  expect(report.allCasesAttempted).toBe(false);
});

it('费用上限不能超过本次授权的5 USD', async () => {
  const v = fixture();
  v.protocol.budget.maxCost = '5.000000000000000001';
  await expect(
    runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, v.binding),
  ).rejects.toThrow();
  expect(v.generate).not.toHaveBeenCalled();
});

it('模型漂移和未知计量停止后续案例，已经发生的请求保留', async () => {
  for (const failure of ['model', 'usage']) {
    const v = fixture();
    const generate = v.generate.getMockImplementation()!;
    v.generate.mockImplementation(async (request) => {
      const result = await generate(request);
      if (failure === 'model') result.actualModel = 'different-model';
      else {
        result.usage.outputTokens = null;
        result.usage.status = 'partial';
      }
      return result;
    });
    const report = await runLiveResearchExperiment(
      v.protocol,
      v.benchmark,
      v.evaluation,
      v.binding,
    );
    expect(v.generate).toHaveBeenCalledTimes(1);
    expect(report.allCasesAttempted).toBe(false);
    expect(report.budget.stopped).not.toBeNull();
  }
});

it('上游未知错误不自动重试或继续下一案例', async () => {
  const v = fixture();
  v.generate.mockRejectedValue(new Error('synthetic transport failure'));
  const report = await runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, v.binding);
  expect(v.generate).toHaveBeenCalledTimes(1);
  expect(report.budget.stopped).toBe('unknown_outcome');
  expect(report.cases[0]!.single.requests[0]!.facts.at(-1)!.cost.status).toBe('unknown');
});

it('实际费用和估算费用分列，全局超额后停止派发', async () => {
  const v = fixture();
  const generate = v.generate.getMockImplementation()!;
  v.generate.mockImplementation(async (request) => ({
    ...(await generate(request)),
    providerCost: '5.01',
  }));
  const report = await runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, v.binding);
  expect(v.generate).toHaveBeenCalledTimes(1);
  expect(report.budget.stopped).toBe('cost_budget_exceeded');
  expect(report.cases[0]!.single.actualCost).toBe(5.01);
  expect(report.cases[0]!.single.estimatedCost).toBeGreaterThan(0);
});

it('封存词组可重算，失败产物保持未知，不将缺失评分填零', () => {
  const v = fixture();
  const ref = v.evaluation.cases[0]!;
  expect(scoreLiveResearchOutput(null, ref).grade).toBeNull();
  const output = {
    conclusion: '只有单次报价，不足以确认未来方向，历史价格未提供。',
  } as ResearchGenerationV2;
  expect(scoreLiveResearchOutput(output, ref).grade).toBe(1);
});

it('部分停止的未派发占位不计失败，额外实派发组的未知费用仍保留', async () => {
  const v = fixture();
  const generate = v.generate.getMockImplementation()!;
  let requests = 0;
  v.generate.mockImplementation(async (request) => {
    requests++;
    if (requests === 5) throw new Error('synthetic unknown outcome');
    return generate(request);
  });
  const report = await runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, v.binding);
  expect(requests).toBe(5);
  expect(report.cases[1]!.single.requests).toHaveLength(0);
  expect(report.evaluation.visitedCases).toBe(2);
  expect(report.evaluation.completedCases).toBe(1);
  expect(report.evaluation.singleAttemptedArms).toBe(1);
  expect(report.evaluation.stagedAttemptedArms).toBe(2);
  expect(report.evaluation.singleUnattemptedArms).toBe(1);
  expect(report.evaluation.singleFailureRate).toBe(0);
  expect(report.evaluation.stagedFailureRate).toBe(0.5);
  expect(report.evaluation.actualCostComplete).toBe(false);
  expect(report.evaluation.costRatio).toBeNull();
  expect(report.evaluation.criteria.minimumCases).toBe(false);
  expect(report.allCasesAttempted).toBe(false);
});

it('费用同为零可以比较，未知费用或不足20对时不激活', () => {
  const arm = {
    status: 'complete' as const,
    reason: null,
    durationMs: 100,
    grade: 0.5,
    actualCost: 0,
    estimatedCost: 0.01,
    criticalViolations: 0,
  };
  const cases = Array.from({ length: 20 }, () => ({
    single: { ...arm },
    staged: { ...arm, grade: 0.75 },
  }));
  expect(evaluateLiveExperiment(cases).decision).toBe('eligible_for_activation');
  cases[0]!.single.actualCost = null as unknown as number;
  expect(evaluateLiveExperiment(cases).decision).toBe('keep_single');
  expect(evaluateLiveExperiment(cases.slice(0, 19)).criteria.quality).toBe(false);
});

it('非官方响应端和含凭据的URL在调用前拒绝', async () => {
  const v = fixture();
  await expect(
    runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, {
      ...v.binding,
      baseURL: 'https://example.com/v1',
    }),
  ).rejects.toThrow();
  expect(v.generate).not.toHaveBeenCalled();
});

it('请求估算预留只消费本次5 USD预算，未知消耗不扩大额度', () => {
  const v = fixture();
  const budget = createLiveExperimentBudget(v.protocol);
  expect(budget.reserve([{ role: 'user', content: 'hello' }], 0, 0, 3)).not.toBeNull();
  budget.unknownFailure(null, 'unknown');
  expect(budget.reserve([], 0, 0, 1)).toBeNull();
});

it('无效实报费用不减少已消费金额或伪造实报完整性', () => {
  const v = fixture();
  const budget = createLiveExperimentBudget(v.protocol);
  const result = budget.settle(
    {
      usage: { status: 'reported', inputTokens: 100, outputTokens: 100 },
      providerCost: '-1',
      providerCostCurrency: 'USD',
    },
    LIVE_EXPERIMENT_MODEL,
  );
  expect(result.stopped).toBe('cost_currency_or_value_invalid');
  expect(result.actualCost).toBeNull();
  expect(Number(budget.snapshot().spent)).toBeGreaterThan(0);
});

it.each(['cloudflare', 'openrouter', 'openrouter-xingchen'] as const)(
  '既有SDK经过实际回环HTTP完成所选案例，%s传输与审计一致',
  async (providerId) => {
    const v =
      providerId === 'cloudflare'
        ? fixture()
        : openRouterFixture(providerId === 'openrouter-xingchen');
    const expectedRequests = providerId === 'cloudflare' ? 80 : 28;
    const adapter = new AiSdkGenerationAdapter();
    let pending: ResearchGenerationV2 | null = null;
    let received = 0;
    const server = http.createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += chunk;
      expect(JSON.parse(body).messages).toHaveLength(2);
      received++;
      expect(JSON.parse(body).stream).toBe(true);
      expect(JSON.parse(body).model).toBe(v.protocol.model.id);
      if (providerId !== 'cloudflare') {
        expect(JSON.parse(body).models).toBeUndefined();
        expect(JSON.parse(body).usage.include).toBe(true);
        expect(JSON.parse(body).reasoning.enabled).toBe(false);
      }
      res.setHeader('content-type', 'text/event-stream');
      const frame = {
        id: 'synthetic-' + received,
        model: v.protocol.model.id.replace(/:free$/, ''),
        created: 1700000000,
      };
      res.write(
        'data: ' +
          JSON.stringify({
            ...frame,
            choices: [
              {
                index: 0,
                delta: { role: 'assistant', content: JSON.stringify(pending) },
                finish_reason: null,
              },
            ],
          }) +
          '\n\n',
      );
      res.write(
        'data: ' +
          JSON.stringify({
            ...frame,
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200, cost: 0 },
          }) +
          '\n\n',
      );
      res.end('data: [DONE]\n\n');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const report = await runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, {
        ...v.binding,
        generate: async (input) => {
          pending = (await v.generate(input)).output;
          return adapter.generate({
            ...input,
            httpClient: (_resource, options) =>
              fetch(`http://127.0.0.1:${port}/v1/chat/completions`, options),
          });
        },
      });
      expect(
        report.allCasesAttempted,
        JSON.stringify({
          budget: report.budget,
          reasons: report.cases.map((entry) => [entry.single.reason, entry.staged.reason]),
        }),
      ).toBe(true);
      expect(report.actualModelRequests).toBe(expectedRequests);
      expect(received).toBe(expectedRequests);
      if (providerId !== 'cloudflare') {
        expect(report.budget.requests).toBe(providerId === 'openrouter' ? 48 : 49);
        expect(report.budget.reservedUnknown).toBe('0.1926');
        expect(report.budget.committed).toBe('0.3232176');
        expect(report.evaluation.criteria.minimumCases).toBe(false);
        expect(report.evaluation.costRatio).toBe(1);
        expect(
          report.cases.every(
            (entry) => entry.single.actualCost === 0 && entry.staged.actualCost === 0,
          ),
        ).toBe(true);
      }
      expect(
        report.cases.every(
          (entry) => entry.single.status === 'complete' && entry.staged.status === 'complete',
        ),
      ).toBe(true);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);

it('OpenRouter固定模型拒绝随机型号、历史预留清零及缺少累计账本', async () => {
  for (const change of ['model', 'reserve', 'lots', 'history', 'host']) {
    const v = openRouterFixture();
    if (change === 'model') (v.protocol.model as { id: string }).id = 'openrouter/free';
    if (change === 'reserve') v.history.reservedUnknown = '0';
    if (change === 'lots') delete v.history.unknownReservations;
    const binding: LiveExperimentBinding = {
      ...v.binding,
      baseURL:
        change === 'host'
          ? 'https://api.cloudflare.com/client/v4/accounts/test/ai/v1'
          : v.binding.baseURL,
    };
    if (change === 'history') delete binding.history;
    await expect(
      runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, binding),
    ).rejects.toThrow();
    expect(v.generate).not.toHaveBeenCalled();
  }
});

it('累计50次是硬上限，原20次及费用始终保留', () => {
  const v = openRouterFixture();
  const budget = createLiveExperimentBudget(v.protocol, {
    amount: '0.3232176',
    reservedUnknown: '0.1926',
    requests: 49,
  });
  expect(budget.reserve([], 0, 0, 1)).not.toBeNull();
  expect(budget.reserve([], 0, 0, 1)).toBeNull();
  expect(budget.snapshot()).toMatchObject({
    requests: 50,
    committed: '0.3232176',
    reservedUnknown: '0.1926',
    stopped: 'request_budget_exhausted',
  });
});

it('逐请求在派发前和核验后提供检查点，回调不改变模型消息', async () => {
  const v = fixture();
  const events: string[] = [];
  const report = await runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, {
    ...v.binding,
    onRequest: (entry) => events.push(entry.phase),
  });
  expect(report.actualModelRequests).toBe(80);
  expect(events.filter((entry) => entry === 'dispatching')).toHaveLength(80);
  expect(events.filter((entry) => entry === 'received')).toHaveLength(80);
  expect(events.filter((entry) => entry === 'settled')).toHaveLength(80);
});

it('接续复用完整首例组，未知尝试保留并预留预算，实际只派发剩余76次', async () => {
  const v = fixture();
  const prior = await runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, v.binding);
  const completedArms = (['single', 'staged'] as const).map((arm) => ({
    caseId: v.benchmark.cases[0]!.id,
    arm,
    result: prior.cases[0]![arm],
  }));
  const resume = {
    sourceProtocolFingerprint: experimentFingerprint(v.protocol),
    completedArms,
    unresolvedRequests: [
      { caseId: v.benchmark.cases[1]!.id, arm: 'staged' as const, ordinal: 5, requestId: null },
    ],
  };
  const ready = verifyLiveExperimentResume(v.protocol, v.benchmark, v.evaluation, resume);
  expect(Number(ready.initial.reservedUnknown)).toBeCloseTo(0.0642);
  v.generate.mockClear();
  const report = await runLiveResearchExperiment(
    v.protocol,
    v.benchmark,
    v.evaluation,
    v.binding,
    resume,
  );
  expect(v.generate).toHaveBeenCalledTimes(76);
  expect(report.reusedRequests).toBe(4);
  expect(report.allCasesAttempted).toBe(true);
  expect(report.evaluation.priorUnknownAttempts).toBe(1);
  expect(report.evaluation.stagedFailureRate).toBeCloseTo(1 / 21);
  expect(report.evaluation.latencyRatio).toBeNull();
  expect(report.budget.requests).toBe(81);
});

it('接续拒绝评分篡改、重复组或不同协议，不丢弃原消费', async () => {
  const v = fixture();
  const prior = await runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, v.binding);
  const entry = {
    caseId: v.benchmark.cases[0]!.id,
    arm: 'single' as const,
    result: prior.cases[0]!.single,
  };
  const base = {
    sourceProtocolFingerprint: experimentFingerprint(v.protocol),
    completedArms: [entry],
    unresolvedRequests: [],
  };
  expect(() =>
    verifyLiveExperimentResume(v.protocol, v.benchmark, v.evaluation, {
      ...base,
      sourceProtocolFingerprint: '0'.repeat(64),
    }),
  ).toThrow();
  expect(() =>
    verifyLiveExperimentResume(v.protocol, v.benchmark, v.evaluation, {
      ...base,
      completedArms: [entry, entry],
    }),
  ).toThrow();
  const changed = structuredClone(base);
  changed.completedArms[0]!.result.grade = 0.123;
  expect(() =>
    verifyLiveExperimentResume(v.protocol, v.benchmark, v.evaluation, changed),
  ).toThrow();
});

it('原未知预留已占满预算时，新请求不能再派发', () => {
  const v = fixture();
  const budget = createLiveExperimentBudget(v.protocol, {
    amount: '5',
    reservedUnknown: '0.0642',
    requests: 5,
  });
  expect(budget.reserve([{ role: 'user', content: 'new' }], 0, 0, 1)).toBeNull();
  expect(budget.snapshot().reservedUnknown).toBe('0.0642');
  expect(budget.snapshot().committed).toBe('5');
});

it('流式新协议显式使用首输出/间隔/组总期限，历史预算不清零', async () => {
  const v = fixture();
  const history = {
    sourceProtocolFingerprint: '1'.repeat(64),
    sourceReportSha256: '2'.repeat(64),
    model: v.protocol.model,
    pricingFingerprint: experimentFingerprint(v.protocol.pricing),
    benchmarkFingerprint: v.protocol.benchmarkFingerprint,
    evaluationFingerprint: v.protocol.evaluationFingerprint,
    amount: '0.16348465',
    reservedUnknown: '0.1284',
    requests: 7,
    unknownRequests: 2,
  };
  const report = await runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, {
    ...v.binding,
    history,
  });
  expect(v.generate).toHaveBeenCalledTimes(80);
  expect(report.budget.requests).toBe(87);
  expect(report.budget.reservedUnknown).toBe('0.1284');
  expect(report.budget.spent).toBe('0.03508465');
  expect(report.historicalBudget?.unknownRequests).toBe(2);
  for (const [request] of v.generate.mock.calls) {
    expect(request.transport).toBe('stream');
    expect(request.timeout.firstChunkMs).toBeLessThanOrEqual(120000);
    expect(request.timeout.chunkMs).toBeLessThanOrEqual(60000);
  }
});

it('跨协议历史不能少留未知费用或冒充同协议新试跑', async () => {
  const v = fixture();
  const history = {
    sourceProtocolFingerprint: '1'.repeat(64),
    sourceReportSha256: '2'.repeat(64),
    model: v.protocol.model,
    pricingFingerprint: experimentFingerprint(v.protocol.pricing),
    benchmarkFingerprint: v.protocol.benchmarkFingerprint,
    evaluationFingerprint: v.protocol.evaluationFingerprint,
    amount: '0.16348465',
    reservedUnknown: '0.00001',
    requests: 7,
    unknownRequests: 2,
  };
  await expect(
    runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, { ...v.binding, history }),
  ).rejects.toThrow();
  history.reservedUnknown = '0.1284';
  history.sourceProtocolFingerprint = experimentFingerprint(v.protocol);
  await expect(
    runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, { ...v.binding, history }),
  ).rejects.toThrow();
  expect(v.generate).not.toHaveBeenCalled();
});
