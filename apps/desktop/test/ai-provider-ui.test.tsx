import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  aiProviderDraftError,
  aiProviderDraftFromRecord,
  aiProviderInputFromDraft,
  mergeSelectedModelReasoning,
  modelDetailsFromCatalog,
  modelReasoningBadgeLabels,
  mergeModelOptions,
  modelsToText,
  requestAiProviderDeletion,
} from '../src/features/providers/ai-provider.actions.js';
import {
  deleteAiProvider,
  fetchAiProviderModels,
  fetchAiProviders,
  saveAiProvider,
  setAiProviderEnabled,
  testAiProviderDraft,
  testSavedAiProvider,
} from '../src/features/providers/ai-provider.api.js';
import {
  invalidateAiProviderHealthState,
  invalidateAiProviderState,
} from '../src/features/providers/ai-provider.mutations.js';
import {
  AiProviderEditorFields,
  ModelReasoningBadges,
} from '../src/features/providers/AiProviderEditorFields.js';
import {
  fetchProviders,
  saveProvider,
  testProviderDraft,
} from '../src/features/providers/providers.api.js';
import { invalidateProviderConnectionState } from '../src/features/providers/providers.mutations.js';
import { ProviderTable } from '../src/features/providers/ProviderSettingsSections.js';
import {
  newAiProviderDraft,
  type ProviderRecord,
} from '../src/features/providers/providers.types.js';

const client = (response: unknown = {}) => ({ request: vi.fn(async () => response) });

const aiProvider = (overrides: Partial<ProviderRecord> = {}): ProviderRecord => ({
  name: 'openrouter',
  type: 'ai',
  source: 'database',
  enabled: true,
  priority: 100,
  capabilities: ['chat'],
  health: 'unknown',
  credentialConfigured: true,
  baseUrl: 'https://openrouter.ai/api/v1',
  models: ['nvidia/nemotron-3-super-120b-a12b:free'],
  modelReasoning: {
    'nvidia/nemotron-3-super-120b-a12b:free': {
      supportedEfforts: ['none', 'low', 'high'],
      defaultEffort: 'low',
      defaultEnabled: true,
      supportsMaxTokens: true,
    },
  },
  timeoutMs: 45000,
  costPer1kInput: 0.00125,
  costPer1kOutput: 0.0045,
  costCurrency: 'USD',
  pricingVersion: '2026-09',
  updatedAt: null,
  checkedAt: null,
  latencyMs: null,
  errorCode: null,
  ...overrides,
});

