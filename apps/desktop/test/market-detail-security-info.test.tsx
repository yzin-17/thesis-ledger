// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { securityStaticInfoResponseSchema } from '@thesis-ledger/schemas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketDetailSecurityInfo } from '../src/features/market-detail/MarketDetailSecurityInfo.js';
import type { MarketDetailPosition } from '../src/features/market-detail/market-detail.types.js';
import { fetchSecurityStaticInfo } from '../src/features/market-data/security-static-info.api.js';

vi.mock('../src/features/market-data/security-static-info.api.js', () => ({ fetchSecurityStaticInfo: vi.fn() }));
const read = vi.mocked(fetchSecurityStaticInfo);
const stock: MarketDetailPosition = { symbol: '03968.HK', asset: { name: '招商银行', assetType: 'stock' } };
const info = securityStaticInfoResponseSchema.parse({
  contractVersion: 3, consumer: 'thesis-ledger', requestId: 'controlled', symbol: stock.symbol, assetType: 'STOCK',
  market: 'HK', name: '招商银行', securityId: '9007199254740993', sharesPerLot: '100', listingDate: '2006-09-22',
  delisted: false, exchange: 'HKEX', provider: 'futu', historicalChanges: 'unverified',
  observedAt: '2026-11-10T01:00:00Z', fetchedAt: '2026-11-10T01:01:00Z', policyRevision: 1,
  routeTarget: { providerId: 'futu', upstreamSource: 'futu', routeIndex: 0 },
});
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;

async function render(position = stock) {
  await act(async () => root.render(<QueryClientProvider client={client}>
    <MarketDetailSecurityInfo position={position} />
  </QueryClientProvider>));
}
async function settled() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
}
async function refresh() {
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="刷新证券资料"]')!.click());
  await settled();
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  read.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
});

describe('详情自动证券资料', () => {
  it('挂载自动读取，中央加载后保留大整数、每手股数和历史有效性说明', async () => {
    let complete!: (value: typeof info) => void;
    read.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    await render();
    expect(host.querySelector('[aria-label="正在读取证券资料"]')).not.toBeNull();
    expect(read).toHaveBeenCalledWith('03968.HK', 'STOCK', expect.any(AbortSignal));
    await act(async () => complete(info));
    await settled();
    expect(host.textContent).toContain('9007199254740993');
    expect(host.textContent).toContain('每手股数100');
    expect(host.textContent).toContain('当前退市标志否');
    expect(host.textContent).toContain('当前资料，历史变更未核验');
    expect(host.textContent).toContain('上市日期来自供应商已废弃字段，仅供参考');
    expect(host.querySelector('form')).toBeNull();
  });

  it.each([
    { symbol: '600036.SH', asset: { name: '招商银行', assetType: 'stock' as const } },
    { symbol: '000001.OF', asset: { name: '基金', assetType: 'fund' as const } },
    { symbol: '^HSI.HK', asset: { name: '指数', assetType: 'stock' as const } },
    { symbol: 'AAPL.US', asset: { name: '类型未知' } },
  ])('不支持的身份 $symbol 不发资料请求', async (position) => {
    await render(position);
    expect(read).not.toHaveBeenCalled();
    expect(host.textContent).toBe('');
  });

  it('同代码 ETF 与股票分别查询，切回股票复用缓存，缺失字段显示未知', async () => {
    read.mockImplementation(async (symbol, assetType) => ({ ...info, symbol, assetType,
      name: null, securityId: null, sharesPerLot: null, listingDate: null, exchange: null, delisted: null }));
    await render();
    await settled();
    expect(host.textContent).toContain('每手股数未知');
    expect(host.textContent).toContain('当前退市标志未知');
    expect(host.textContent).not.toContain('已废弃字段');
    await render({ ...stock, asset: { ...stock.asset, assetType: 'etf' } });
    await settled();
    expect(read).toHaveBeenLastCalledWith(stock.symbol, 'ETF', expect.any(AbortSignal));
    await render();
    await settled();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('刷新保留资料并叠放加载圈，失败保留数据，重试恢复', async () => {
    read.mockResolvedValueOnce(info);
    await render();
    await settled();
    let fail!: (reason: Error) => void;
    read.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    await refresh();
    expect(host.textContent).toContain(info.securityId);
    expect(host.querySelector('[data-slot="list-refresh"][aria-label="正在刷新证券资料"]')).not.toBeNull();
    await act(async () => fail(new Error('资料来源暂时不可用')));
    await settled();
    expect(host.textContent).toContain('证券资料刷新失败');
    expect(host.textContent).toContain('已保留上次资料');
    expect(host.textContent).toContain(info.securityId);
    expect(host.querySelector('[data-slot="list-refresh"]')).toBeNull();
    read.mockResolvedValueOnce({ ...info, sharesPerLot: '200' });
    const retry = [...host.querySelectorAll('button')].find((button) => button.textContent === '重试证券资料')!;
    await act(async () => retry.click());
    await settled();
    expect(host.textContent).toContain('每手股数200');
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('首读失败仍能重试，切换证券取消旧请求且迟到结果不串入', async () => {
    read.mockRejectedValueOnce(new Error('路由未配置'));
    await render();
    await settled();
    expect(host.textContent).toContain('证券资料未读取');
    let complete!: (value: typeof info) => void;
    read.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    await refresh();
    const signal = read.mock.calls.at(-1)![2]!;
    read.mockResolvedValueOnce({ ...info, symbol: 'AAPL.US', market: 'US', name: '苹果公司', sharesPerLot: '1' });
    await render({ symbol: 'AAPL.US', asset: { name: '苹果公司', assetType: 'stock' } });
    await settled();
    expect(signal.aborted).toBe(true);
    await act(async () => complete(info));
    await settled();
    expect(host.textContent).toContain('苹果公司');
    expect(host.textContent).not.toContain('招商银行');
  });

  it('关闭时取消资料请求', async () => {
    read.mockImplementation(() => new Promise(() => {}));
    await render();
    const signal = read.mock.calls[0]![2]!;
    await act(async () => root.render(<QueryClientProvider client={client}><span>详情已关闭</span></QueryClientProvider>));
    expect(signal.aborted).toBe(true);
  });
});
