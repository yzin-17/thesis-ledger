import { afterEach, describe, expect, it, vi } from 'vitest';
import { focusManager, onlineManager, QueryObserver } from '@tanstack/react-query';
import { installNativeQueryLifecycle } from '../../src/app/query/native-lifecycle';
import { createMobileQueryClient } from '../../src/app/query/query-client';
import { mobileScopeKey } from '../../src/app/navigation-state';
import { refreshAfterMobileWrite } from '../../src/app/query/refresh-after-write';

const native = vi.hoisted(() => ({
  app: vi.fn(),
  network: vi.fn(),
  initial: vi.fn(),
  removeApp: vi.fn(),
  removeNetwork: vi.fn(),
}));
vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: native.app },
}));
vi.mock('expo-network', () => ({
  addNetworkStateListener: native.network,
  getNetworkStateAsync: native.initial,
}));
afterEach(() => {
  vi.resetAllMocks();
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
});

describe('原生 Query 生命周期', () => {
  it('写入后等待账本刷新，外部估值延迟不会延迟写入确认，估值失败仍可观察', async () => {
    const client = createMobileQueryClient();
    const scope = mobileScopeKey('https://one.test/api/v1', 'shadow');
    const ledgerKey = [...scope, 'ledger', 'account-1'];
    const valuationKey = [...scope, 'valuation', 'account-1'];
    client.setQueryData(ledgerKey, '账本旧版本');
    client.setQueryData(valuationKey, '旧估值');
    let failValuation!: (error: Error) => void;
    const valuation = new QueryObserver(client, {
      queryKey: valuationKey,
      staleTime: Infinity,
      queryFn: () =>
        new Promise<string>((_resolve, reject) => {
          failValuation = reject;
        }),
    });
    const ledger = new QueryObserver(client, {
      queryKey: ledgerKey,
      staleTime: Infinity,
      queryFn: () => '账本新版本',
    });
    let observeFailure!: () => void;
    const failureObserved = new Promise<void>((resolve) => {
      observeFailure = resolve;
    });
    const stopValuation = valuation.subscribe((result) => {
      if (result.isError) observeFailure();
    });
    const stopLedger = ledger.subscribe(() => undefined);
    await refreshAfterMobileWrite(client, scope);
    expect(client.getQueryData(ledgerKey)).toBe('账本新版本');
    expect(valuation.getCurrentResult().isFetching).toBe(true);
    failValuation(new Error('行情来源暂不可用'));
    await failureObserved;
    expect(valuation.getCurrentResult().isError).toBe(true);
    expect(valuation.getCurrentResult().data).toBe('旧估值');
    stopValuation();
    stopLedger();
    client.clear();
  });
  it('前后台和网络监听工作，晚到初始网络响应不覆盖新状态，离页解除监听', async () => {
    let app!: (state: string) => void;
    let network!: (state: { isConnected: boolean; isInternetReachable?: boolean }) => void;
    let restore!: (state: { isConnected: boolean }) => void;
    native.app.mockImplementation((_event, fn) => {
      app = fn;
      return { remove: native.removeApp };
    });
    native.network.mockImplementation((fn) => {
      network = fn;
      return { remove: native.removeNetwork };
    });
    native.initial.mockReturnValue(
      new Promise((resolve) => {
        restore = resolve;
      }),
    );
    const cleanup = installNativeQueryLifecycle();
    app('background');
    expect(focusManager.isFocused()).toBe(false);
    app('active');
    expect(focusManager.isFocused()).toBe(true);
    network({ isConnected: false });
    restore({ isConnected: true });
    await Promise.resolve();
    expect(onlineManager.isOnline()).toBe(false);
    network({ isConnected: true, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(true);
    cleanup();
    expect(native.removeApp).toHaveBeenCalledOnce();
    expect(native.removeNetwork).toHaveBeenCalledOnce();
  });
  it('风险失败不清空组合，连接/模式/账户切换不复用旧范围的数据', async () => {
    const client = createMobileQueryClient();
    const first = [
      ...mobileScopeKey('https://one.test/api/v1', 'actual'),
      'valuation',
      'account-1',
    ];
    const second = [
      ...mobileScopeKey('https://two.test/api/v1', 'shadow'),
      'valuation',
      'account-2',
    ];
    let resolve!: (value: string) => void;
    const pending = client.fetchQuery({
      queryKey: first,
      queryFn: () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    });
    await client.fetchQuery({ queryKey: second, queryFn: () => '新范围组合' });
    resolve('旧范围晚到组合');
    await pending;
    await expect(
      client.fetchQuery({
        queryKey: [...mobileScopeKey('https://two.test/api/v1', 'shadow'), 'risk'],
        queryFn: () => Promise.reject(new Error('风险读取失败')),
      }),
    ).rejects.toThrow();
    expect(client.getQueryData(second)).toBe('新范围组合');
    expect(client.getQueryData(first)).toBe('旧范围晚到组合');
    expect(
      client.getQueryData([
        ...mobileScopeKey('https://two.test/api/v1', 'actual'),
        'valuation',
        'account-2',
      ]),
    ).toBeUndefined();
    client.clear();
  });
});
