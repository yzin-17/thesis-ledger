import { describe, expect, it, vi } from 'vitest';
import { fetchAiProviderModelCatalog } from '../../src/ai/ai-provider-model-catalog.js';
import { aiProviderInputSchema } from '../../src/ai/ai-provider.contracts.js';
import { parseAiProviderSettings } from '../../src/ai/ai-provider-summary.js';

describe('AI Provider 模型目录推理能力', () => {
  it('保留兼容模型数组并规范化已知推理字段', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              id: 'z-model',
              reasoning: {
                supported_efforts: ['high', 'none', 'unknown', 'high'],
                default_effort: 'high',
                default_enabled: true,
                supports_max_tokens: true,
                mandatory: true,
                secret: 'must not leak',
              },
            },
            { id: 'a-model' },
            { id: 'z-model' },
          ],
        }),
      })),
    );
    try {
      await expect(
        fetchAiProviderModelCatalog('https://ai.example/v1', 'secret', 1_000),
      ).resolves.toEqual({
        models: ['a-model', 'z-model'],
        modelDetails: [
          { id: 'a-model' },
          {
            id: 'z-model',
            reasoning: {
              supportedEfforts: ['none', 'high'],
              defaultEffort: 'high',
              defaultEnabled: true,
              supportsMaxTokens: true,
              mandatory: true,
            },
          },
        ],
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('推理字段损坏时仍返回合法模型且不泄露未知字段', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              id: 'valid-model',
              reasoning: {
                supported_efforts: 'high',
                default_effort: 'invalid',
                mandatory: 'yes',
                upstream_secret: 'do not expose',
              },
            },
          ],
        }),
      })),
    );
    try {
      await expect(
        fetchAiProviderModelCatalog('https://ai.example/v1', '', 1_000),
      ).resolves.toEqual({ models: ['valid-model'], modelDetails: [{ id: 'valid-model' }] });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('区分 supported_efforts 缺失、null 与空或全未知数组', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: 'null-model', reasoning: { supported_efforts: null } },
            { id: 'missing-model', reasoning: { mandatory: true } },
            { id: 'empty-model', reasoning: { supported_efforts: [] } },
            { id: 'unknown-model', reasoning: { supported_efforts: ['future'] } },
          ],
        }),
      })),
    );
    try {
      await expect(
        fetchAiProviderModelCatalog('https://ai.example/v1', '', 1_000),
      ).resolves.toEqual({
        models: ['empty-model', 'missing-model', 'null-model', 'unknown-model'],
        modelDetails: [
          { id: 'empty-model' },
          { id: 'missing-model', reasoning: { mandatory: true } },
          { id: 'null-model', reasoning: { supportedEfforts: null } },
          { id: 'unknown-model' },
        ],
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('配置校验限制推理快照数量和模型范围，回读时过滤旧的非选中项', () => {
    const modelReasoning = {
      'selected-model': { supportedEfforts: ['high'] as const },
    };
    expect(
      aiProviderInputSchema.parse({
        name: 'provider',
        baseUrl: 'https://ai.example/v1',
        models: ['selected-model'],
        modelReasoning,
      }).modelReasoning,
    ).toEqual(modelReasoning);
    expect(() =>
      aiProviderInputSchema.parse({
        name: 'provider',
        baseUrl: 'https://ai.example/v1',
        models: ['selected-model'],
        modelReasoning: { 'not-selected': { supportedEfforts: ['high'] } },
      }),
    ).toThrow();
    expect(
      parseAiProviderSettings({
        baseUrl: 'https://ai.example/v1',
        models: ['selected-model'],
        modelReasoning: {
          'selected-model': { supportedEfforts: ['high'] },
          'removed-model': { supportedEfforts: ['high'] },
        },
      }),
    ).toMatchObject({
      modelReasoning: { 'selected-model': { supportedEfforts: ['high'] } },
    });
    expect(
      parseAiProviderSettings({
        baseUrl: 'https://ai.example/v1',
        models: ['selected-model'],
        modelReasoning: {
          'selected-model': { supportedEfforts: ['high'], upstream: 'ignored' },
        },
      }),
    ).toMatchObject({ models: ['selected-model'] });
  });
});
