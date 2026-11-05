// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { AiProviderRequestOptionsFields } from '../src/features/providers/AiProviderRequestOptionsFields.js';
import {
  aiProviderDraftFromRecord,
  aiProviderInputFromDraft,
} from '../src/features/providers/ai-provider.actions.js';
import { requestOptionsTextFor } from '../src/features/providers/ai-provider-request-options.js';
import {
  aiProviderExecutionRouteDraftFromConfig,
  aiProviderExecutionRouteInputFromDraft,
} from '../src/features/providers/ai-provider-execution.js';
import { AiProviderResearchVersionField } from '../src/features/providers/AiProviderResearchVersionField.js';
import { withAiProviderModels } from '../src/features/providers/ai-provider-model-selection.js';
import { saveWithValidation } from '../src/features/providers/ai-provider-validated-save.js';
import { useAiProviderEditor } from '../src/features/providers/useAiProviderEditor.js';
import { newAiProviderDraft } from '../src/features/providers/providers.types.js';

const toast = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('../src/components/ui/toast.js', () => ({ useToastManager: () => toast }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const options = { body: { custom: { enabled: false } }, outputTokenLimit: 'upstream' as const };
const draft = () => ({
  ...newAiProviderDraft(),
  name: 'local',
  baseUrl: 'https://provider.invalid/v1',
  authMode: 'none' as const,
  modelsText: 'm',
  modelDefaults: {
    m: { mode: 'json_mode' as const, outputPolicy: 'manual' as const, requestOptions: options },
  },
  modelPricing: { m: { costPer1kInput: '0', costPer1kOutput: '0', costCurrency: 'USD' } },
});

describe('模型请求参数的父级草稿', () => {
  it('V2用途在普通编辑往返中保留，研究版本可显式选择', () => {
    const stored = {
      model: 'm',
      mode: 'json_mode' as const,
      contract: { id: 'research' as const, version: 'research-generation-v2' as const },
    };
    const value = aiProviderExecutionRouteDraftFromConfig(stored);
    expect(aiProviderExecutionRouteInputFromDraft(value).contract).toEqual(stored.contract);
    expect(
      aiProviderExecutionRouteInputFromDraft({
        ...value,
        contractVersion: 'research-generation-v1',
      }).contract.version,
    ).toBe('research-generation-v1');
    const html = renderToStaticMarkup(
      <AiProviderResearchVersionField route={value} onChange={() => undefined} />,
    );
    expect(html).toContain('证据研究 V2');
    expect(html).not.toContain('>research-generation-v2<');
  });
  it('保存／重开回显参数，修改其他默认字段保持原参数', () => {
    const input = aiProviderInputFromDraft(draft());
    expect(input.modelDefaults?.m?.requestOptions).toEqual(options);
    const reopened = aiProviderDraftFromRecord({
      name: 'local',
      type: 'ai',
      enabled: false,
      priority: 100,
      capabilities: ['chat'],
      health: 'unknown',
      models: ['m'],
      modelDefaults: input.modelDefaults!,
    });
    expect(JSON.parse(requestOptionsTextFor(reopened, 'm'))).toEqual(options);
    const changed = {
      ...reopened,
      modelDefaults: { m: { ...reopened.modelDefaults.m!, mode: 'json_validated' as const } },
    };
    expect(aiProviderInputFromDraft(changed).modelDefaults?.m?.requestOptions).toEqual(options);
  });

  it('空文本显式清除，移除模型同时移除其参数草稿', () => {
    const cleared = { ...draft(), modelRequestOptionsText: { m: '' } };
    expect(aiProviderInputFromDraft(cleared).modelDefaults?.m?.requestOptions).toEqual({});
    expect(withAiProviderModels(cleared, []).modelRequestOptionsText).toEqual({});
    expect(withAiProviderModels(cleared, []).modelDefaults).toEqual({});
  });

  it('非法JSON和系统字段报错，不以旧参数静默保存', () => {
    for (const text of ['{', '{"body":{"messages":[]}}']) {
      expect(() =>
        aiProviderInputFromDraft({ ...draft(), modelRequestOptionsText: { m: text } }),
      ).toThrow();
    }
    const html = renderToStaticMarkup(
      <AiProviderRequestOptionsFields
        model="m"
        draft={{ ...draft(), modelRequestOptionsText: { m: '{' } }}
        onUpdateDraft={() => undefined}
      />,
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('有效的JSON对象');
    expect(html).not.toContain('htmlFor');
  });

  it('上游默认上限的确认文案不承诺固定输出上限', async () => {
    const request = vi.fn(async () => ({
      planFingerprint: 'a'.repeat(64),
      pending: [{ model: 'm', purpose: 'research', policy: 'manual' }],
      maxCalls: 1,
      maxOutputTokensPerCall: 8192,
      maxDurationSeconds: 300,
      estimatedCosts: [{ currency: 'USD', amount: '0' }],
    }));
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
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringContaining('输出上限沿用上游默认') }),
    );
    expect(confirm).not.toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringContaining('单次最多输出') }),
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('真实Hook的保存和测试均阻止坏JSON，草稿与错误保留', async () => {
    const network = vi.fn(async () => {
      throw new Error('坏草稿不应派发HTTP');
    });
    vi.stubGlobal('fetch', network);
    toast.add.mockClear();
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    let editor: ReturnType<typeof useAiProviderEditor> | undefined;
    function Harness() {
      editor = useAiProviderEditor();
      return (
        <AiProviderRequestOptionsFields
          model="m"
          draft={editor.editor.providerDraft}
          onUpdateDraft={editor.updateDraft}
        />
      );
    }
    try {
      await act(async () => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <ConfirmDialogProvider>
              <Harness />
            </ConfirmDialogProvider>
          </QueryClientProvider>,
        );
      });
      await act(async () => {
        editor!.openEditor(undefined, { ...draft(), modelRequestOptionsText: { m: '{' } });
      });
      await act(async () => {
        await editor!.saveDraft({ preventDefault: () => undefined } as never);
      });
      await act(async () => {
        await editor!.testDraft('m');
      });
      expect(network).not.toHaveBeenCalled();
      expect(editor!.editor.providerDraft.modelRequestOptionsText.m).toBe('{');
      expect(host.querySelector('textarea')?.getAttribute('aria-invalid')).toBe('true');
      expect(toast.add).toHaveBeenCalledWith(
        expect.objectContaining({ description: '请求参数必须是有效的JSON对象' }),
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
      queryClient.clear();
      host.remove();
      vi.unstubAllGlobals();
    }
  });
});
