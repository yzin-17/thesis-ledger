import { aiGenerationErrorSchema } from '@thesis-ledger/schemas';
import { describe, expect, it } from 'vitest';
import { AiSdkGenerationError } from '../../src/ai/ai-sdk-generation.adapter.js';
import {
  aiProviderTestSuccessFacts,
  aiProviderTestFailureFacts,
} from '../../src/ai/ai-provider-test-facts.js';

const usage = { status: 'reported', inputTokens: 12, outputTokens: 9 } as const;
const input = { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD' };

describe('诊断实际模型与计量事实', () => {
  it('实际模型来自 SDK，保留上游费用且不以请求别名覆盖', () => {
    expect(
      aiProviderTestSuccessFacts(input, 'requested-alias', {
        actualModel: 'reported-model',
        usage,
        providerCost: '0.01',
        providerCostCurrency: 'USD',
      }),
    ).toMatchObject({
      actualModel: 'reported-model',
      usage,
      cost: { status: 'known', source: 'provider_reported', amount: '0.01' },
    });
  });

  it('未返回实际模型时保留 null，估算费用保持原来源', () => {
    expect(
      aiProviderTestSuccessFacts(input, 'requested-alias', {
        actualModel: null,
        usage,
        providerCost: null,
        providerCostCurrency: null,
      }),
    ).toMatchObject({
      actualModel: null,
      usage,
      cost: { status: 'estimated', source: 'configured_model_pricing', amount: '0' },
    });
  });

  it('失败保留 SDK 已观测的实际模型和已知用量，费用仍为未知', () => {
    const fact = aiGenerationErrorSchema.parse({
      code: 'provider_stream_error',
      phase: 'stream',
      summary: '受控错误',
      externalResult: 'unknown',
      diagnostic: {
        version: 'ai-failure-diagnostic-v1',
        errorClass: 'unknown',
        generationMode: 'json_mode',
        finishReason: null,
        actualModel: 'reported-model',
        outputCharacters: null,
        outputSha256: null,
        jsonStatus: 'missing',
        jsonRootType: null,
        structuralPreview: null,
        truncated: false,
      },
    });
    expect(aiProviderTestFailureFacts(new AiSdkGenerationError(fact, usage))).toMatchObject({
      actualModel: 'reported-model',
      usage,
      cost: { status: 'unknown', amount: null },
    });
  });

  it('普通错误不推断模型、用量或费用', () => {
    expect(aiProviderTestFailureFacts(new Error('受控错误'))).toMatchObject({
      actualModel: null,
      usage: { status: 'unknown', inputTokens: null, outputTokens: null },
      cost: { status: 'unknown', amount: null },
    });
  });
});
