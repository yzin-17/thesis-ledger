import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  aiProviderDraftFromRecord,
  aiProviderInputFromDraft,
  aiUpstreamFormatOptions,
  mergeSelectedModelReasoning,
  modelDetailsFromCatalog,
  modelReasoningBadgeLabels,
  mergeModelOptions,
  modelsToText,
  requestAiProviderDeletion,
  withAiUpstreamFormat,
} from '../src/features/providers/ai-provider.actions.js';

import {
  createLatestRequestGate,
  createSingleFlightGate,
} from '../src/features/providers/ai-provider-editor-async.js';

import {
  AiProviderEditorFields,
  ModelReasoningBadges,
} from '../src/features/providers/AiProviderEditorFields.js';

import { ProviderTable } from '../src/features/providers/ProviderSettingsSections.js';
import { ProviderModelList } from '../src/features/providers/ProviderModelSummary.js';
import {
  newAiProviderDraft,
  newProviderDraft,
  providerDraftForType,
} from '../src/features/providers/providers.types.js';

import { aiProvider } from './ai-provider-fixture.js';

describe('AI Provider 页面操作', () => {
  it('从已命名的普通 Provider 切换到 AI 时保留名称并使用中性默认值', () => {
    const ordinaryDraft = { ...newProviderDraft(), name: '我的模型服务' };
    const aiDraft = providerDraftForType('ai', ordinaryDraft);

    expect(aiDraft).toMatchObject({
      name: '我的模型服务',
      type: 'ai',
      baseUrl: '',
      modelsText: '',
      credentialsRef: '',
      upstreamFormat: 'chat-completions',
      chatImplementation: 'compatible',
    });
    expect(JSON.stringify(aiDraft)).not.toContain('openrouter.ai');
    expect(JSON.stringify(aiDraft)).not.toContain('nemotron');
    const markup = renderToStaticMarkup(
      <AiProviderEditorFields
        draft={aiDraft}
        credentialInputOpen
        onUpdateDraft={() => undefined}
        onResetTest={() => undefined}
        onSetCredentialInputOpen={() => undefined}
      />,
    );
    expect(markup).not.toContain('openrouter.ai');
    expect(markup).not.toContain('nemotron');
  });

  it('从 AI 切回普通 Provider 时保留公共字段并清理 AI 专属字段', () => {
    const aiDraft = {
      ...newAiProviderDraft(),
      name: '可切换服务',
      priority: 7,
      enabled: false,
      baseUrl: 'https://example.test/v1',
      modelsText: 'model-a',
      credentialsRef: 'secret',
    };
    const ordinaryDraft = providerDraftForType('notification', aiDraft);

    expect(ordinaryDraft).toMatchObject({
      name: '可切换服务',
      type: 'notification',
      capabilities: ['notification'],
      priority: 7,
      enabled: false,
      baseUrl: '',
      modelsText: '',
      credentialsRef: '',
    });
    expect(ordinaryDraft.executionRoutes).toEqual([]);
  });

  it('上游格式使用中文标签，格式切换保留公共字段并清除 Chat 条件字段', () => {
    expect(aiUpstreamFormatOptions.map((option) => option.label)).toEqual([
      'Chat Completions（需支持对应接口）',
      'Responses（原生）',
      'Anthropic Messages（需支持对应接口）',
    ]);
    const chatDraft = {
      ...newAiProviderDraft(),
      name: '保留名称',
      baseUrl: 'https://example.test/v1',
      credentialsRef: 'secret',
      modelsText: 'model-a',
      chatImplementation: 'openai-native' as const,
    };
    const responsesDraft = withAiUpstreamFormat(chatDraft, 'responses');
    expect(responsesDraft).toMatchObject({
      name: '保留名称',
      baseUrl: 'https://example.test/v1',
      credentialsRef: 'secret',
      modelsText: 'model-a',
      upstreamFormat: 'responses',
    });
    expect(responsesDraft.chatImplementation).toBeUndefined();
    expect(withAiUpstreamFormat(responsesDraft, 'chat-completions').chatImplementation).toBe(
      'compatible',
    );
  });

  it('后发请求或草稿变化会使旧模型目录与测试连接结果失效', () => {
    const gate = createLatestRequestGate();
    const firstRequest = gate.begin();
    const secondRequest = gate.begin();
    expect(gate.isCurrent(firstRequest)).toBe(false);
    expect(gate.isCurrent(secondRequest)).toBe(true);

    gate.invalidate();
    expect(gate.isCurrent(secondRequest)).toBe(false);
  });

  it('生成测试单飞门阻止确认框或请求期间的重复调用', () => {
    const gate = createSingleFlightGate();
    expect(gate.tryBegin()).toBe(true);
    expect(gate.tryBegin()).toBe(false);
    gate.end();
    expect(gate.tryBegin()).toBe(true);
  });

  it('Provider 页面使用一个统一 Sheet，AI 字段不暴露 OpenRouter 或内部 adapter', () => {
    const settingsSource = readFileSync(
      new URL('../src/features/providers/ProviderSettings.tsx', import.meta.url),
      'utf8',
    );
    const executionSource = readFileSync(
      new URL('../src/features/providers/AiProviderExecutionFields.tsx', import.meta.url),
      'utf8',
    );
    expect(settingsSource.match(/<ProviderEditorSheet/g)).toHaveLength(1);
    expect(settingsSource).toContain('onTypeChange={aiEditor.changeType}');
    expect(executionSource).not.toContain('SDK adapter');
    expect(executionSource).not.toContain('OpenRouter');
    const editorSource = readFileSync(
      new URL('../src/features/providers/useAiProviderEditor.ts', import.meta.url),
      'utf8',
    );
    const sheetSource = readFileSync(
      new URL('../src/features/providers/ProviderEditorSheet.tsx', import.meta.url),
      'utf8',
    );
    expect(sheetSource).not.toContain("disabled={providerDraft.type === 'ai'}");
    expect(sheetSource).toContain('onTypeChange(value)');
    expect(editorSource).toContain('仅证明测试连接可用，不代表业务结构化生成已通过');
  });

  it('专用表单显示 AI 字段，数据库编辑草稿不回显已保存 Key', () => {
    const draft = aiProviderDraftFromRecord(aiProvider());
    const markup = renderToStaticMarkup(
      <AiProviderEditorFields
        draft={draft}
        credentialInputOpen={false}
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
    expect(markup).toContain('上游格式');
    expect(markup).toContain('Chat Completions（需支持对应接口）');
    expect(markup).toContain('高级选项 · Chat 实现');
    expect(markup).toContain('通用兼容');
    expect(markup).toContain('手动模型 ID');
    expect(markup).toContain('模型列表');
    expect(markup).toContain('从接口获取');
    expect(markup).toContain('搜索并选择模型');
    expect(markup).toContain('nvidia/nemotron-3-super-120b-a12b:free');
    expect(markup).toContain('data-slot="combobox-chips"');
    expect(markup).toContain('outline:none;box-shadow:none');
    expect(markup.match(/<textarea\b[^>]*>/gu)).toEqual([expect.stringContaining('请求参数 JSON')]);
    expect(markup).toContain('API Key');
    expect(markup).toContain('非流式完成等待（毫秒）');
    expect(markup).toContain('模型价格');
    expect(markup).toContain('留空不是零费用');
    expect(markup).toContain('费用币种');
    expect(markup).toContain('data-slot="select-trigger"');
    expect(markup).toContain('>USD<');
    expect(draft.credentialsRef).toBe('');
    expect(markup).not.toContain('server-secret');
    expect(markup).not.toContain('OpenRouter');
  });

  it('Responses 与 Anthropic 格式不显示 Chat 实现条件字段', () => {
    for (const upstreamFormat of ['responses', 'anthropic-messages'] as const) {
      const markup = renderToStaticMarkup(
        <AiProviderEditorFields
          draft={{ ...newAiProviderDraft(), upstreamFormat, chatImplementation: undefined }}
          credentialInputOpen
          onUpdateDraft={() => undefined}
          onResetTest={() => undefined}
          onSetCredentialInputOpen={() => undefined}
        />,
      );
      expect(markup).not.toContain('高级选项 · Chat 实现');
      expect(markup).not.toContain('aria-label="Chat 实现"');
    }
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
    ).toEqual(['none', 'high', '默认 high', '强制推理']);

    const markup = renderToStaticMarkup(
      <ModelReasoningBadges reasoning={{ supportedEfforts: null, mandatory: true }} />,
    );
    expect(markup).toContain('全部强度');
    expect(markup).toContain('强制推理');
    expect(markup).toContain('data-slot="badge"');
  });

  it('数据库 AI 服务统一提供编辑、启停和删除操作', () => {
    const markup = renderToStaticMarkup(
      <ProviderTable
        loadState="ready"
        providers={[aiProvider()]}
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

    expect(markup).not.toContain('部署配置（只读）');
    expect(markup).not.toContain('接管配置');
    expect(markup).toContain('>删除<');
    expect(markup).toContain('>停用<');
  });

  it('Provider 列表将长模型列表收敛为首项和剩余数量', () => {
    const markup = renderToStaticMarkup(
      <ProviderTable
        loadState="ready"
        providers={[
          aiProvider({
            models: [
              'nvidia/nemotron-3-super-120b-a12b:free',
              'cohere/north-mini-code:free',
              'google/gemma-4-26b-a4b-it:free',
            ],
          }),
        ]}
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

    expect(markup).toContain('data-provider-model-summary="true"');
    expect(markup).toContain('nvidia/nemotron-3-super-120b-a12b:free');
    expect(markup).toContain('truncate');
    expect(markup).toContain('>+2<');
    expect(markup).toContain('text-button danger');
    expect(markup).not.toContain('cohere/north-mini-code:free');
    expect(markup).not.toContain('google/gemma-4-26b-a4b-it:free');
  });

  it('连接健康、接入就绪和真实验收使用独立中文状态', () => {
    const markup = renderToStaticMarkup(
      <ProviderTable
        loadState="ready"
        providers={[
          aiProvider({
            health: 'healthy',
            executionRoutes: [
              {
                model: 'model-a',
                adapter: 'openai-compatible',
                mode: 'json_validated',
                contract: { id: 'research', version: 'research-generation-v1' },
                adapterEvidence: null,
                readiness: {
                  state: 'blocked',
                  reasons: ['adapter_contract_evidence_missing'],
                  configurationFingerprint: 'fingerprint',
                  evaluatedAt: '2026-09-19T00:00:00.000Z',
                },
                liveValidation: { status: 'not_run', checkedAt: null, requestId: null },
              },
            ],
          }),
        ]}
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
    expect(markup).toContain('连接健康：健康');
    expect(markup).toContain('接入阻断 1/1');
    expect(markup).toContain('用途尚未验证');
    expect(markup).toContain('缺少本地 adapter 契约证据。编辑配置后会重新评估。');
    expect(markup).not.toContain('>ready<');
    expect(markup).not.toContain('>not_run<');
  });

  it('Provider 模型悬停浮层每行展示一个完整模型', () => {
    const models = [
      'nvidia/nemotron-3-super-120b-a12b:free',
      'cohere/north-mini-code:free',
      'google/gemma-4-26b-a4b-it:free',
    ];
    const markup = renderToStaticMarkup(<ProviderModelList models={models} />);

    expect(markup).toContain('已配置 3 个模型');
    expect(markup.match(/<li/g)).toHaveLength(3);
    expect(markup).toContain('overflow-auto');
    expect(markup).toContain('whitespace-nowrap');
    expect(markup.indexOf(models[0])).toBeLessThan(markup.indexOf(models[1]));
    expect(markup.indexOf(models[1])).toBeLessThan(markup.indexOf(models[2]));
  });

  it('删除 AI Provider 必须经过确认，取消时不发请求', async () => {
    const confirm = vi.fn(async () => true);
    const remove = vi.fn(async () => undefined);
    await expect(requestAiProviderDeletion(aiProvider(), confirm, remove)).resolves.toBe(true);
    expect(confirm).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith('openrouter');

    const cancel = vi.fn(async () => false);
    await expect(requestAiProviderDeletion(aiProvider(), cancel, remove)).resolves.toBe(false);
    expect(cancel).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
  });
});
