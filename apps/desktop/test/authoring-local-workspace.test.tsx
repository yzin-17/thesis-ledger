// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthoringWorkPage } from '../src/features/strategy-authoring/AuthoringWorkPage.js';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { setIdentitySession } from '../src/shared/api/identity-session.js';

const mocks = vi.hoisted(() => ({ request: vi.fn(), list: vi.fn(), discard: vi.fn() }));
vi.mock('../src/features/shared/request.js', () => ({ requestDesktopJson: mocks.request }));
vi.mock('../src/features/strategy-authoring/authoring.api.js', () => ({
  authoringApi: { list: mocks.list, discardDraft: mocks.discard },
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  client?.clear();
  setIdentitySession(null);
  vi.resetAllMocks();
});

describe('本地策略编写直接开放草稿', () => {
  it.each(['取消', '成功', '失败', '等待'])(
    '本地草稿可直接读取、新建与删除：%s',
    async (scenario) => {
      setIdentitySession(null);
      mocks.request.mockResolvedValue({
        mode: 'local',
        principal: {
          id: '4cb546a5-b04f-4c0a-9d3b-6a53fdb74f57',
          username: 'local-workspace',
          displayName: '本地工作区',
        },
      });
      mocks.list.mockResolvedValue({
        items: [{ id: 'draft', title: '已保存的本地草稿', revision: 3, state: 'editing' }],
        nextCursor: null,
      });
      client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      host = document.createElement('div');
      document.body.append(host);
      root = createRoot(host);
      await act(async () =>
        root.render(
          <QueryClientProvider client={client}>
            <MemoryRouter>
              <ConfirmDialogProvider>
                <AuthoringWorkPage onDirtyChange={vi.fn()} onSaved={vi.fn()} />
              </ConfirmDialogProvider>
            </MemoryRouter>
          </QueryClientProvider>,
        ),
      );
      await vi.waitFor(async () => {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(host.textContent).toContain('已保存的本地草稿');
      });
      expect(mocks.request).toHaveBeenCalledWith('/identity/context', {
        signal: expect.any(AbortSignal),
      });
      expect(mocks.list).toHaveBeenCalledWith(null);
      expect(host.textContent).not.toContain('登录');
      expect(host.querySelector('input[type="password"]')).toBeNull();
      const button = [...host.querySelectorAll('button')].find(
        (item) => item.textContent === '新建编写草稿',
      );
      expect(button?.disabled).toBe(false);
      const click = async (label: string) => {
        const target = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
          (item) => item.textContent === label,
        );
        expect(target).toBeDefined();
        await act(async () => target!.click());
      };
      await click('删除');
      expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(
        '已保存的本地草稿',
      );
      expect(mocks.discard).not.toHaveBeenCalled();
      await click('取消');
      expect(mocks.discard).not.toHaveBeenCalled();
      if (scenario === '取消') return;
      let finish: () => void = () => {};
      mocks.discard.mockImplementation(() => {
        if (scenario === '失败') return Promise.reject(new Error('草稿已更新，请重新读取'));
        if (scenario === '等待')
          return new Promise<void>((resolve) => {
            finish = resolve;
          });
        mocks.list.mockResolvedValue({ items: [], nextCursor: null });
        return Promise.resolve({ state: 'discarded' });
      });
      await click('删除');
      await click('删除草稿');
      await vi.waitFor(() => expect(mocks.discard).toHaveBeenCalledExactlyOnceWith('draft', 3));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      if (scenario === '失败') {
        expect(host.textContent).toContain('删除草稿失败');
        expect(host.textContent).toContain('草稿已更新，请重新读取');
        expect(host.textContent).toContain('已保存的本地草稿');
      } else if (scenario === '等待') {
        const busy = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
          (item) => item.textContent === '删除',
        );
        expect(busy?.disabled).toBe(true);
        expect(busy?.getAttribute('aria-busy')).toBe('true');
        expect(button?.disabled).toBe(true);
        mocks.list.mockResolvedValue({ items: [], nextCursor: null });
        await act(async () => finish());
      } else {
        await vi.waitFor(() => expect(host.textContent).not.toContain('已保存的本地草稿'));
        expect(mocks.list.mock.calls.length).toBeGreaterThan(1);
      }
    },
  );
});
