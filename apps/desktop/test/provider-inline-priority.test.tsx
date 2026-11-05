// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderTable } from '../src/features/providers/ProviderSettingsSections.js';
import { useAiProviderPriority } from '../src/features/providers/useAiProviderPriority.js';
import {
  aiProviderDraftFromRecord,
  aiProviderInputFromDraft,
} from '../src/features/providers/ai-provider.actions.js';
import { isAiProvider, type ProviderRecord } from '../src/features/providers/providers.types.js';
import { aiProvider } from './ai-provider-fixture.js';

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  toast: vi.fn(),
  saved: vi.fn(),
  notificationSave: vi.fn(),
}));
vi.mock('../src/components/ui/toast.js', () => ({ useToastManager: () => ({ add: mocks.toast }) }));
vi.mock('../src/components/ui/confirm-dialog.js', () => ({
  useConfirmDialog: () => ({ confirm: mocks.confirm }),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const ai = aiProvider({ updatedAt: '2026-11-05T00:00:00.000Z', authMode: 'api_key' });
const notification: ProviderRecord = {
  name: '飞书',
  type: 'notification',
  priority: 1,
  enabled: true,
  capabilities: ['notification'],
  health: 'healthy',
};
const requests: { path: string; body: Record<string, unknown> }[] = [];
let failSave = false;
let pendingValidation = false;
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;

function Harness() {
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const editor = useAiProviderPriority(mocks.saved);
  return (
    <ProviderTable
      loadState="ready"
      providers={[ai, notification]}
      priorityDrafts={drafts}
      testingProviderName={null}
      savingProviderName={editor.savingProviderName}
      deletingProviderName={null}
      onPriorityChange={(name, priority) =>
        setDrafts((current) => ({ ...current, [name]: priority }))
      }
      onPrioritySave={(provider) => {
        if (isAiProvider(provider)) void editor.save(provider);
        else mocks.notificationSave(provider);
      }}
      onEdit={() => undefined}
      onTest={() => undefined}
      onToggle={() => undefined}
      onDelete={() => undefined}
      onCreate={() => undefined}
    />
  );
}

function input(name = ai.name) {
  return host.querySelector<HTMLInputElement>(`input[aria-label="${name} 优先级"]`)!;
}
async function edit(value: string, name = ai.name) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input(name),
      value,
    );
    input(name).dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function blur(name = ai.name) {
  await act(async () => {
    input(name).dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(async () => {
  requests.length = 0;
  failSave = false;
  pendingValidation = false;
  vi.clearAllMocks();
  mocks.confirm.mockResolvedValue(false);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname.replace('/api/v1', '');
      const body = JSON.parse(String(init?.body));
      requests.push({ path, body });
      if (path === '/ai/providers/validation-plan')
        return Response.json({
          planFingerprint: 'a'.repeat(64),
          pending: pendingValidation
            ? [{ model: ai.models![0], purpose: 'research', policy: 'auto' }]
            : [],
          maxCalls: pendingValidation ? 3 : 0,
          maxOutputTokensPerCall: 8192,
          maxDurationSeconds: 300,
          estimatedCosts: [],
        });
      if (path === '/ai/providers')
        return Response.json(
          failSave
            ? { message: '配置版本已变化，请刷新后再验证' }
            : { ...ai, priority: body.priority },
          { status: failSave ? 409 : 200 },
        );
      throw new Error(`未预期的请求 ${path}`);
    }),
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
});

describe('表格内编辑提供方优先级', () => {
  it('AI 与通知均使用输入框，失焦才沿用各自保存流程', async () => {
    expect(input().value).toBe('100');
    expect(input('飞书').value).toBe('1');
    await edit('200');
    expect(requests).toHaveLength(0);
    await blur();
    expect(requests.map((request) => request.path)).toEqual([
      '/ai/providers/validation-plan',
      '/ai/providers',
    ]);
    expect(requests[1].body).toEqual({
      ...aiProviderInputFromDraft(aiProviderDraftFromRecord(ai)),
      priority: 200,
    });
    expect(requests[1].body).toMatchObject({ expectedRevision: ai.updatedAt, models: ai.models });
    expect(requests[1].body).not.toHaveProperty('apiKey');
    expect(mocks.saved).toHaveBeenCalledWith(ai.name);
    expect(mocks.confirm).not.toHaveBeenCalled();
    await edit('2', '飞书');
    await blur('飞书');
    expect(mocks.notificationSave).toHaveBeenCalledWith({ ...notification, priority: 2 });
  });

  it('未修改、负数及小数不会触发保存', async () => {
    await blur();
    await edit('-1');
    await blur();
    await edit('1.5');
    await blur();
    expect(requests).toHaveLength(0);
    expect(mocks.saved).not.toHaveBeenCalled();
  });

  it('版本冲突保留编辑值、显示失败，允许再次失焦重试', async () => {
    failSave = true;
    await edit('200');
    await blur();
    expect(input().value).toBe('200');
    expect(input().disabled).toBe(false);
    expect(mocks.saved).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    failSave = false;
    await blur();
    expect(mocks.saved).toHaveBeenCalledOnce();
  });

  it('保留原有模型验证授权，取消后不保存、不发起测试', async () => {
    pendingValidation = true;
    await edit('200');
    await blur();
    expect(mocks.confirm).toHaveBeenCalledOnce();
    expect(requests.map((request) => request.path)).toEqual(['/ai/providers/validation-plan']);
    expect(mocks.saved).not.toHaveBeenCalled();
    expect(input().value).toBe('200');
  });
});
