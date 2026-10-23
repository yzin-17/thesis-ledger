// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { ProviderTable } from '../src/features/providers/ProviderSettingsSections.js';
import type { AiRoutingSettings } from '../src/features/providers/ai-provider.api.js';
import { useAiProviderEditor } from '../src/features/providers/useAiProviderEditor.js';
import type { ProviderRecord } from '../src/features/providers/providers.types.js';

const toastMocks = vi.hoisted(() => ({ add: vi.fn() }));

vi.mock('../src/components/ui/toast.js', () => ({
  useToastManager: () => toastMocks,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const provider = (): ProviderRecord => ({
  name: 'e3-synthetic-provider',
  type: 'ai',
  source: 'database',
  enabled: true,
  priority: 1,
  capabilities: ['chat'],
  health: 'unknown',
  credentialConfigured: false,
  baseUrl: 'https://provider.invalid/v1',
  authMode: 'none',
  models: ['synthetic-model'],
  updatedAt: '2026-10-18T00:00:00.000Z',
});

const routingSettings: AiRoutingSettings = {
  researchDefault: { providerId: 'e3-synthetic-provider', model: 'synthetic-model' },
  revision: 'synthetic-settings-revision-7',
  candidates: [
    {
      providerId: 'e3-synthetic-provider',
      providerName: 'E3 Synthetic Provider',
      model: 'synthetic-model',
      enabled: true,
      health: 'unknown',
      authMode: 'none',
      priceConfigured: false,
    },
  ],
};

type CapturedRequest = {
  method: string;
  path: string;
  body: unknown;
};

let capturedRequests: CapturedRequest[] = [];
let responseForRequest: (request: CapturedRequest) => Response;

const interceptedFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
  const request = {
    method: (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase(),
    path: url.pathname,
    body,
  };
  capturedRequests.push(request);
  if (!request.path.startsWith('/api/v1/ai/providers/'))
    throw new Error(`未预期的 HTTP 请求：${request.method} ${request.path}`);
  return responseForRequest(request);
});

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function ProviderLifecycleHarness() {
  const editor = useAiProviderEditor(routingSettings);
  const currentProvider = provider();
  return (
    <ProviderTable
      loadState="ready"
      providers={[currentProvider]}
      priorityDrafts={{}}
      testingProviderName={null}
      savingProviderName={null}
      deletingProviderName={null}
      onPriorityChange={() => undefined}
      onPrioritySave={() => undefined}
      onEdit={() => undefined}
      onTest={() => undefined}
      onToggle={(selected) => void editor.toggle(selected)}
      onDelete={(selected) => void editor.remove(selected)}
      onCreate={() => undefined}
    />
  );
}

let host: HTMLDivElement | undefined;
let root: Root | undefined;
let queryClient: QueryClient | undefined;

async function mountLifecycleControls() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await act(async () => {
    root!.render(
      <QueryClientProvider client={queryClient!}>
        <ConfirmDialogProvider>
          <ProviderLifecycleHarness />
        </ConfirmDialogProvider>
      </QueryClientProvider>,
    );
  });
}

function button(label: string) {
  const match = Array.from(document.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!match) throw new Error(`找不到按钮：${label}`);
  return match;
}

async function click(label: string) {
  const target = button(label);
  await act(async () => {
    target.click();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

async function waitForLifecycleRequest() {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  capturedRequests = [];
  responseForRequest = () => {
    throw new Error('测试没有为该 HTTP 请求安排受控响应');
  };
  interceptedFetch.mockClear();
  toastMocks.add.mockReset();
  vi.stubGlobal('fetch', interceptedFetch);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  queryClient?.clear();
  host?.remove();
  root = undefined;
  host = undefined;
  queryClient = undefined;
  vi.unstubAllGlobals();
});

describe('AI Provider 默认引用生命周期交互', () => {
  it('取消默认 Provider 的停用和删除确认时不发送 mutation', async () => {
    await mountLifecycleControls();

    await click('停用');
    expect(document.body.textContent).toContain('停用 e3-synthetic-provider 并清除研究默认？');
    expect(button('清除默认并停用')).toBeTruthy();
    await click('取消');

    await click('删除');
    expect(document.body.textContent).toContain('删除 e3-synthetic-provider？');
    expect(document.body.textContent).toContain('同一事务清除默认引用并删除 Provider');
    expect(button('删除 Provider')).toBeTruthy();
    await click('取消');

    expect(capturedRequests).toEqual([]);
    expect(interceptedFetch).not.toHaveBeenCalled();
    expect(toastMocks.add).not.toHaveBeenCalled();
  });

  it('确认停用和删除时携带 Provider 与默认设置版本，409/503 错误单次反馈且不调用生成接口', async () => {
    responseForRequest = (request) => {
      if (request.method === 'PATCH')
        return jsonResponse(409, {
          error: 'Conflict',
          message: 'Provider 配置已变化，请刷新后重试',
        });
      if (request.method === 'DELETE')
        return jsonResponse(503, { error: 'Service Unavailable', message: '服务暂不可用' });
      throw new Error(`未预期的 HTTP 方法：${request.method}`);
    };
    await mountLifecycleControls();

    await click('停用');
    await click('清除默认并停用');
    await waitForLifecycleRequest();

    expect(capturedRequests).toEqual([
      {
        method: 'PATCH',
        path: '/api/v1/ai/providers/e3-synthetic-provider/enabled',
        body: {
          enabled: false,
          expectedRevision: '2026-10-18T00:00:00.000Z',
          clearResearchDefault: true,
          expectedSettingsRevision: 'synthetic-settings-revision-7',
        },
      },
    ]);
    expect(toastMocks.add).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'e3-synthetic-provider 启停失败',
        description: 'Provider 配置已变化，请刷新后重试',
        type: 'error',
      }),
    );

    await click('删除');
    await click('删除 Provider');
    await waitForLifecycleRequest();

    expect(capturedRequests).toEqual([
      {
        method: 'PATCH',
        path: '/api/v1/ai/providers/e3-synthetic-provider/enabled',
        body: {
          enabled: false,
          expectedRevision: '2026-10-18T00:00:00.000Z',
          clearResearchDefault: true,
          expectedSettingsRevision: 'synthetic-settings-revision-7',
        },
      },
      {
        method: 'DELETE',
        path: '/api/v1/ai/providers/e3-synthetic-provider',
        body: {
          expectedRevision: '2026-10-18T00:00:00.000Z',
          clearResearchDefault: true,
          expectedSettingsRevision: 'synthetic-settings-revision-7',
        },
      },
    ]);
    expect(interceptedFetch).toHaveBeenCalledTimes(2);
    expect(
      capturedRequests.every((request) => request.path.startsWith('/api/v1/ai/providers/')),
    ).toBe(true);
    expect(capturedRequests.some((request) => /test|models|runs/.test(request.path))).toBe(false);
    expect(toastMocks.add).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'e3-synthetic-provider 删除失败',
        description: '服务暂时无法完成本次操作，请稍后重试。',
        type: 'error',
      }),
    );
  });
});
