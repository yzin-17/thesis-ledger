// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderCredentialsSheet } from '../src/features/market-data/ProviderCredentialsSheet.js';
import type { ProviderManifest } from '../src/features/market-data/market-data.types.js';

const api = vi.hoisted(() => ({
  save: vi.fn(),
  clear: vi.fn(),
  test: vi.fn(),
  providers: vi.fn(),
  oauthCurrent: vi.fn(),
}));
vi.mock('../src/features/market-data/market-data.api.js', () => ({
  saveMarketProviderCredentials: api.save,
  clearMarketProviderCredential: api.clear,
  testMarketProvider: api.test,
  fetchMarketProviders: api.providers,
}));
vi.mock('../src/components/ui/confirm-dialog.js', () => ({
  useConfirmDialog: () => ({ confirm: async () => true }),
}));
vi.mock('../src/features/market-data/provider-oauth.api.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  currentProviderOAuth: api.oauthCurrent,
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Object.assign(window, { PointerEvent: MouseEvent });

const provider: ProviderManifest = {
  providerId: 'hithink',
  displayName: 'HiThink',
  version: 1,
  configVersion: 1,
  configured: true,
  enabled: true,
  credentialConfigured: true,
  requiresCredential: true,
  capabilities: {},
  credentialSource: 'control',
  credentialMethod: 'api_key',
  credentialFieldsConfigured: { apiKey: true },
  credentialSchema: {
    methods: [{ method: 'api_key', fields: [{ name: 'apiKey', secret: true, required: true }] }],
  },
};
let root: Root | undefined;
let host: HTMLDivElement | undefined;
let client: QueryClient | undefined;

async function render(current = provider) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  await act(async () => {
    root!.render(
      <QueryClientProvider client={client!}>
        <ProviderCredentialsSheet provider={current} onClose={vi.fn()} />
      </QueryClientProvider>,
    );
  });
}