describe('AI Provider 专用请求与密钥边界', () => {
  it('合并通用非 AI 列表和专用 AI 摘要，不重复使用旧 AI 行', async () => {
    const request = vi.fn(async (path: string) => {
      if (path === '/providers/config')
        return [
          {
            name: 'feishu',
            type: 'notification',
            enabled: true,
            priority: 1,
            capabilities: ['notification'],
            health: 'healthy',
          },
          {
            name: 'legacy-ai',
            type: 'ai',
            enabled: true,
            priority: 1,
            capabilities: ['chat'],
            health: 'healthy',
          },
        ];
      return [aiProvider()];
    });
    const providers = await fetchProviders({ request });

    expect(providers.map((item) => item.name)).toEqual(['feishu', 'openrouter']);
    expect(request).toHaveBeenCalledWith('/providers/config', expect.anything());
    expect(request).toHaveBeenCalledWith('/ai/providers', expect.anything());
  });

  it('专用 CRUD 与测试端点使用冻结的 AI 路由', async () => {
    const draft = { ...newAiProviderDraft(), name: 'openrouter', credentialsRef: 'ui-secret' };
    const input = aiProviderInputFromDraft(draft);
    const requestClient = client(aiProvider());

    await fetchAiProviders(requestClient);
    await saveAiProvider(input, requestClient);
    await testAiProviderDraft(input, requestClient);
    await fetchAiProviderModels(
      {
        name: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'ui-secret',
      },
      requestClient,
    );
    await testSavedAiProvider('open/router', requestClient);
    await setAiProviderEnabled('open/router', false, requestClient);
    await deleteAiProvider('open/router', requestClient);

    const paths = requestClient.request.mock.calls.map(([path]) => path);
    expect(paths).toEqual([
      '/ai/providers',
      '/ai/providers',
      '/ai/providers/test',
      '/ai/providers/models',
      '/ai/providers/open%2Frouter/test',
      '/ai/providers/open%2Frouter/enabled',
      '/ai/providers/open%2Frouter',
    ]);
    expect(JSON.parse(requestClient.request.mock.calls[1]?.[1]?.body as string)).toMatchObject({
      apiKey: 'ui-secret',
      models: ['nvidia/nemotron-3-super-120b-a12b:free'],
    });
    expect(JSON.parse(requestClient.request.mock.calls[3]?.[1]?.body as string)).toMatchObject({
      name: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'ui-secret',
    });
  });

  it('模型目录响应保留模型推理元数据', async () => {
    const catalog = {
      models: ['model-a'],
      modelDetails: [
        {
          id: 'model-a',
          reasoning: { supportedEfforts: null, mandatory: true },
        },
      ],
      fetchedAt: '2026-09-15T00:00:00.000Z',
    };

    await expect(
      fetchAiProviderModels({ baseUrl: 'https://openrouter.ai/api/v1' }, client(catalog)),
    ).resolves.toEqual(catalog);
  });

  it('编辑草稿不保留或提交已保存的 API Key，并校验模型列表', () => {
    const createInput = aiProviderInputFromDraft({
      ...newAiProviderDraft(),
      name: 'openrouter',
      credentialsRef: 'ui-secret',
      modelsText: 'model-a\nmodel-b',
    });
    const editInput = aiProviderInputFromDraft(aiProviderDraftFromRecord(aiProvider()));

    expect(createInput).toMatchObject({ apiKey: 'ui-secret', models: ['model-a', 'model-b'] });
    expect(editInput).not.toHaveProperty('apiKey');
    expect(JSON.stringify(editInput)).not.toContain('ui-secret');
    expect(editInput).toMatchObject({
      timeoutMs: 45000,
      costPer1kInput: 0.00125,
      costPer1kOutput: 0.0045,
      costCurrency: 'USD',
      pricingVersion: '2026-09',
      modelReasoning: aiProvider().modelReasoning,
    });
    expect(aiProviderDraftError({ ...createInput, models: ['same', 'same'] })).toBe(
      '模型不得重复。',
    );
  });

  it('通知 Provider 仍使用通用保存与草稿测试端点', async () => {
    const requestClient = client({});
    const notification = {
      name: 'feishu',
      type: 'notification',
      enabled: true,
      priority: 1,
      capabilities: ['notification'],
    };
    await saveProvider(notification, requestClient);
    await testProviderDraft(notification, requestClient);

    expect(requestClient.request.mock.calls.map(([path]) => path)).toEqual([
      '/providers/config',
      '/providers/config/test',
    ]);
  });
});

