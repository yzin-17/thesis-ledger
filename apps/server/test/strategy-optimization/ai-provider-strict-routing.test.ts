import { describe, expect, it, vi } from 'vitest';
import type { AiProvider } from '../../src/ai/contracts.js';
import { AiProviderRegistry } from '../../src/ai/provider-registry.js';

const provider = (
  id: string,
  models: string[],
  health: 'unknown' | 'healthy' | 'degraded' | 'down' = 'healthy',
): AiProvider => ({
  id,
  models,
  metadata: { health },
  complete: vi.fn(async () => ({ content: {}, inputTokens: 0, outputTokens: 0, cost: 0 })),
});

describe('AI optimization strict routing', () => {
  it('returns only the exact requested provider and model', () => {
    const registry = new AiProviderRegistry();
    const exact = provider('alpha', ['model-a']);
    registry.register(exact);
    registry.register(provider('beta', ['model-a']));
    expect(registry.strict('alpha', 'model-a')).toBe(exact);
  });

  it('does not fallback to another provider when the requested route is invalid', () => {
    const registry = new AiProviderRegistry();
    registry.register(provider('beta', ['model-a']));
    expect(() => registry.strict('alpha', 'model-a')).toThrow(/未配置/);
    expect(() => registry.strict('beta', 'model-b')).toThrow(/不支持模型/);
  });

  it('rejects an explicitly down provider instead of substituting another one', () => {
    const registry = new AiProviderRegistry();
    registry.register(provider('alpha', ['model-a'], 'down'));
    registry.register(provider('beta', ['model-a'], 'healthy'));
    expect(() => registry.strict('alpha', 'model-a')).toThrow(/不可用/);
  });
});
