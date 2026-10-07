import { describe, expect, it, vi } from 'vitest';
import {
  invalidateAiProviderHealthState,
  invalidateAiProviderState,
} from '../src/features/providers/ai-provider.mutations.js';
import { invalidateProviderConnectionState } from '../src/features/providers/providers.mutations.js';

describe('Provider 查询刷新', () => {
  it('AI 操作失效 Provider、AI 能力和策略优化能力查询', async () => {
    const invalidateQueries = vi.fn(async () => undefined);
    await invalidateAiProviderState({ invalidateQueries });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['desktop', 'providers', 'config'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['desktop', 'ai', 'capabilities'] });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['desktop', 'strategy', 'optimization', 'capabilities'],
    });
  });

  it('AI 已保存测试只刷新 Provider、默认设置、健康历史和 AI 能力查询', async () => {
    const invalidateQueries = vi.fn(async () => undefined);
    await invalidateAiProviderHealthState({ invalidateQueries });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['desktop', 'providers', 'config'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['desktop', 'providers', 'health-history'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['desktop', 'providers', 'routing-settings'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['desktop', 'ai', 'routing-settings'],
    });
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ['desktop', 'providers'],
    });
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ['desktop', 'providers', 'automations'],
    });
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ['desktop', 'providers', 'issues'],
    });
    expect(invalidateQueries).toHaveBeenCalledTimes(6);
  });

  it('通知 Provider 已保存测试不刷新自动化、诊断或通知失败查询', async () => {
    const invalidateQueries = vi.fn(async () => undefined);
    await invalidateProviderConnectionState({ invalidateQueries });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['desktop', 'providers', 'config'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['desktop', 'providers', 'health-history'],
    });
    expect(invalidateQueries).toHaveBeenCalledTimes(2);
  });
});
