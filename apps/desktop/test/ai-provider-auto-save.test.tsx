import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AiGenerationSettings } from '../src/features/providers/AiGenerationSettings.js';
import { newAiProviderDraft } from '../src/features/providers/providers.types.js';
import { newAiProviderExecutionRouteDraft } from '../src/features/providers/ai-provider-execution.js';
import {
  aiProviderDraftFromRecord,
  aiProviderInputFromDraft,
} from '../src/features/providers/ai-provider.actions.js';
import { saveWithValidation } from '../src/features/providers/ai-provider-validated-save.js';

const draft = () => ({
  ...newAiProviderDraft(),
  name: 'local',
  baseUrl: 'https://example.test/v1',
  modelsText: 'model',
  executionRoutes: [newAiProviderExecutionRouteDraft('model')],
});
const plan = (count = 1) => ({
  planFingerprint: 'a'.repeat(64),
  pending: count ? [{ model: 'model', purpose: 'research', policy: 'auto' }] : [],
  maxCalls: count * 3,
  maxOutputTokensPerCall: 8192,
  maxDurationSeconds: 300,
  estimatedCosts: count ? [{ currency: 'USD', amount: '0' }] : [],
});

describe('automatic generation and test-save UX', () => {
  it('shows automatic selection without asking the user to choose JSON formats', () => {
    const html = renderToStaticMarkup(
      <AiGenerationSettings
        value={{ mode: 'native_schema', outputPolicy: 'auto' }}
        protocol="chat-completions"
        label="模型"
        onChange={() => undefined}
      />,
    );
    expect(html).toContain('自动选择（推荐）');
    expect(html).not.toContain('按 JSON 格式生成');
    expect(html).not.toContain('指定方式');
  });
  it('only manual selection expands a concrete method and explanation', () => {
    const html = renderToStaticMarkup(
      <AiGenerationSettings
        value={{ mode: 'json_validated', outputPolicy: 'manual' }}
        protocol="chat-completions"
        label="模型"
        onChange={() => undefined}
      />,
    );
    expect(html).toContain('手动指定');
    expect(html).toContain('通过提示词生成');
    expect(html).toContain('不发送专门的格式参数');
  });
  it('serializes auto separately from concrete mode and leaves inherited routes inherited', () => {
    const value = aiProviderInputFromDraft(draft());
    expect(value.executionRoutes![0]).toMatchObject({
      outputPolicy: 'auto',
      mode: 'native_schema',
      modeOverridden: false,
    });
  });
  it('keeps legacy saved modes manual rather than silently switching to auto', () => {
    const value = aiProviderDraftFromRecord({
      name: 'old',
      type: 'ai',
      enabled: true,
      priority: 1,
      capabilities: ['chat'],
      health: 'unknown',
      models: ['model'],
      executionRouteConfigs: [
        {
          model: 'model',
          mode: 'json_validated',
          contract: { id: 'research', version: 'research-generation-v1' },
        },
      ],
    });
    expect(value.executionRoutes[0]).toMatchObject({
      outputPolicy: 'manual',
      mode: 'json_validated',
    });
  });
  it('does not send a test request without confirmation', async () => {
    const request = vi.fn(async (path: string) => {
      void path;
      return plan();
    });
    const confirm = vi.fn(async () => false);
    await expect(
      saveWithValidation(
        aiProviderInputFromDraft(draft()),
        confirm,
        crypto.randomUUID(),
        undefined,
        { request },
      ),
    ).rejects.toThrow('未执行验证');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]![0]).toBe('/ai/providers/validation-plan');
  });
  it('confirms costs then calls the server test-and-save once', async () => {
    const request = vi.fn(async (path: string) =>
      path.endsWith('validation-plan') ? plan() : { name: 'local' },
    );
    const confirm = vi.fn(async () => true);
    await saveWithValidation(
      aiProviderInputFromDraft(draft()),
      confirm,
      crypto.randomUUID(),
      undefined,
      { request },
    );
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringContaining('最多 3 次调用') }),
    );
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      '/ai/providers/validation-plan',
      '/ai/providers/test-and-save',
    ]);
  });
  it('reuses valid evidence without a confirmation or model probe', async () => {
    const request = vi.fn(async (path: string) =>
      path.endsWith('validation-plan') ? plan(0) : { name: 'local' },
    );
    const confirm = vi.fn(async () => true);
    await saveWithValidation(
      aiProviderInputFromDraft(draft()),
      confirm,
      crypto.randomUUID(),
      undefined,
      { request },
    );
    expect(confirm).not.toHaveBeenCalled();
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      '/ai/providers/validation-plan',
      '/ai/providers',
    ]);
  });
});
