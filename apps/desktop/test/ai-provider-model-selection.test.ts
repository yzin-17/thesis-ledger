import { describe, expect, it } from 'vitest';
import {
  aiProviderDraftError,
  aiProviderInputFromDraft,
} from '../src/features/providers/ai-provider.actions.js';
import { newAiProviderExecutionRouteDraft } from '../src/features/providers/ai-provider-execution.js';
import { withAiProviderModels } from '../src/features/providers/ai-provider-model-selection.js';
import { newAiProviderDraft } from '../src/features/providers/providers.types.js';

const draftWithTwoModels = () => ({
  ...newAiProviderDraft(),
  name: 'openrouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  modelsText: 'openrouter/free\nremoved-model',
  executionRoutes: [
    newAiProviderExecutionRouteDraft('openrouter/free'),
    newAiProviderExecutionRouteDraft('removed-model'),
    {
      ...newAiProviderExecutionRouteDraft('removed-model'),
      contractId: 'parameter_optimization' as const,
      enabled: false,
    },
  ],
  modelDefaults: {
    'openrouter/free': { mode: 'native_schema' as const },
    'removed-model': { mode: 'json_validated' as const },
  },
  modelPricing: {
    'openrouter/free': { costPer1kInput: '0', costPer1kOutput: '0', costCurrency: 'USD' },
    'removed-model': { costPer1kInput: '1', costPer1kOutput: '2', costCurrency: 'USD' },
  },
  modelReasoning: {
    'openrouter/free': { supportedEfforts: ['low' as const] },
    'removed-model': { supportedEfforts: ['high' as const] },
  },
});

describe('模型选择与关联草稿同步', () => {
  it('删除模型后保存输入可通过校验，且清理全部关联配置并保持剩余模型原值', () => {
    const draft = draftWithTwoModels();
    expect(
      aiProviderDraftError(aiProviderInputFromDraft({ ...draft, modelsText: 'openrouter/free' })),
    ).toBe('执行路由必须选择已配置的模型。');

    const next = withAiProviderModels(draft, ['openrouter/free']);
    const input = aiProviderInputFromDraft(next);
    expect(aiProviderDraftError(input)).toBeNull();
    expect(input.models).toEqual(['openrouter/free']);
    expect(next.executionRoutes).toEqual([draft.executionRoutes[0]]);
    expect(next.executionRoutes[0]).toBe(draft.executionRoutes[0]);
    for (const field of ['modelDefaults', 'modelPricing', 'modelReasoning'] as const) {
      expect(next[field]).not.toHaveProperty('removed-model');
      expect(next[field]['openrouter/free']).toBe(draft[field]['openrouter/free']);
    }
    expect(draft.executionRoutes).toHaveLength(3);
    expect(draft.modelsText).toContain('removed-model');
  });

  it('清空选择后仍明确提示至少配置一个模型', () => {
    const next = withAiProviderModels(draftWithTwoModels(), []);
    expect(aiProviderDraftError(aiProviderInputFromDraft(next))).toBe('请至少填写一个模型。');
    expect(next.executionRoutes).toEqual([]);
    expect(next.modelPricing).toEqual({});
    expect(next.modelDefaults).toEqual({});
    expect(next.modelReasoning).toEqual({});
  });

  it('重新添加模型不会恢复已删除的用途、价格或默认生成方式', () => {
    const removed = withAiProviderModels(draftWithTwoModels(), ['openrouter/free']);
    const added = withAiProviderModels(removed, ['openrouter/free', 'removed-model']);
    expect(added.executionRoutes).toEqual(removed.executionRoutes);
    expect(added.modelPricing).not.toHaveProperty('removed-model');
    expect(added.modelDefaults).not.toHaveProperty('removed-model');
    expect(added.modelReasoning).not.toHaveProperty('removed-model');
  });

  it('新增模型仅合并目录推理信息，不自动配置价格或用途', () => {
    const draft = draftWithTwoModels();
    const next = withAiProviderModels(
      draft,
      ['openrouter/free', 'removed-model', 'new-model'],
      [{ id: 'new-model', reasoning: { mandatory: true } }],
    );
    expect(next.executionRoutes).toEqual(draft.executionRoutes);
    expect(next.modelPricing).toEqual(draft.modelPricing);
    expect(next.modelDefaults).toEqual(draft.modelDefaults);
    expect(next.modelReasoning['new-model']).toEqual({ mandatory: true });
  });

  it('沿用模型去重、去空白与最多 32 个限制', () => {
    const next = withAiProviderModels(draftWithTwoModels(), [
      ' openrouter/free ',
      '',
      'openrouter/free',
      ...Array.from({ length: 32 }, (_, index) => `model-${index}`),
    ]);
    const input = aiProviderInputFromDraft(next);
    expect(input.models).toHaveLength(32);
    expect(input.models[0]).toBe('openrouter/free');
    expect(input.models).not.toContain('model-31');
    expect(aiProviderDraftError(input)).toBeNull();
  });
});
