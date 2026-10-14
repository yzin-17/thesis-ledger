// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderOAuthPanel } from '../src/features/market-data/ProviderOAuthPanel.js';
import type { ProviderOAuthSession } from '../src/features/market-data/provider-oauth.api.js';

const api = vi.hoisted(() => ({
  current: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock('../src/features/market-data/provider-oauth.api.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  currentProviderOAuth: api.current,
  getProviderOAuth: api.get,
  createProviderOAuth: api.create,
  cancelProviderOAuth: api.cancel,
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const session: ProviderOAuthSession = {
  sessionId: '00000000-0000-4000-8000-000000000001',
  providerId: 'longbridge',
  status: 'authorizing',
  authorizationUrl: null,
  expiresAt: '2026-10-09T09:00:00Z',
  errorCode: null,
};
let host: HTMLDivElement | undefined;
let root: Root | undefined;
let client: QueryClient | undefined;

async function render(credentialConfigured = false, cachedSession?: ProviderOAuthSession) {
  api.current.mockResolvedValue({ session: null });
  api.get.mockResolvedValue(session);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (cachedSession)
    client.setQueryData(['market-provider-oauth', 'current'], { session: cachedSession });
  await act(async () => {
    root!.render(
      <QueryClientProvider client={client!}>
        <ProviderOAuthPanel credentialConfigured={credentialConfigured} />
      </QueryClientProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function click(label: string) {
  const button = [...host!.querySelectorAll('button')].find((item) => item.textContent === label);
  expect(button, label).toBeDefined();
  await act(async () => {
    button!.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function input(value: string) {
  const field = host!.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function updateSession(value: ProviderOAuthSession) {
  await act(async () => {
    client!.setQueryData(['market-provider-oauth', session.sessionId], value);
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  client?.clear();
  root = undefined;
  vi.resetAllMocks();
});

describe('Longbridge 授权输入状态', () => {
  it('已保存 OAuth 凭证时不依赖会话回显，点击重新授权才展开，可取消草稿', async () => {
    await render(true);
    expect(host!.querySelector('input')).toBeNull();
    expect(host!.textContent).toContain('已授权');
    expect(host!.textContent).not.toContain('授权并保存');
    await click('重新授权');
    expect(host!.querySelector('input')?.value).toBe('');
    await input('synthetic-client-id');
    await click('取消重新授权');
    expect(host!.querySelector('input')).toBeNull();
    await click('重新授权');
    expect(host!.querySelector('input')?.value).toBe('');
    expect(api.create).not.toHaveBeenCalled();
  });

  it('发起授权后展示进度，成功后立即显示已授权并收起输入', async () => {
    api.create.mockResolvedValue(session);
    await render();
    await input(' synthetic-client-id ');
    await click('授权并保存');
    expect(api.create).toHaveBeenCalledWith('synthetic-client-id');
    expect(host!.querySelector('input')).toBeNull();
    expect(host!.textContent).toContain('等待你在浏览器完成授权');
    expect(host!.textContent).toContain('取消授权');
    expect(host!.textContent).not.toContain('重新授权');
    await updateSession({ ...session, status: 'succeeded' });
    expect(host!.querySelector('input')).toBeNull();
    expect(host!.textContent).toContain('授权已完成');
    expect(host!.textContent).toContain('重新授权');
    expect(host!.textContent).not.toContain('授权截止');
    await click('重新授权');
    expect(host!.querySelector('input')?.value).toBe('');
  });

  it('发起失败保留当前输入便于重试', async () => {
    api.create.mockRejectedValue(new Error('synthetic failure'));
    await render();
    await input('synthetic-client-id');
    await click('授权并保存');
    expect(host!.querySelector('input')?.value).toBe('synthetic-client-id');
    expect(host!.textContent).toContain('无法发起授权');
  });

  it.each(['failed', 'expired', 'cancelled'] as const)(
    '未配置时 %s 恢复输入并允许重试',
    async (status) => {
      api.create.mockResolvedValue(session);
      await render();
      await input('synthetic-client-id');
      await click('授权并保存');
      await updateSession({ ...session, status });
      expect(host!.querySelector('input')?.value).toBe('');
      expect(host!.textContent).toContain('授权并保存');
      expect(host!.textContent).not.toContain('已授权');
    },
  );

  it('重新授权取消后可收起输入，原凭证继续显示已授权', async () => {
    api.create.mockResolvedValue(session);
    api.cancel.mockResolvedValue({ ...session, status: 'cancelled' });
    await render(true);
    await click('重新授权');
    await input('synthetic-new-client-id');
    await click('授权并保存');
    await click('取消授权');
    expect(api.cancel).toHaveBeenCalledWith(session.sessionId);
    expect(host!.textContent).toContain('原凭证保持不变');
    expect(host!.querySelector('input')).not.toBeNull();
    await click('取消重新授权');
    expect(host!.querySelector('input')).toBeNull();
    expect(host!.textContent).toContain('已授权');
  });

  it('重新打开时忽略已结束的缓存会话，以当前会话查询为准', async () => {
    await render(false, session);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(api.get).not.toHaveBeenCalled();
    expect(host!.querySelector('input')).not.toBeNull();
    expect(host!.textContent).not.toContain('等待你在浏览器完成授权');
  });
});