describe('AI Provider 页面操作', () => {
  it('专用表单显示 AI 字段，数据库编辑草稿不回显已保存 Key', () => {
    const draft = aiProviderDraftFromRecord(aiProvider());
    const markup = renderToStaticMarkup(
      <AiProviderEditorFields
        draft={draft}
        credentialInputOpen={false}
        takingOverEnvironmentName={null}
        onUpdateDraft={() => undefined}
        onResetTest={() => undefined}
        onSetCredentialInputOpen={() => undefined}
        availableModels={['model-a', 'model-b']}
        modelDetails={[
          { id: 'model-a', reasoning: { supportedEfforts: ['none'], mandatory: true } },
        ]}
      />,
    );

    expect(markup).toContain('API Base URL');
    expect(markup).toContain('模型列表');
    expect(markup).toContain('从接口获取');
    expect(markup).toContain('搜索并选择模型');
    expect(markup).toContain('nvidia/nemotron-3-super-120b-a12b:free');
    expect(markup).toContain('data-slot="combobox-chips"');
    expect(markup).toContain('outline:none;box-shadow:none');
    expect(markup).not.toContain('<textarea');
    expect(markup).toContain('API Key');
    expect(markup).toContain('超时（毫秒）');
    expect(draft.credentialsRef).toBe('');
    expect(markup).not.toContain('server-secret');
  });

  it('接口模型与已有选择合并，写回时去重并限制最多 32 个', () => {
    expect(mergeModelOptions(['legacy-model', 'model-b'], ['model-a', 'model-b'])).toEqual([
      'model-a',
      'model-b',
      'legacy-model',
    ]);
    const models = Array.from({ length: 33 }, (_, index) => `model-${index}`);
    expect(modelsToText(['model-a', 'model-a', 'model-b'])).toBe('model-a\nmodel-b');
    expect(modelsToText(models).split('\n')).toHaveLength(32);
  });

  it('编辑时只提交仍被选择模型的推理元数据，并保留缺席旧模型的已保存信息', () => {
    const savedReasoning = {
      'model-a': { supportedEfforts: ['low' as const], defaultEffort: 'low' as const },
      'legacy-model': { supportedEfforts: null, mandatory: true },
      'removed-model': { supportedEfforts: ['high' as const] },
    };
    const input = aiProviderInputFromDraft({
      ...newAiProviderDraft(),
      name: 'openrouter',
      modelsText: 'model-a\nlegacy-model',
      modelReasoning: savedReasoning,
    });

    expect(input.modelReasoning).toEqual({
      'model-a': savedReasoning['model-a'],
      'legacy-model': savedReasoning['legacy-model'],
    });
    expect(input.modelReasoning).not.toHaveProperty('removed-model');
    expect(input).not.toHaveProperty('apiKey');
    expect(
      mergeSelectedModelReasoning(['model-a', 'legacy-model'], savedReasoning, [
        { id: 'model-a', reasoning: { supportedEfforts: ['high'] } },
      ]),
    ).toEqual({
      'model-a': { supportedEfforts: ['high'] },
      'legacy-model': savedReasoning['legacy-model'],
    });
    expect(
      mergeSelectedModelReasoning(['new-model'], {}, [
        { id: 'new-model', reasoning: { supportedEfforts: ['minimal'] } },
      ]),
    ).toEqual({ 'new-model': { supportedEfforts: ['minimal'] } });
  });

  it('缺失或不完整的模型推理声明显示克制状态，已声明强度显示徽章', () => {
    expect(modelDetailsFromCatalog(undefined)).toEqual([]);
    expect(modelDetailsFromCatalog([{ id: 'model-a' }, { id: 42 }, null])).toEqual([
      { id: 'model-a' },
    ]);
    expect(modelReasoningBadgeLabels()).toEqual(['未声明推理']);
    expect(modelReasoningBadgeLabels({})).toEqual(['未声明推理']);
    expect(
      modelReasoningBadgeLabels({
        supportedEfforts: ['none', 'high'],
        defaultEffort: 'high',
        mandatory: true,
      }),
    ).toEqual(['关闭', 'high', '默认 high', '强制推理']);

    const markup = renderToStaticMarkup(
      <ModelReasoningBadges reasoning={{ supportedEfforts: null, mandatory: true }} />,
    );
    expect(markup).toContain('全部强度');
    expect(markup).toContain('强制推理');
    expect(markup).toContain('data-slot="badge"');
  });

  it('部署来源显示只读接管入口，不显示启停或删除操作', () => {
    const markup = renderToStaticMarkup(
      <ProviderTable
        loadState="ready"
        providers={[aiProvider({ source: 'environment' })]}
        priorityDrafts={{}}
        testingProviderName={null}
        savingProviderName={null}
        deletingProviderName={null}
        onPriorityChange={() => undefined}
        onPrioritySave={() => undefined}
        onEdit={() => undefined}
        onTest={() => undefined}
        onToggle={() => undefined}
        onDelete={() => undefined}
        onCreate={() => undefined}
      />,
    );

    expect(markup).toContain('部署配置（只读）');
    expect(markup).toContain('接管配置');
    expect(markup).not.toContain('>删除<');
    expect(markup).not.toContain('>停用<');
  });

  it('删除数据库 AI Provider 必须经过确认，部署来源不会发出删除请求', async () => {
    const confirm = vi.fn(async () => true);
    const remove = vi.fn(async () => undefined);
    await expect(requestAiProviderDeletion(aiProvider(), confirm, remove)).resolves.toBe(true);
    expect(confirm).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith('openrouter');

    const environmentConfirm = vi.fn(async () => true);
    await expect(
      requestAiProviderDeletion(aiProvider({ source: 'environment' }), environmentConfirm, remove),
    ).resolves.toBe(false);
    expect(environmentConfirm).not.toHaveBeenCalled();
  });

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

  it('AI 已保存测试只刷新 Provider、健康历史和 AI 能力查询', async () => {
    const invalidateQueries = vi.fn(async () => undefined);
    await invalidateAiProviderHealthState({ invalidateQueries });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['desktop', 'providers', 'config'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['desktop', 'providers', 'health-history'],
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
    expect(invalidateQueries).toHaveBeenCalledTimes(4);
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
