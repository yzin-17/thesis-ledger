// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthoringWorkPage } from '../src/features/strategy-authoring/AuthoringWorkPage.js';
import { setIdentitySession } from '../src/shared/api/identity-session.js';

const mocks = vi.hoisted(() => ({ request: vi.fn(), list: vi.fn() }));
vi.mock('../src/features/shared/request.js', () => ({ requestDesktopJson: mocks.request }));
vi.mock('../src/features/strategy-authoring/authoring.api.js', () => ({
  authoringApi: { list: mocks.list },
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
  vi.clearAllMocks();
});

describe('本地策略编写直接开放草稿', () => {
  it('读取服务端本地归属后无登录表单、自动加载草稿并允许新建', async () => {
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
            <AuthoringWorkPage onDirtyChange={vi.fn()} onSaved={vi.fn()} />
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
    expect(mocks.request).toHaveBeenCalledWith('/identity/context');
    expect(mocks.list).toHaveBeenCalledWith(null);
    expect(host.textContent).not.toContain('登录');
    expect(host.querySelector('input[type="password"]')).toBeNull();
    const button = [...host.querySelectorAll('button')].find(
      (item) => item.textContent === '新建编写草稿',
    );
    expect(button?.disabled).toBe(false);
  });
});
