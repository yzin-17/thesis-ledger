import { readFileSync } from 'node:fs';
import { expect, vi } from 'vitest';
import type { ResearchGenerationV2 } from '@thesis-ledger/schemas';
import { experimentFingerprint } from '../../src/ai/research-experiment-protocol.js';
import {
  liveBenchmarkSchema,
  liveEvaluationSchema,
  LIVE_EXPERIMENT_MODEL,
  OPENROUTER_EXPERIMENT_FREE_MODEL,
  OPENROUTER_EXPERIMENT_ALTERNATE_FREE_MODEL,
  type LiveExperimentProtocol,
  type LiveExperimentHistory,
} from '../../src/ai/research-live-experiment-protocol.js';
import type { AiSdkGenerationResult } from '../../src/ai/ai-sdk-generation.adapter.js';

import { AiSdkGenerationError } from '../../src/ai/ai-sdk-generation-facts.js';
import { createLiveExperimentBudget } from '../../src/ai/research-live-experiment-budget.js';
import { runLiveResearchArm } from '../../src/ai/research-live-experiment-arm.js';
import type { LiveTerminalContinuation } from '../../src/ai/research-live-experiment-terminal.js';

const read = (name: string) =>
  JSON.parse(readFileSync(new URL('../fixtures/' + name, import.meta.url), 'utf8'));
export function fixture() {
  const benchmark = liveBenchmarkSchema.parse(read('research-stage-benchmark-v1.json'));
  const evaluation = liveEvaluationSchema.parse(read('research-stage-evaluation-v1.json'));
  const protocol: LiveExperimentProtocol = {
    version: 'research-live-experiment-v2' as const,
    transport: 'stream',
    model: {
      providerId: 'cloudflare' as const,
      id: LIVE_EXPERIMENT_MODEL,
      revision: 'sealed-test-model',
    },
    pricing: {
      costPer1kInput: 0.00045,
      costPer1kOutput: 0.0032,
      costCurrency: 'USD' as const,
      pricingVersion: 'sealed-test-price',
    },
    budget: {
      maxCost: '5',
      currency: 'USD' as const,
      authorizedCalls: null,
      maxInputTokensPerArm: 100000,
      maxOutputTokensPerArm: 6000,
      maxDurationMsPerArm: 600000,
    },
    benchmarkFingerprint: experimentFingerprint(benchmark),
    evaluationFingerprint: experimentFingerprint(evaluation),
  };
  const prior = read('research-experiment-controlled-v1.json').cases[0];
  const generate = vi.fn(async (request) => {
    const context = JSON.parse(request.messages[1].content);
    const entry = benchmark.cases.find(
      (value) => value.frozen.inputFingerprint === context.frozen.inputFingerprint,
    )!;
    const quote = entry.frozen.evidence[0]!;
    const output = JSON.parse(
      JSON.stringify(prior.controlledResponses.single)
        .replaceAll(prior.frozen.evidence[0].audit.evidenceId, quote.audit.evidenceId)
        .replaceAll(
          prior.frozen.scopeSnapshot.instrument.instrumentId,
          entry.frozen.scopeSnapshot.scope === 'instrument'
            ? entry.frozen.scopeSnapshot.instrument.instrumentId
            : '',
        ),
    );
    output.numericClaims = [
      {
        id: 'price',
        description: '基准报价',
        kind: 'field',
        source: {
          evidenceId: quote.audit.evidenceId,
          fieldPath: '/price',
          unit: 'price',
          currency: 'CNY',
          value: (quote.data as { price: number }).price,
        },
      },
    ];
    output.rationale = [entry.topic];
    return {
      output,
      finishReason: 'stop',
      rawFinishReason: null,
      usage: { status: 'reported', inputTokens: 100, outputTokens: 100 },
      actualModel: LIVE_EXPERIMENT_MODEL,
      providerCost: '0',
      providerCostCurrency: 'USD',
      timeToFirstEventMs: 1,
      timeToFirstTextMs: 1,
    } as AiSdkGenerationResult<ResearchGenerationV2>;
  });
  const binding = {
    baseURL: 'https://api.cloudflare.com/client/v4/accounts/test-account/ai/v1',
    apiKey: 'synthetic-test-key',
    generate,
  };
  return { protocol, benchmark, evaluation, binding, generate };
}

