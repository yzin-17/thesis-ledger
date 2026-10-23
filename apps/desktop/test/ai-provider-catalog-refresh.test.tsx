// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  AI_RESEARCH_GENERATION_CONTRACT_VERSION,
  AI_STRATEGY_DISCOVERY_CONTRACT_VERSION,
} from '@thesis-ledger/schemas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiProviderInputFromDraft } from '../src/features/providers/ai-provider.actions.js';
import { useAiProviderEditor } from '../src/features/providers/useAiProviderEditor.js';
import type { ProviderRecord } from '../src/features/providers/providers.types.js';

const editorMocks = vi.hoisted(() => ({
  fetchModels: vi.fn(),
  mutate: vi.fn(),
  resetCatalog: vi.fn(),
  cancelSave: vi.fn(),
  toast: vi.fn(),
  confirm: vi.fn(async () => true),
}));

vi.mock('../src/components/ui/confirm-dialog.js', () => ({
  useConfirmDialog: () => ({ confirm: editorMocks.confirm }),
}));
vi.mock('../src/components/ui/toast.js', () => ({
  useToastManager: () => ({ add: editorMocks.toast }),
}));
vi.mock('../src/features/providers/ai-provider.mutations.js', () => ({
  useDeleteAiProviderMutation: () => ({ mutateAsync: editorMocks.mutate, isPending: false }),
  useFetchAiProviderModelsMutation: () => ({
    mutateAsync: editorMocks.fetchModels,
    reset: editorMocks.resetCatalog,
    isPending: false,
  }),
  useSaveAiProviderMutation: () => ({
    mutateAsync: editorMocks.mutate,
    cancelSave: editorMocks.cancelSave,
    isPending: false,
  }),
  useSetAiProviderEnabledMutation: () => ({ mutateAsync: editorMocks.mutate, isPending: false }),
  useTestAiProviderDraftMutation: () => ({ mutateAsync: editorMocks.mutate, isPending: false }),
  useTestSavedAiProviderMutation: () => ({ mutateAsync: editorMocks.mutate, isPending: false }),
}));
vi.mock('../src/features/providers/providers.mutations.js', () => ({
  useSaveProviderMutation: () => ({ mutateAsync: editorMocks.mutate, isPending: false }),
  useTestProviderDraftMutation: () => ({ mutateAsync: editorMocks.mutate, isPending: false }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const legacyMixedProvider = (): ProviderRecord => ({
  name: 'legacy-mixed',
  type: 'ai',
  source: 'database',
  enabled: true,
  priority: 10,
  capabilities: ['chat'],
  health: 'unknown',
  credentialConfigured: false,
  baseUrl: 'https://provider.invalid/v1',
  authMode: 'none',
  models: ['legacy-model'],
  executionRouteConfigs: [
    {
      model: 'legacy-model',
      mode: 'json_validated',
      contract: { id: 'research', version: AI_RESEARCH_GENERATION_CONTRACT_VERSION },
    },
    {
      model: 'legacy-model',
      mode: 'native_schema',
      enabled: false,
      contract: {
        id: 'strategy_discovery',
        version: AI_STRATEGY_DISCOVERY_CONTRACT_VERSION,
      },
    },
  ],
  modelPricing: {
    'legacy-model': {
      costPer1kInput: 0.25,
      costPer1kOutput: 0.75,
      costCurrency: 'USD',
    },
  },
  timeoutMs: 45_000,
  updatedAt: 'synthetic-revision-1',
});

type MountedEditor = ReturnType<typeof useAiProviderEditor>;
let editor: MountedEditor | undefined;
let host: HTMLDivElement | undefined;
let root: Root | undefined;

function EditorHarness() {
  editor = useAiProviderEditor();
  return null;
}

const currentEditor = () => {
  if (!editor) throw new Error('编辑器尚未挂载');
  return editor;
};

async function mountEditor() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<EditorHarness />);
  });
}

beforeEach(() => {
  editorMocks.fetchModels.mockReset();
  editorMocks.mutate.mockReset();
  editorMocks.resetCatalog.mockReset();
  editorMocks.cancelSave.mockReset();
  editorMocks.toast.mockReset();
  editorMocks.confirm.mockReset().mockResolvedValue(true);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('本测试禁止外部请求');
    }),
  );
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  editor = undefined;
  root = undefined;
  host = undefined;
  vi.unstubAllGlobals();
});

