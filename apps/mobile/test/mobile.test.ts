import { describe, expect, it, vi } from 'vitest';
import { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import { resolveMobileApiBaseUrl } from '../src/index.js';
import { createMobileQueryClient } from '../src/app/query/query-client';
import { mobileValuationOptions } from '../src/app/query/valuation-query';
import { mobileScopeKey } from '../src/app/navigation-state';
import { valuationLoadState } from '../src/app/query/query-state';

const accountId = '00000000-0000-4000-8000-000000000001';
const portfolio = (overrides: Record<string, unknown> = {}) => ({
  positions: [],
  cashValue: 500,
  cashByAccount: [{ accountId, amount: 500 }],
  totalCost: 0,
  totalMarketValue: 500,
  totalPnl: 0,
  unrealizedPnl: 0,
  unrealizedPnlRatio: null,
  realizedPnl: 0,
  realizedPnlRatio: null,
  cumulativePnl: 0,
  cumulativePnlRatio: null,
  baseCurrency: 'CNY',
  mode: 'shadow',
  partial: false,
  valuedAt: '2026-10-25T01:00:00.000Z',
  ...overrides,
});
const optionsFor = (fetcher: typeof fetch) =>
  mobileValuationOptions(
    new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher),
    mobileScopeKey('https://ledger.test/api/v1', 'shadow'),
    accountId,
  );

describe('手机当前 Query 运行路径', () => {
  it('保留模拟器安全默认地址，显式环境地址优先', () => {
    expect(resolveMobileApiBaseUrl({ platform: 'android' })).toBe('http://10.0.2.2:3000/api/v1');
    expect(resolveMobileApiBaseUrl({ platform: 'ios' })).toBe('http://127.0.0.1:3000/api/v1');
    expect(
      resolveMobileApiBaseUrl({
        platform: 'android',
        explicitBaseUrl: ' https://ledger.test/api/v1 ',
      }),
    ).toBe('https://ledger.test/api/v1');
  });

  it.each([
    { cashValue: 500, partial: false, status: 'ready' },
    { cashValue: 0, partial: false, status: 'empty' },
    { cashValue: 500, partial: true, status: 'stale' },
  ])('实际查询保留服务端现金 $cashValue，并显示 $status 状态', async (scenario) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(portfolio(scenario)));
    const client = createMobileQueryClient();
    try {
      const options = optionsFor(fetcher);
      const value = await client.fetchQuery(options);
      expect(value.cashValue).toBe(scenario.cashValue);
      expect(valuationLoadState({ data: value, isPending: false, isError: false })).toBe(
        scenario.status,
      );
      const url = new URL(String(fetcher.mock.calls[0]![0]));
      expect(url.searchParams.get('mode')).toBe('shadow');
      expect(url.searchParams.get('accountId')).toBe(accountId);
    } finally {
      client.clear();
    }
  });

  it.each(['invalid', 'unavailable'] as const)(
    '最新响应 %s 时保留上次现金并显式报错，不补零或显示成功',
    async (kind) => {
      const broken =
        kind === 'invalid'
          ? Response.json(portfolio({ cashValue: undefined }))
          : Response.json({ message: '读取暂不可用' }, { status: 503 });
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json(portfolio()))
        .mockResolvedValueOnce(broken);
      const client = createMobileQueryClient();
      try {
        const options = { ...optionsFor(fetcher), staleTime: 0 };
        const previous = await client.fetchQuery(options);
        await expect(client.fetchQuery(options)).rejects.toThrow();
        const state = client.getQueryState<typeof previous>(options.queryKey)!;
        expect(state.status).toBe('error');
        expect(state.data).toBe(previous);
        expect(state.data?.cashValue).toBe(500);
        expect(valuationLoadState({ data: state.data, isPending: false, isError: true })).toBe(
          'error',
        );
        expect(fetcher).toHaveBeenCalledTimes(2);
      } finally {
        client.clear();
      }
    },
  );

  it('取消会中止真实查询信号，晚到响应不能覆盖后续读取', async () => {
    let finish!: (value: Response) => void;
    const late = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(late)
      .mockResolvedValueOnce(Response.json(portfolio({ cashValue: 800 })));
    const client = createMobileQueryClient();
    try {
      const options = optionsFor(fetcher);
      const original = client.fetchQuery(options).catch((error: unknown) => error);
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
      const signal = fetcher.mock.calls[0]![1]?.signal;
      expect(client.getQueryState(options.queryKey)?.status).toBe('pending');
      await client.cancelQueries({ queryKey: options.queryKey });
      expect(signal?.aborted).toBe(true);
      await client.fetchQuery(options);
      finish(Response.json(portfolio({ cashValue: 100 })));
      await original;
      await Promise.resolve();
      expect(client.getQueryData<{ cashValue: number }>(options.queryKey)?.cashValue).toBe(800);
    } finally {
      client.clear();
    }
  });
});
