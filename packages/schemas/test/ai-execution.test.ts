import { describe, expect, it } from 'vitest';
import {
  AI_RESEARCH_GENERATION_CONTRACT_VERSION,
  DEFAULT_AI_RESEARCH_POLICY_V1,
  aiAdapterContractEvidenceSchema,
  aiCostFactsSchema,
  aiExecutionSummarySchema,
  aiGenerationContracts,
  aiProviderModelExecutionSchema,
  aiRequestAttemptSchema,
  aiResearchGenerationSchema,
  aiResearchPolicyV1Schema,
  aiResearchRetryPrefillSchema,
  aiUsageFactsSchema,
  aiUsageSummaryReadModelSchema,
} from '../src/index.js';

const time = '2026-09-19T00:00:00Z';
const requestId = '11111111-1111-4111-8111-111111111111';

const unknownCost = {
  status: 'unknown' as const,
  amount: null,
  currency: null,
  source: null,
  pricingVersion: null,
};

describe('AI 生成与执行共享契约', () => {
  it('为三类生成提供稳定版本并拒绝研究结果伪造服务端字段', () => {
    expect(aiGenerationContracts.parameterOptimization.ref.version).toBe(
      'optimization-parameter-v1',
    );
    expect(aiGenerationContracts.strategyDiscovery.ref.version).toBe('strategy-discovery-v2');
    expect(aiGenerationContracts.research.ref.version).toBe(
      AI_RESEARCH_GENERATION_CONTRACT_VERSION,
    );

    const generated = {
      conclusion: '保持观察。',
      evidence: [
        {
          claim: '服务端证据可用。',
          citations: [{ toolCallId: requestId }],
        },
      ],
      risks: ['时点风险'],
      unknowns: [],
      disclaimer: '仅供研究参考。',
    };
    expect(aiResearchGenerationSchema.parse(generated).signals).toEqual([]);
    expect(() =>
      aiResearchGenerationSchema.parse({
        ...generated,
        provider: '模型不得决定 Provider',
        createdAt: time,
        context: { scope: 'portfolio' },
        version: 1,
      }),
    ).toThrow();
    expect(() =>
      aiResearchGenerationSchema.parse({
        ...generated,
        evidence: [{ claim: '伪造引用', citations: [{ tool: 'quote' }] }],
      }),
    ).toThrow();
  });

  it('区分完整、部分和未知 Token，并禁止未知费用伪造为零', () => {
    expect(
      aiUsageFactsSchema.parse({ status: 'reported', inputTokens: 10, outputTokens: 4 }),
    ).toMatchObject({ status: 'reported' });
    expect(
      aiUsageFactsSchema.parse({ status: 'partial', inputTokens: 10, outputTokens: null }),
    ).toMatchObject({ status: 'partial' });
    expect(
      aiUsageFactsSchema.parse({ status: 'unknown', inputTokens: null, outputTokens: null }),
    ).toMatchObject({ status: 'unknown' });
    expect(() =>
      aiUsageFactsSchema.parse({ status: 'reported', inputTokens: 10, outputTokens: null }),
    ).toThrow();
    expect(() => aiCostFactsSchema.parse({ ...unknownCost, amount: '0' })).toThrow();
    expect(
      aiCostFactsSchema.parse({
        status: 'estimated',
        amount: '0',
        currency: 'USD',
        source: 'frozen-price',
        pricingVersion: 'price-v1',
      }),
    ).toMatchObject({ status: 'estimated', amount: '0' });
  });

  it('冻结默认研究策略，付费时要求币种和明确路由', () => {
    expect(DEFAULT_AI_RESEARCH_POLICY_V1).toEqual({
      version: 'research-policy-v1',
      maxAiCalls: 2,
      maxInputTokens: 100_000,
      maxOutputTokens: 20_000,
      maxDurationSeconds: 300,
      maxCost: '0',
      costCurrency: null,
      paidRoutes: [],
    });
    expect(() => aiResearchPolicyV1Schema.parse({ maxCost: '1' })).toThrow();
    expect(
      aiResearchPolicyV1Schema.parse({
        maxCost: '1',
        costCurrency: 'USD',
        paidRoutes: [{ provider: 'openrouter', models: ['model-a'] }],
      }),
    ).toMatchObject({ maxCost: '1', costCurrency: 'USD' });
    expect(() =>
      aiResearchPolicyV1Schema.parse({
        maxCost: '0',
        costCurrency: 'USD',
        paidRoutes: [{ provider: 'openrouter', models: ['model-a'] }],
      }),
    ).toThrow();
  });

  it('保留 prepared 到发送授权、计量修订和幂等结算边界', () => {
    const prepared = {
      requestId,
      sequence: 1,
      state: 'prepared' as const,
      reservation: {
        aiCalls: 1 as const,
        inputTokens: 1_000,
        outputTokens: 10_000,
        cost: unknownCost,
      },
      dispatchExecutionAttempt: null,
      preparedAt: time,
      dispatchingAt: null,
      completedAt: null,
      outcome: null,
      error: null,
      usageRevisions: [],
      settledRevision: 0,
    };
    expect(aiRequestAttemptSchema.parse(prepared).state).toBe('prepared');
    expect(() =>
      aiRequestAttemptSchema.parse({ ...prepared, state: 'dispatching', dispatchingAt: time }),
    ).toThrow();
    expect(() => aiRequestAttemptSchema.parse({ ...prepared, settledRevision: 1 })).toThrow();
    expect(() =>
      aiRequestAttemptSchema.parse({
        ...prepared,
        state: 'completed',
        dispatchExecutionAttempt: 2,
        dispatchingAt: time,
      }),
    ).toThrow(/完成时间和结果事实/);

    const completed = aiRequestAttemptSchema.parse({
      ...prepared,
      state: 'completed',
      dispatchExecutionAttempt: 2,
      dispatchingAt: time,
      completedAt: time,
      outcome: {
        status: 'complete',
        finishReason: 'stop',
        contract: aiGenerationContracts.research.ref,
        schemaAccepted: true,
      },
      usageRevisions: [
        {
          revision: 1,
          usage: { status: 'partial', inputTokens: 20, outputTokens: null },
          cost: unknownCost,
          recordedAt: time,
        },
      ],
      settledRevision: 1,
    });
    expect(completed.dispatchExecutionAttempt).toBe(2);
    expect(() =>
      aiRequestAttemptSchema.parse({
        ...completed,
        usageRevisions: [
          completed.usageRevisions[0]!,
          { ...completed.usageRevisions[0]!, revision: 1 },
        ],
      }),
    ).toThrow(/连续递增/);
  });
});