export function openRouterFixture(alternate = false) {
  const v = fixture();
  const sourceFingerprint = experimentFingerprint(v.protocol);
  const history: LiveExperimentHistory = {
    sourceProtocolFingerprint: sourceFingerprint,
    sourceReportSha256: 'a'.repeat(64),
    model: v.protocol.model,
    pricingFingerprint: experimentFingerprint(v.protocol.pricing),
    benchmarkFingerprint: v.protocol.benchmarkFingerprint,
    evaluationFingerprint: v.protocol.evaluationFingerprint,
    amount: '0.3232176',
    reservedUnknown: '0.1926',
    requests: 20,
    unknownRequests: 3,
    unknownReservations: [
      {
        protocolFingerprint: sourceFingerprint,
        currency: 'USD',
        maxInputTokens: 100000,
        maxOutputTokens: 6000,
        costPer1kInput: 0.00045,
        costPer1kOutput: 0.0032,
        unknownRequests: 3,
      },
    ],
  };
  const protocol: LiveExperimentProtocol = {
    ...v.protocol,
    version: 'research-live-experiment-v3',
    model: {
      providerId: 'openrouter',
      id: OPENROUTER_EXPERIMENT_FREE_MODEL,
      canonicalId: 'google/gemma-4-26b-a4b-it-20260403',
      revision: 'sealed-openrouter',
    },
    budget: { ...v.protocol.budget, authorizedCalls: 50 },
    pricing: { ...v.protocol.pricing, costPer1kInput: 0, costPer1kOutput: 0 },
    caseIds: [
      'single-price',
      'stale-price',
      'currencies',
      'future-publication',
      'adjustment-basis',
      'dividend-proposal',
      'prompt-injection',
    ],
  };
  if (alternate) {
    history.sourceProtocolFingerprint = experimentFingerprint(protocol);
    history.model = protocol.model;
    history.pricingFingerprint = experimentFingerprint(protocol.pricing);
    history.requests = 21;
    history.unknownRequests = 4;
    history.unknownReservations!.push({
      protocolFingerprint: history.sourceProtocolFingerprint,
      currency: 'USD',
      maxInputTokens: 100000,
      maxOutputTokens: 6000,
      costPer1kInput: 0,
      costPer1kOutput: 0,
      unknownRequests: 1,
    });
    protocol.model = {
      providerId: 'openrouter',
      id: OPENROUTER_EXPERIMENT_ALTERNATE_FREE_MODEL,
      canonicalId: 'xingchen-agi/xing4.0-29b-a4b-20261015',
      revision: 'sealed-alternate',
    };
  }
  const generate = v.generate.getMockImplementation()!;
  v.generate.mockImplementation(async (request) => ({
    ...(await generate(request)),
    actualModel: protocol.model.id.replace(/:free$/, ''),
  }));
  return {
    ...v,
    protocol,
    history,
    binding: { ...v.binding, history, baseURL: 'https://openrouter.ai/api/v1' },
  };
}

export const controlledProviderRejected = () =>
  new AiSdkGenerationError({
    code: 'provider_rejected',
    phase: 'response_headers',
    summary: '受控429',
    externalResult: 'rejected_before_generation',
    requestId: '00000000-0000-4000-8000-000000000001',
    upstreamStatus: 429,
  });

export async function terminalFixture() {
  const v = openRouterFixture(true);
  v.generate
    .mockRejectedValueOnce(controlledProviderRejected())
    .mockRejectedValueOnce(
      new AiSdkGenerationError(
        {
          code: 'schema_invalid',
          phase: 'validation',
          summary: '受控结构失败',
          externalResult: 'complete',
          requestId: '00000000-0000-4000-8000-000000000002',
        },
        { status: 'reported', inputTokens: 100, outputTokens: 100 },
      ),
    )
    .mockRejectedValueOnce(controlledProviderRejected());
  const first = createLiveExperimentBudget(v.protocol, {
    amount: v.history.amount,
    reservedUnknown: v.history.reservedUnknown,
    requests: 21,
  });
  const single = await runLiveResearchArm(
    v.benchmark.cases[0]!,
    'single',
    v.protocol,
    v.binding,
    first,
  );
  const second = createLiveExperimentBudget(v.protocol, {
    amount: v.history.amount,
    reservedUnknown: v.history.reservedUnknown,
    requests: 22,
  });
  const staged = await runLiveResearchArm(
    v.benchmark.cases[0]!,
    'staged',
    v.protocol,
    v.binding,
    second,
  );
  const next = await runLiveResearchArm(
    v.benchmark.cases[1]!,
    'staged',
    v.protocol,
    v.binding,
    second,
  );
  expect(second.snapshot().requests).toBe(24);
  const source: LiveTerminalContinuation = {
    kind: 'terminal-groups-v1',
    sourceProtocolFingerprint: experimentFingerprint(v.protocol),
    retainedArms: [
      { caseId: 'single-price', arm: 'single', result: single },
      { caseId: 'single-price', arm: 'staged', result: staged },
      { caseId: 'stale-price', arm: 'staged', result: next },
    ],
    historicalBudget: v.history,
    sourceRequests: 24,
    sourceSupplementalRequests: 0,
    supplementalBudget: {
      version: 'research-free-probe-budget-v1',
      entries: [
        {
          requestId: '00000000-0000-4000-8000-000000000099',
          resultSHA256: 'b'.repeat(64),
          providerReportedCostUSD: '0',
        },
      ],
    },
  };
  v.generate.mockClear();
  const binding = { baseURL: v.binding.baseURL, apiKey: v.binding.apiKey, generate: v.generate };
  return { ...v, binding, source };
}