describe('AI Provider 目录刷新兼容边界', () => {
  it('统一新增与编辑状态，已存凭证不回显且保留配置版本', async () => {
    await mountEditor();
    await act(async () => currentEditor().openEditor());
    expect(currentEditor().editor.editingProviderName).toBeNull();
    expect(currentEditor().editor.credentialInputOpen).toBe(true);
    const provider = { ...legacyMixedProvider(), authMode: 'api_key' as const, credentialConfigured: true };
    await act(async () => currentEditor().openEditor(provider));
    expect(currentEditor().editor.editingProviderName).toBe(provider.name);
    expect(currentEditor().editor.credentialInputOpen).toBe(false);
    expect(currentEditor().editor.providerDraft.credentialsRef).toBe('');
    expect(aiProviderInputFromDraft(currentEditor().editor.providerDraft)).toMatchObject({
      name: provider.name, expectedRevision: provider.updatedAt,
    });
    expect(editorMocks.mutate).not.toHaveBeenCalled();
  });

  it('成功刷新目录不改旧混合用途、模型价格或默认引用', async () => {
    editorMocks.fetchModels.mockResolvedValue({
      models: ['legacy-model', 'catalog-only-model'],
      modelDetails: [],
    });
    await mountEditor();

    await act(async () => {
      currentEditor().openEditor(legacyMixedProvider());
    });
    const before = currentEditor().editor.providerDraft;

    await act(async () => {
      await currentEditor().fetchModels();
    });

    const state = currentEditor().editor;
    expect(state.availableModels).toEqual(['legacy-model', 'catalog-only-model']);
    expect(state.providerDraft.modelsText).toBe('legacy-model');
    expect(state.providerDraft.modelDefaults).toEqual({});
    expect(state.providerDraft.modelPricing).toEqual(before.modelPricing);
    expect(state.providerDraft.executionRoutes).toEqual(before.executionRoutes);

    const saved = aiProviderInputFromDraft(state.providerDraft);
    expect(saved.models).toEqual(['legacy-model']);
    expect(saved.modelPricing).toEqual({
      'legacy-model': {
        costPer1kInput: 0.25,
        costPer1kOutput: 0.75,
        costCurrency: 'USD',
      },
    });
    expect(saved).not.toHaveProperty('modelDefaults');
    expect(saved.executionRoutes).toEqual([
      {
        model: 'legacy-model',
        mode: 'json_validated',
        outputPolicy: 'manual',
        modeOverridden: true,
        contract: { id: 'research', version: AI_RESEARCH_GENERATION_CONTRACT_VERSION },
      },
      {
        model: 'legacy-model',
        mode: 'native_schema',
        outputPolicy: 'manual',
        enabled: false,
        modeOverridden: true,
        contract: {
          id: 'strategy_discovery',
          version: AI_STRATEGY_DISCOVERY_CONTRACT_VERSION,
        },
      },
    ]);
    expect(editorMocks.fetchModels).toHaveBeenCalledWith({
      name: 'legacy-mixed',
      baseUrl: 'https://provider.invalid/v1',
      authMode: 'none',
      upstreamFormat: 'chat-completions',
      timeoutMs: 45_000,
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('连接参数编辑后丢弃已发出的旧目录回包并保留当前混合路由草稿', async () => {
    let resolveCatalog!: (value: { models: string[]; modelDetails: [] }) => void;
    editorMocks.fetchModels.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCatalog = resolve;
      }),
    );
    await mountEditor();

    await act(async () => {
      currentEditor().openEditor(legacyMixedProvider());
    });
    let pendingFetch!: Promise<void>;
    await act(async () => {
      pendingFetch = currentEditor().fetchModels();
    });
    await act(async () => {
      currentEditor().updateDraft((draft) => ({
        ...draft,
        baseUrl: 'https://edited-provider.invalid/v1',
      }));
    });
    resolveCatalog({ models: ['stale-model'], modelDetails: [] });
    await act(async () => {
      await pendingFetch;
    });

    const state = currentEditor().editor;
    expect(state.providerDraft.baseUrl).toBe('https://edited-provider.invalid/v1');
    expect(state.providerDraft.modelsText).toBe('legacy-model');
    expect(state.availableModels).toEqual([]);
    expect(state.providerDraft.modelPricing).toEqual({
      'legacy-model': {
        costPer1kInput: '0.25',
        costPer1kOutput: '0.75',
        costCurrency: 'USD',
      },
    });
    expect(aiProviderInputFromDraft(state.providerDraft).executionRoutes).toMatchObject([
      { mode: 'json_validated', contract: { id: 'research' }, modeOverridden: true },
      {
        mode: 'native_schema',
        contract: { id: 'strategy_discovery' },
        modeOverridden: true,
        enabled: false,
      },
    ]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
