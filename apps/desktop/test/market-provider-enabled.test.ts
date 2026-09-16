import { MutationObserver, QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { providerEnabledMutationOptions } from '../src/features/market-data/market-provider-enabled.js';
import { marketDataKeys } from '../src/features/market-data/market-data.queries.js';
import type { ProviderManifest } from '../src/features/market-data/market-data.types.js';

const request = vi.hoisted(() => vi.fn());
vi.mock('../src/shared/api/client.js', () => ({
  getDesktopApiClient: () => ({ request }),
}));

const provider = (providerId: string): ProviderManifest => ({
  providerId,
  displayName: providerId,
  version: 1,
  capabilities: {},
  enabled: true,
  configured: true,
  credentialConfigured: true,
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const clients: QueryClient[] = [];
const makeClient = () => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  client.setQueryData(marketDataKeys.providers(), [provider('finnhub'), provider('tushare')]);
  clients.push(client);
  return client;
};
const enabled = (client: QueryClient, id: string) =>
  client
    .getQueryData<ProviderManifest[]>(marketDataKeys.providers())
    ?.find((item) => item.providerId === id)?.enabled;

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  request.mockReset();
});

describe('数据源即时启停', () => {
  it('只发送 enabled，保存后保留其他来源和凭证状态', async () => {
    const client = makeClient();
    request.mockResolvedValue({ providerId: 'finnhub', enabled: false });
    await new MutationObserver(client, providerEnabledMutationOptions(client)).mutate({
      providerId: 'finnhub',
      enabled: false,
    });
    expect(request).toHaveBeenCalledWith('/api/v2/market-data/providers/finnhub/config', {
      method: 'POST',
      body: JSON.stringify({ enabled: false }),
    });
    expect(enabled(client, 'finnhub')).toBe(false);
    expect(enabled(client, 'tushare')).toBe(true);
    expect(
      client.getQueryData<ProviderManifest[]>(marketDataKeys.providers())?.[0].credentialConfigured,
    ).toBe(true);
  });

  it('不同来源并发时，失败恢复不会回滚另一个来源的成功保存', async () => {
    const client = makeClient();
    const first = deferred<{ providerId: string; enabled: boolean }>();
    const second = deferred<{ providerId: string; enabled: boolean }>();
    request.mockImplementation((path: string) =>
      path.includes('finnhub') ? first.promise : second.promise,
    );
    const a = new MutationObserver(client, providerEnabledMutationOptions(client)).mutate({
      providerId: 'finnhub',
      enabled: false,
    });
    const rejected = expect(a).rejects.toThrow('网络失败');
    const b = new MutationObserver(client, providerEnabledMutationOptions(client)).mutate({
      providerId: 'tushare',
      enabled: false,
    });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(enabled(client, 'finnhub')).toBe(false);
    expect(enabled(client, 'tushare')).toBe(false);
    second.resolve({ providerId: 'tushare', enabled: false });
    await b;
    first.reject(new Error('网络失败'));
    await rejected;
    expect(enabled(client, 'finnhub')).toBe(true);
    expect(enabled(client, 'tushare')).toBe(false);
  });

  it('响应超时但服务端已保存时，重新查询恢复服务端真实状态', async () => {
    const client = makeClient();
    const query = new QueryObserver(client, {
      queryKey: marketDataKeys.providers(),
      staleTime: Infinity,
      queryFn: async () => [{ ...provider('finnhub'), enabled: false }, provider('tushare')],
    });
    const unsubscribe = query.subscribe(() => {});
    request.mockRejectedValue(new Error('响应超时'));
    await expect(
      new MutationObserver(client, providerEnabledMutationOptions(client)).mutate({
        providerId: 'finnhub',
        enabled: false,
      }),
    ).rejects.toThrow('响应超时');
    expect(enabled(client, 'finnhub')).toBe(false);
    unsubscribe();
  });
});
