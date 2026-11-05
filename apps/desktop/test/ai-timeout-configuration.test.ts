import { describe, expect, it } from 'vitest';
import { aiProviderInputSchema, AI_MAX_TIMEOUT_MS } from '@thesis-ledger/schemas';
import {
  aiProviderInputFromDraft,
  aiProviderDraftError,
} from '../src/features/providers/ai-provider.actions.js';
import { newProviderDraft } from '../src/features/providers/providers.types.js';
import { errorLabel } from '../src/features/ai/ai.display.js';

describe('超时配置消费', () => {
  const input = () => ({
    ...aiProviderInputFromDraft({
      ...newProviderDraft(),
      type: 'ai',
      name: 'isolated',
      baseUrl: 'https://fixture.test/v1',
      modelsText: 'same-model',
      authMode: 'none',
      capabilities: ['chat'],
    }),
    enabled: false,
  });
  it('缺省不写显式超时，240秒经过输入与共享校验', () => {
    const value = input();
    expect(value.timeoutMs).toBeUndefined();
    value.firstOutputTimeoutMs = 240000;
    value.outputIdleTimeoutMs = 240000;
    value.timeoutMs = 240000;
    expect(aiProviderDraftError(value)).toBeNull();
    expect(aiProviderInputSchema.parse(value)).toMatchObject({
      firstOutputTimeoutMs: 240000,
      outputIdleTimeoutMs: 240000,
      timeoutMs: 240000,
    });
    expect(
      aiProviderDraftError({ ...value, firstOutputTimeoutMs: AI_MAX_TIMEOUT_MS + 1 }),
    ).not.toBeNull();
  });
  it('阶段、上游与用户取消分别显示中文', () => {
    expect(errorLabel('research_provider_first_output_timeout')).toBe('等待首有效输出超时');
    expect(errorLabel('research_provider_output_idle_timeout')).toBe('有效输出停顿超时');
    expect(errorLabel('research_task_budget_exhausted')).toBe('任务总预算已耗尽');
    expect(errorLabel('research_upstream_timeout')).toBe('上游返回超时');
    expect(errorLabel('research_cancelled')).toBe('任务已取消');
  });
});
