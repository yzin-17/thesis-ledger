import { describe, expect, it } from 'vitest';
import {
  aiExecutionReadModel,
  aiUsageSummaryReadModel,
  safeAttemptMetadata,
} from '../../src/ai/ai-execution-read-model.js';

const time = '2026-09-19T00:00:00.000Z';

const request = (input: {
  id: string;
  usage?: {
    status: 'reported' | 'partial' | 'unknown';
    inputTokens: number | null;
    outputTokens: number | null;
  };
  cost?: {
    status: 'known' | 'estimated' | 'unknown';
    amount: string | null;
    currency: string | null;
  };
  reservationCost?: {
    status: 'known' | 'estimated' | 'unknown';
    amount: string | null;
    currency: string | null;
  };
}) => ({
  requestId: input.id,
  sequence: 1,
  state: input.usage ? ('completed' as const) : ('unknown' as const),
  reservation: {
    aiCalls: 1 as const,
    inputTokens: 100,
    outputTokens: 20,
    cost: {
      ...(input.reservationCost ?? { status: 'estimated', amount: '0.4', currency: 'USD' }),
      source: 'frozen-price',
      pricingVersion: 'v1',
    },
    provider: 'fixture',
    model: 'fixture-model',
    configurationFingerprint: 'must-not-leak',
  },
  dispatchExecutionAttempt: 1,
  preparedAt: time,
  dispatchingAt: time,
  completedAt: time,
  outcome: input.usage
    ? {
        status: 'complete' as const,
        finishReason: 'stop',
        contract: { id: 'research' as const, version: 'research-generation-v1' as const },
        schemaAccepted: true,
      }
    : null,
  error: input.usage
    ? {
        code: 'provider_rejected' as const,
        phase: 'stream' as const,
        summary: 'Bearer secret must-not-leak',
        externalResult: 'complete' as const,
        requestId: input.id,
      }
    : {
        code: 'transport_unknown' as const,
        phase: 'request' as const,
        summary: 'api_key=secret must-not-leak',
        externalResult: 'unknown' as const,
        requestId: input.id,
      },
  usageRevisions: input.usage
    ? [
        {
          revision: 1,
          usage: input.usage,
          cost: {
            ...(input.cost ?? { status: 'known', amount: '0.2', currency: 'USD' }),
            source: 'provider',
            pricingVersion: 'v1',
          },
          recordedAt: time,
        },
      ]
    : [],
  settledRevision: input.usage ? 1 : 0,
});

const execution = (usageCompleteness: 'reported' | 'partial' | 'unknown', requests: unknown[]) => ({
  version: 'sdk-execution-v1' as const,
  contract: { id: 'research' as const, version: 'research-generation-v1' as const },
  frozenPolicy: {
    version: 'research-policy-v1' as const,
    maxAiCalls: 2,
    maxInputTokens: 100_000,
    maxOutputTokens: 20_000,
    maxDurationSeconds: 300,
    maxCost: '0',
    costCurrency: null,
    paidRoutes: [],
  },
  deadlineAt: '2026-09-19T00:05:00.000Z',
  generationStatus: usageCompleteness === 'unknown' ? ('unknown' as const) : ('complete' as const),
  usageCompleteness,
  requests,
  continuationBlockedReason: usageCompleteness === 'unknown' ? ('cost_unknown' as const) : null,
});

describe('AI 执行读模型', () => {
  it('只公开白名单请求事实并保留冻结策略和停止原因', () => {
    const model = aiExecutionReadModel({
      sdkExecution: execution('reported', [
        request({
          id: '11111111-1111-4111-8111-111111111111',
          usage: { status: 'reported', inputTokens: 10, outputTokens: 5 },
        }),
      ]),
      apiKey: 'must-not-leak',
    });

    expect(model).toMatchObject({
      frozenPolicy: { maxAiCalls: 2, maxCost: '0' },
      usageCompleteness: 'reported',
      requests: [
        {
          usage: { status: 'reported', inputTokens: 10, outputTokens: 5 },
          cost: { status: 'known', amount: '0.2', currency: 'USD' },
          error: { code: 'provider_rejected', phase: 'stream' },
        },
      ],
    });
    expect(JSON.stringify(model)).not.toContain('must-not-leak');
    expect(JSON.stringify(model)).not.toContain('configurationFingerprint');
  });

  it('汇总已报告部分、未知预留、历史未知及多币种费用，不读取旧数值占位', () => {
    const rows = [
      {
        inputTokens: 999,
        outputTokens: 999,
        cost: '999',
        modelMetadata: {
          sdkExecution: execution('reported', [
            request({
              id: '11111111-1111-4111-8111-111111111111',
              usage: { status: 'reported', inputTokens: 10, outputTokens: 5 },
            }),
          ]),
        },
      },
      {
        inputTokens: 20,
        outputTokens: 0,
        cost: '0.3',
        modelMetadata: {
          sdkExecution: execution('partial', [
            request({
              id: '21111111-1111-4111-8111-111111111111',
              usage: { status: 'partial', inputTokens: 20, outputTokens: null },
              cost: { status: 'estimated', amount: '0.3', currency: 'CNY' },
            }),
          ]),
        },
      },
      {
        inputTokens: 0,
        outputTokens: 0,
        cost: '0',
        modelMetadata: {
          sdkExecution: execution('unknown', [
            request({ id: '31111111-1111-4111-8111-111111111111' }),
          ]),
        },
      },
      { inputTokens: 88, outputTokens: 77, cost: '66', modelMetadata: {} },
    ];

    expect(aiUsageSummaryReadModel(rows)).toEqual({
      runs: 4,
      reportedInputTokens: 30,
      reportedOutputTokens: 5,
      partialRuns: 1,
      unknownRuns: 1,
      legacyUnknownRuns: 1,
      unknownCostRuns: 1,
      unconfirmedInputTokenReservation: 100,
      unconfirmedOutputTokenReservation: 40,
      costs: [
        {
          currency: 'CNY',
          knownAmount: '0',
          estimatedAmount: '0.3',
          unconfirmedReservedAmount: '0',
        },
        {
          currency: 'USD',
          knownAmount: '0.2',
          estimatedAmount: '0',
          unconfirmedReservedAmount: '0.4',
        },
      ],
    });
  });

  it('优化 attempt 元数据只保留费用分类字段', () => {
    expect(
      safeAttemptMetadata({
        costStatus: 'known',
        costCurrency: 'USD',
        pricingVersion: 'catalog-v1',
        prompt: 'must-not-leak',
        credential: 'must-not-leak',
      }),
    ).toEqual({
      costStatus: 'known',
      costCurrency: 'USD',
      pricingVersion: 'catalog-v1',
    });
  });
});