describe('AI Provider 与消费端共享契约', () => {
  it('将本地契约证据、接入就绪和真实验收分开', () => {
    const adapterEvidence = aiAdapterContractEvidenceSchema.parse({
      adapter: 'openrouter',
      adapterVersion: '3.0.0',
      sdkVersion: '7.0.95',
      contract: aiGenerationContracts.research.ref,
      mode: 'native_schema',
      releaseFingerprint: 'release-1',
    });
    const model = aiProviderModelExecutionSchema.parse({
      model: 'model-a',
      adapter: 'openrouter',
      mode: 'native_schema',
      contract: aiGenerationContracts.research.ref,
      adapterEvidence,
      readiness: {
        state: 'ready',
        reasons: [],
        configurationFingerprint: 'config-1',
        evaluatedAt: time,
      },
      liveValidation: { status: 'not_run', checkedAt: null, requestId: null },
    });
    expect(model.readiness.state).toBe('ready');
    expect(model.liveValidation.status).toBe('not_run');
    expect(() =>
      aiProviderModelExecutionSchema.parse({
        ...model,
        readiness: { ...model.readiness, state: 'blocked', reasons: [] },
      }),
    ).toThrow();
    expect(model).not.toHaveProperty('capabilityDeclaration');
    expect(() =>
      aiProviderModelExecutionSchema.parse({
        ...model,
        capabilityDeclaration: null,
      }),
    ).toThrow();
    expect(() =>
      aiProviderModelExecutionSchema.parse({
        ...model,
        adapterEvidence: { ...adapterEvidence, mode: 'json_validated' },
      }),
    ).toThrow(/必须匹配 adapter/);
    expect(() =>
      aiProviderModelExecutionSchema.parse({
        ...model,
        liveValidation: { status: 'passed', checkedAt: null, requestId: null },
      }),
    ).toThrow(/真实验收结果必须包含/);
  });

  it('再次生成预填明确区分普通失败、未知结果和失效上下文', () => {
    expect(
      aiResearchRetryPrefillSchema.parse({
        sourceRunId: requestId,
        question: '重新检查风险？',
        context: { scope: 'portfolio' },
        templateId: null,
        sourceOutcome: 'unknown',
        contextState: 'missing',
        requiresUnknownOutcomeAcknowledgement: true,
      }),
    ).toMatchObject({ sourceOutcome: 'unknown', contextState: 'missing' });
    expect(() =>
      aiResearchRetryPrefillSchema.parse({
        sourceRunId: requestId,
        question: '重新检查风险？',
        context: { scope: 'portfolio' },
        templateId: null,
        sourceOutcome: 'failed',
        contextState: 'valid',
        requiresUnknownOutcomeAcknowledgement: true,
      }),
    ).toThrow(/只有 unknown 来源/);
  });

  it('读模型显式保留历史未知、部分合计、多币种和停止原因', () => {
    expect(
      aiUsageSummaryReadModelSchema.parse({
        runs: 4,
        reportedInputTokens: 20,
        reportedOutputTokens: 10,
        partialRuns: 1,
        unknownRuns: 1,
        legacyUnknownRuns: 1,
        unknownCostRuns: 1,
        unconfirmedInputTokenReservation: 100,
        unconfirmedOutputTokenReservation: 20,
        costs: [
          {
            currency: 'USD',
            knownAmount: '1.2',
            estimatedAmount: '0.3',
            unconfirmedReservedAmount: '0.1',
          },
          {
            currency: 'CNY',
            knownAmount: '0',
            estimatedAmount: '2',
            unconfirmedReservedAmount: '0',
          },
        ],
      }).costs,
    ).toHaveLength(2);

    expect(
      aiExecutionSummarySchema.parse({
        version: 'sdk-execution-v1',
        contract: aiGenerationContracts.research.ref,
        frozenPolicy: DEFAULT_AI_RESEARCH_POLICY_V1,
        deadlineAt: time,
        generationStatus: 'complete',
        usageCompleteness: 'legacy_unknown',
        requests: [],
        continuationBlockedReason: 'budget_exceeded',
      }),
    ).toMatchObject({
      generationStatus: 'complete',
      continuationBlockedReason: 'budget_exceeded',
    });
  });
});
