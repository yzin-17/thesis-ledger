import { aiGenerationContracts } from '@thesis-ledger/schemas';
import type * as AiModule from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const generateTextMock = vi.hoisted(() => vi.fn());

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof AiModule>();
  return { ...actual, generateText: generateTextMock };
});

import { AiSdkGenerationAdapter } from '../../src/ai/ai-sdk-generation.adapter.js';

type GenerateOptionsProbe = {
  maxRetries?: number;
  telemetry?: { isEnabled?: boolean; recordInputs?: boolean; recordOutputs?: boolean };
  onLanguageModelCallEnd?: (event: {
    usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  }) => void;
};

describe('AI SDK generation adapter SDK boundary', () => {
  beforeEach(() => generateTextMock.mockReset());

  it('keeps deterministic SDK calls single-shot with telemetry payload recording disabled', async () => {
    generateTextMock.mockImplementation(async (rawOptions: unknown) => {
      const options = rawOptions as GenerateOptionsProbe | undefined;
      options?.onLanguageModelCallEnd?.({
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
      });
      return {
        output: { answer: 'mocked' },
        finishReason: 'stop',
        rawFinishReason: 'stop',
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
        response: { modelId: 'mock-model' },
        providerMetadata: undefined,
      };
    });

    const result = await new AiSdkGenerationAdapter().generate({
      requestId: 'sdk-mock-request',
      adapter: 'openai-compatible',
      providerId: 'sdk-mock-provider',
      baseURL: 'https://unused.invalid/v1',
      apiKey: 'unused-secret',
      model: 'mock-model',
      messages: [{ role: 'user', content: 'Return JSON.' }],
      contract: aiGenerationContracts.research.ref,
      schema: z.object({ answer: z.string() }).strict(),
      mode: 'native_schema',
      transport: 'single',
      timeout: { totalMs: 1_000 },
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({
      output: { answer: 'mocked' },
      usage: { status: 'reported', inputTokens: 5, outputTokens: 2 },
      actualModel: 'mock-model',
    });
    const callsWithOptions = generateTextMock.mock.calls.filter(([options]) => options !== undefined);
    expect(callsWithOptions).toHaveLength(1);
    const options = callsWithOptions[0]?.[0] as GenerateOptionsProbe;
    expect(options.maxRetries).toBe(0);
    expect(options.telemetry).toEqual({
      isEnabled: false,
      recordInputs: false,
      recordOutputs: false,
    });
  });
});