async function click(label: string) {
  const button = [...document.querySelectorAll('button')].find(
    (item) => item.textContent === label,
  );
  expect(button, label).toBeDefined();
  await act(async () => {
    button!.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function input(value: string) {
  const field = document.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  client?.clear();
  root = undefined;
  vi.resetAllMocks();
});

describe('凭证配置状态与更换交互', () => {
  it('已配置时隐藏输入框，主动更换才展开，取消后清除草稿并收起', async () => {
    await render();
    expect(document.querySelector('input')).toBeNull();
    expect(document.body.textContent).toContain('已配置');
    expect(document.body.textContent).toContain('测试连接');
    expect(document.body.textContent).not.toContain('保存凭证');
    await click('更换');
    expect(document.querySelector('input')?.type).toBe('password');
    await input('synthetic-replacement');
    expect(document.body.textContent).toContain('保存凭证');
    await click('取消更换');
    expect(document.querySelector('input')).toBeNull();
    expect(document.body.textContent).not.toContain('保存凭证');
    expect(api.save).not.toHaveBeenCalled();
  });

  it('首次保存与更换保存均按成功响应立即收起，不依赖列表刷新', async () => {
    api.save.mockResolvedValue({ ...provider, configVersion: 2 });
    await render({
      ...provider,
      configured: false,
      credentialConfigured: false,
      credentialSource: 'none',
      credentialMethod: null,
      credentialFieldsConfigured: {},
    });
    await input('synthetic-first-key');
    await click('保存凭证');
    expect(api.save).toHaveBeenLastCalledWith('hithink', {
      method: 'api_key',
      values: { apiKey: 'synthetic-first-key' },
    });
    expect(document.querySelector('input')).toBeNull();
    expect(document.body.textContent).toContain('已配置');
    expect(document.body.textContent).toContain('使用页面配置');
    expect(document.body.textContent).not.toContain('保存凭证');

    await click('更换');
    expect(document.querySelector('input')?.value).toBe('');
    await input('synthetic-next-key');
    api.save.mockResolvedValue({ ...provider, configVersion: 3 });
    await click('保存凭证');
    expect(document.querySelector('input')).toBeNull();
    expect(document.body.textContent).not.toContain('synthetic-next-key');
  });

  it('保存失败时保留输入以便重试', async () => {
    api.save.mockRejectedValue(new Error('synthetic failure'));
    await render();
    await click('更换');
    await input('synthetic-retry-key');
    await click('保存凭证');
    expect(document.querySelector('input')?.value).toBe('synthetic-retry-key');
    expect(document.body.textContent).toContain('凭证保存失败');
  });

  it('移除成功后恢复未配置输入状态', async () => {
    api.clear.mockResolvedValue({
      ...provider,
      configVersion: 2,
      configured: false,
      credentialConfigured: false,
      credentialSource: 'none',
      credentialMethod: null,
      credentialFieldsConfigured: {},
    });
    await render();
    await click('移除页面凭证');
    expect(document.querySelector('input')?.value).toBe('');
    expect(
      [...document.querySelectorAll('[data-slot="badge"]')].map((badge) => badge.textContent),
    ).not.toContain('已配置');
    expect(document.body.textContent).not.toContain('移除页面凭证');
  });

  it('已保存的 OAuth 凭证收起 Client ID，移除后恢复输入', async () => {
    api.oauthCurrent.mockResolvedValue({ session: null });
    const longbridge = {
      ...provider,
      providerId: 'longbridge',
      displayName: 'Longbridge',
      credentialMethod: 'oauth',
    };
    api.clear.mockResolvedValue({
      ...longbridge,
      configVersion: 2,
      configured: false,
      credentialConfigured: false,
      credentialSource: 'none',
      credentialMethod: null,
      credentialFieldsConfigured: {},
    });
    await render(longbridge);
    expect(document.querySelector('input')).toBeNull();
    expect(document.body.textContent).toContain('已授权');
    await click('移除页面凭证');
    expect(document.querySelector('input')?.getAttribute('placeholder')).toBe(
      '请输入应用 Client ID',
    );
    expect(document.body.textContent).not.toContain('已授权');
  });
});

const tushare: ProviderManifest = { ...provider, providerId: 'tushare', displayName: 'Tushare', accountAccessSupported: true,
  settings: { accountLevel: { points: 120, independentApis: [] } },
  credentialMethod: 'token', credentialFieldsConfigured: { token: true },
  credentialSchema: { methods: [{ method: 'token', fields: [{ name: 'token', secret: true, required: true }] }] } };
const accountResult = (context: 'draft' | 'current', configVersion = 1) => {
  const time = { configVersion, checkedAt: new Date().toISOString(), validUntil: new Date(Date.now() + 300_000).toISOString() };
  const target = { providerId: 'tushare', upstreamSource: 'tushare' };
  return { purpose: 'account_access', status: 'degraded', capabilityResults: {}, accountAccess: {
    scope: 'account_interfaces', credentialContext: context, configVersion, ...time,
    routes: [
      { target, key: { kind: 'bar', market: 'CN', assetType: 'STOCK', capability: 'DAILY_BAR', timeframe: '1d', adjustment: 'none' },
        access: { state: 'allowed', attempted: true, ...time } },
      { target, key: { kind: 'data', market: 'CN', assetType: 'ETF', capability: 'CASH_DISTRIBUTION' },
        access: { state: 'not_included', attempted: false, errorCode: 'account_level_insufficient', ...time } },
    ],
  } };
};

describe('账户功能权限的草稿和保存流程', () => {
  it('本地 JSON 键顺序变化不将当前账号刷新误判为草稿', async () => {
    api.test.mockResolvedValue(accountResult('current'));
    await render({ ...tushare, settings: { accountLevel: { independentApis: [], points: 120 } } });
    await click('检查功能权限');
    expect(api.test.mock.calls[0]![1]).toBeUndefined();
    expect(api.test.mock.calls[0]![5]).toBeUndefined();
    expect(document.body.textContent).toContain('当前账户可访问');
  });
  it('检查当前输入逐功能显示，不保存密钥且修改输入后撤销旧结果', async () => {
    api.test.mockResolvedValue(accountResult('draft'));
    await render(tushare);
    await click('更换');
    await input('synthetic-account-draft');
    await click('检查当前输入权限');
    expect(api.test.mock.calls[0]![1]).toEqual({ method: 'token', values: { token: 'synthetic-account-draft' } });
    expect(api.test.mock.calls[0]![4]).toBe('account_access');
    expect(document.body.textContent).toContain('当前账户可访问');
    expect(document.body.textContent).toContain('当前等级未包含 1 项功能');
    expect(document.body.textContent).not.toContain('当前账户缺少权限');
    expect(api.save).not.toHaveBeenCalled();
    expect(JSON.stringify(client!.getMutationCache().getAll().map((m) => m.state.variables))).not.toContain('synthetic-account-draft');
    await input('synthetic-changed-draft');
    expect(document.body.textContent).not.toContain('当前账户可访问');
  });
  it('保存提交等级与原配置代次，客户端不在保存后重复检查', async () => {
    api.save.mockResolvedValue({ ...tushare, configVersion: 2 });
    api.test.mockResolvedValue(accountResult('current', 2));
    await render(tushare);
    await click('更换');
    await input('synthetic-new-account');
    await click('检查权限并保存');
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.save).toHaveBeenCalledWith('tushare', { method: 'token', values: { token: 'synthetic-new-account' } },
      { accountLevel: { points: 120, independentApis: [] } }, 1);
    expect(api.test).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('账号等级和功能权限已保存');
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(document.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe('120');
  });
  it('输入变化后迟到的许可结果不显示', async () => {
    let finish: ((result: ReturnType<typeof accountResult>) => void) | undefined;
    api.test.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await render(tushare);
    await click('更换');
    await input('synthetic-first-input');
    await click('检查当前输入权限');
    await input('synthetic-second-input');
    await act(async () => { finish!(accountResult('draft')); await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(document.body.textContent).not.toContain('当前账户可访问');
    expect(api.save).not.toHaveBeenCalled();
  });
  it('未填写积分时不发起权限检查或保存', async () => {
    await render({ ...tushare, settings: {} });
    await click('更换');
    await input('synthetic-pending-account');
    await click('检查权限并保存');
    expect(document.body.textContent).toContain('请填写当前账号的有效积分');
    expect(api.save).not.toHaveBeenCalled();
    expect(api.test).not.toHaveBeenCalled();
  });
  it('只修改积分时复用已保存凭证，不重新提交密钥', async () => {
    api.save.mockResolvedValue({ ...tushare, configVersion: 2, settings: { accountLevel: { points: 5000, independentApis: [] } } });
    await render(tushare);
    const field = document.querySelector('input[type="number"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, '5000');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click('检查权限并保存');
    expect(api.save).toHaveBeenCalledWith('tushare', undefined, { accountLevel: { points: 5000, independentApis: [] } }, 1);
    expect(api.test).not.toHaveBeenCalled();
  });
});
