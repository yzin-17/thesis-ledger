// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  useRoutingConfig,
  routingConfigKey,
} from '../src/features/market-data/useRoutingConfig.js';
import {
  routingCanPreview,
  updateRoutingScope,
} from '../src/features/market-data/routing-config-draft.js';
import type { RoutingConfigView } from '@thesis-ledger/schemas';
import { key } from './market-policy-defaults.fixture.js';

const api = vi.hoisted(() => ({
  routingConfig: vi.fn(),
  previewRoutingConfig: vi.fn(),
  saveRoutingConfig: vi.fn(),
}));
vi.mock('../src/shared/api/client.js', () => ({ getDesktopApiClient: () => ({ market: api }) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let workflow: ReturnType<typeof useRoutingConfig>;
const view: RoutingConfigView = {
  revision: 9,
  catalogRevision: 10,
  catalogStatus: 'complete',
  syncState: 'applied',
  config: {
    version: 1,
    keys: [],
    preserved: [],
    rules: [{ scope: { category: 'market' }, providers: ['one'] }],
  },
  diagnostics: [],
  newKeys: [],
};
const preview = {
  previewToken: 'preview',
  routes: [],
  changes: [],
  exceptions: 0,
  diagnostics: [],
};
function Harness() {
  workflow = useRoutingConfig();
  return null;
}
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}
async function render(initial = view) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  api.routingConfig.mockResolvedValue(structuredClone(initial));
  root = createRoot(document.createElement('div'));
  await act(async () =>
    root!.render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    ),
  );
  await settle();
  return client;
}
afterEach(async () => {
  await act(async () => root?.unmount());
  vi.clearAllMocks();
});
describe('分级路由共享草稿', () => {
  it('检查和保存仅发送编辑内容，服务端保留记录仍留在本地草稿中', async () => {
    const initial: RoutingConfigView = {
      ...view,
      config: {
        ...view.config,
        keys: [key],
        preserved: [
          {
            route: {
              key,
              targets: [{ providerId: 'one', upstreamSource: 'history' }],
              enabled: true,
            },
            rule: view.config.rules[0]!,
          },
        ],
      },
    };
    await render(initial);
    await act(async () =>
      workflow.change(updateRoutingScope(workflow.draft!, { category: 'market' }, ['two'])),
    );
    api.previewRoutingConfig.mockResolvedValue(preview);
    await act(async () => {
      await workflow.previewMutation.mutateAsync();
    });
    expect(api.previewRoutingConfig.mock.calls[0]![0].config.preserved).toEqual([]);
    expect(workflow.draft!.preserved).toEqual(initial.config.preserved);
    api.saveRoutingConfig.mockRejectedValueOnce(new Error('503'));
    await act(async () => {
      await workflow.saveMutation.mutateAsync().catch(() => undefined);
    });
    expect(api.saveRoutingConfig.mock.calls[0]![0].config.preserved).toEqual([]);
    expect(workflow.draft!.preserved).toEqual(initial.config.preserved);
  });
  it('仅整理旧配置也可预览保存；失败保留状态，成功后清除待整理标志', async () => {
    await render({ ...view, legacyRuleCount: 2 });
    expect(workflow.dirty).toBe(false);
    expect(routingCanPreview(workflow.dirty, 0, workflow.baseline?.legacyRuleCount)).toBe(true);
    api.previewRoutingConfig.mockResolvedValue({ ...preview, legacyRuleCount: 2 });
    await act(async () => {
      await workflow.previewMutation.mutateAsync();
    });
    expect(workflow.preview?.changes).toEqual([]);
    api.saveRoutingConfig.mockRejectedValueOnce(new Error('503'));
    await act(async () => {
      await workflow.saveMutation.mutateAsync().catch(() => undefined);
    });
    expect(workflow.baseline?.legacyRuleCount).toBe(2);
    expect(workflow.preview?.legacyRuleCount).toBe(2);
    api.saveRoutingConfig.mockResolvedValue({ syncState: 'applied' });
    api.routingConfig.mockResolvedValue({ ...view, revision: 10, legacyRuleCount: 0 });
    await act(async () => {
      await workflow.saveMutation.mutateAsync();
    });
    expect(workflow.baseline?.legacyRuleCount).toBe(0);
    expect(routingCanPreview(workflow.dirty, 0, workflow.baseline?.legacyRuleCount)).toBe(false);
  });
  it('刷新不覆盖未保存草稿，也不提升提交修订；切换范围无需写入', async () => {
    const client = await render();
    expect(workflow.dirty).toBe(false);
    await act(async () =>
      workflow.change(updateRoutingScope(workflow.draft!, { category: 'market' }, [])),
    );
    await act(async () => client.setQueryData(routingConfigKey, { ...view, revision: 11 }));
    expect(workflow.baseline!.revision).toBe(9);
    expect(workflow.draft!.rules[0]!.providers).toEqual([]);
    expect(api.saveRoutingConfig).not.toHaveBeenCalled();
  });
  it('失败保留草稿，当前草稿预览后保存，并读取新修订', async () => {
    await render();
    await act(async () =>
      workflow.change(updateRoutingScope(workflow.draft!, { category: 'market' }, ['two'])),
    );
    api.previewRoutingConfig.mockResolvedValue(preview);
    await act(async () => {
      await workflow.previewMutation.mutateAsync();
    });
    api.saveRoutingConfig.mockRejectedValueOnce(new Error('503'));
    await act(async () => {
      await workflow.saveMutation.mutateAsync().catch(() => undefined);
    });
    expect(workflow.draft!.rules[0]!.providers).toEqual(['two']);
    expect(workflow.dirty).toBe(true);
    api.saveRoutingConfig.mockResolvedValue({ syncState: 'applied' });
    api.routingConfig.mockResolvedValue({ ...view, revision: 10, config: workflow.draft });
    await act(async () => {
      await workflow.saveMutation.mutateAsync();
    });
    expect(workflow.dirty).toBe(false);
    expect(workflow.baseline!.revision).toBe(10);
    expect(api.saveRoutingConfig.mock.calls[0]![0]).toMatchObject({
      expectedRevision: 9,
      previewToken: 'preview',
    });
  });
  it('预览返回前继续修改，丢弃旧预览；恢复继承只删除本级', async () => {
    await render();
    const child = { category: 'market', market: 'CN' } as const;
    await act(async () => workflow.change(updateRoutingScope(workflow.draft!, child, [])));
    let resolve!: (value: typeof preview) => void;
    api.previewRoutingConfig.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    let pending: Promise<unknown>;
    await act(async () => {
      pending = workflow.previewMutation.mutateAsync();
    });
    await act(async () => workflow.change(updateRoutingScope(workflow.draft!, child, null)));
    await act(async () => {
      resolve(preview);
      await pending;
    });
    expect(workflow.preview).toBeNull();
    expect(workflow.draft!.rules).toEqual(view.config.rules);
  });
});
