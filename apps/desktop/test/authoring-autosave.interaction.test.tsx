// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emptyAuthoringContent,
  useAuthoringDraft,
} from '../src/features/strategy-authoring/use-authoring-draft.js';
import type { AuthoringDraftView } from '../src/features/strategy-authoring/authoring.api.js';

const api = vi.hoisted(() => ({ read: vi.fn(), update: vi.fn() }));
vi.mock('../src/features/strategy-authoring/authoring.api.js', () => ({ authoringApi: api }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const owner = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const view = (revision = 1, content = emptyAuthoringContent): AuthoringDraftView => ({
  id,
  ownerId: owner,
  state: 'editing',
  revision,
  title: content.title,
  savedVersionId: null,
  content,
  validation: { status: 'incomplete', issues: [] },
  createdAt: '2026-10-06T00:00:00Z',
  updatedAt: '2026-10-06T00:00:00Z',
});
let latest: ReturnType<typeof useAuthoringDraft>;
let root: Root;
let host: HTMLDivElement;
let cache: QueryClient;
function Probe() {
  latest = useAuthoringDraft(owner, id);
  return <p>{latest.content.description}</p>;
}
async function wait(assertion: () => void) {
  await vi.waitFor(
    async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      assertion();
    },
    { timeout: 4000 },
  );
}
beforeEach(async () => {
  vi.clearAllMocks();
  api.read.mockResolvedValue(view());
  api.update.mockImplementation(
    async (_id: string, revision: number, content: typeof emptyAuthoringContent) =>
      view(revision + 1, content),
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <Probe />
      </QueryClientProvider>,
    ),
  );
  await wait(() => expect(latest.query.data?.revision).toBe(1));
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
});
describe('草稿自动保存实际 React 竞态', () => {
  it('明确采用服务端修订后重置本地基线；读取失败保留输入', async () => {
    await act(async () => latest.edit({ ...emptyAuthoringContent, description: '尚未保存的输入' }));
    api.read.mockRejectedValueOnce(new Error('网络中断'));
    await act(async () => {
      await expect(latest.useServerContent()).rejects.toThrow('网络中断');
    });
    expect(latest.content.description).toBe('尚未保存的输入');
    expect(latest.dirty).toBe(true);
    api.read.mockResolvedValueOnce(
      view(3, { ...emptyAuthoringContent, description: '另一窗口已保存' }),
    );
    await act(async () => {
      await latest.useServerContent();
    });
    expect(latest.content.description).toBe('另一窗口已保存');
    expect(latest.dirty).toBe(false);
    expect(api.update).not.toHaveBeenCalled();
    await act(async () => latest.edit({ ...latest.content, description: '合并后的输入' }));
    await act(async () => {
      await latest.flush();
    });
    expect(api.update.mock.calls[0]![1]).toBe(3);
  });
  it('连续编辑合并到一个请求，成功后清除未保存状态', async () => {
    await act(async () => {
      for (let index = 0; index < 10; index++)
        latest.edit({ ...emptyAuthoringContent, description: `最后输入 ${index}` });
    });
    expect(latest.dirty).toBe(true);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    });
    await wait(() => expect(api.update).toHaveBeenCalledTimes(1));
    await wait(() => expect(latest.dirty).toBe(false));
    expect(api.update.mock.calls[0]![2].description).toBe('最后输入 9');
    expect(latest.query.data?.revision).toBe(2);
  });
  it('保存进行中继续编辑，晚到响应不覆盖新内容，后续请求采用新修订', async () => {
    let resolve!: (value: AuthoringDraftView) => void;
    const held = new Promise<AuthoringDraftView>((done) => {
      resolve = done;
    });
    api.update.mockImplementationOnce(() => held);
    await act(async () => latest.edit({ ...emptyAuthoringContent, description: '第一次输入' }));
    let pending!: ReturnType<typeof latest.flush>;
    await act(async () => {
      pending = latest.flush();
    });
    await wait(() => expect(api.update).toHaveBeenCalledTimes(1));
    await act(async () => latest.edit({ ...emptyAuthoringContent, description: '保存中继续输入' }));
    await act(async () => {
      resolve(view(2, { ...emptyAuthoringContent, description: '第一次输入' }));
      await pending;
    });
    expect(latest.content.description).toBe('保存中继续输入');
    expect(api.update).toHaveBeenCalledTimes(2);
    expect(api.update.mock.calls[1]!.slice(0, 2)).toEqual([id, 2]);
    expect(latest.dirty).toBe(false);
  });
  it('失败保留输入；重新读取不会覆盖未保存数据，主动重试仍带原修订', async () => {
    api.update.mockRejectedValueOnce(new Error('修订冲突，请保留输入'));
    await act(async () => latest.edit({ ...emptyAuthoringContent, description: '保留本地输入' }));
    await act(async () => {
      await expect(latest.flush()).rejects.toThrow('修订冲突');
    });
    expect(latest.dirty).toBe(true);
    expect(latest.failure).toContain('修订冲突');
    api.read.mockResolvedValueOnce(
      view(3, { ...emptyAuthoringContent, description: '另一窗口输入' }),
    );
    await act(async () => {
      await latest.query.refetch();
    });
    expect(latest.content.description).toBe('保留本地输入');
    await act(async () => {
      await latest.flush();
    });
    expect(api.update.mock.calls[1]![1]).toBe(1);
    expect(latest.content.description).toBe('保留本地输入');
  });
});
