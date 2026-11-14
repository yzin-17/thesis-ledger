// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstrumentSearchResult } from '@thesis-ledger/schemas';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { StrategyExperimentCreatePage } from '../src/features/strategy/StrategyExperimentCreatePage.js';
import { discoveryInstrumentFromDirectory } from '../src/features/strategy/ExperimentDiscoveryInstrumentField.js';

const api = vi.hoisted(() => ({ create: vi.fn(), capabilities: vi.fn() }));
vi.mock('../src/features/strategy/strategy-optimization.api', async (original) => ({
  ...(await original<object>()), createOptimizationExperiment: api.create,
  fetchOptimizationCapabilities: api.capabilities,
}));
vi.mock('../src/components/ui/toast', () => ({ useToastManager: () => ({ add: vi.fn() }) }));
vi.mock('../src/features/strategy/OptimizationPricePreparation', () => ({
  OptimizationPricePreparation: ({ target, startDate, endDate, initialCash, currency, onPrepared }: {
    target: unknown; startDate: string; endDate: string; initialCash: string; currency: string;
    onPrepared: (value: unknown) => void;
  }) => <button onClick={() => onPrepared({ target, result: { runConfig: {
    startDate, endDate, baseCurrency: currency, initialCash: { [currency]: initialCash },
    // 本用例隔离目录元数据传递，只提供创建入口读取的已准备字段。
    executionPriceProtocol: { priceBasis: { adjustment: 'hfq' } },
    priceResearch: { actualPriceWindow: {} },
  } } })}>受控准备完成</button>,
}));
vi.mock('../src/features/market-data/InstrumentSymbolField', () => ({
  InstrumentSymbolField: ({ value, onChange, onSelect, accepts }: {
    value: string; onChange: (value: string) => void;
    onSelect: (item: InstrumentSearchResult) => void;
    accepts: (item: InstrumentSearchResult) => boolean;
  }) => <>
    <input aria-label="探索标的" value={value} onChange={(event) => onChange(event.target.value)} />
    {choices.filter(accepts).map((item) => <button key={item.id} onClick={() => {
      onChange(item.symbol); onSelect(item);
    }}>{item.displayName}</button>)}
  </>,
}));

function directory(market: string, instrumentType: string, symbol: string): InstrumentSearchResult {
  return { id: symbol, market, instrumentType, symbol, canonicalCode: symbol,
    displayName: `${market} ${instrumentType}`, active: true, confirmable: true,
    disabledReason: null, generation: 1 };
}
const choices = [
  directory('SH', 'STOCK', '600036.SH'), directory('HK', 'ETF', '02800.HK'),
  directory('US', 'STOCK', 'AAPL.US'), directory('OF', 'MUTUAL_FUND', '000001.OF'),
];
const cleanups: Array<() => void> = [];
const NativeRequest = globalThis.Request;
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('Request', class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(input, init ? { ...init, signal: undefined } : undefined);
    }
  });
  api.capabilities.mockResolvedValue({ aiOptimizationEnabled: true, providers: [
    { provider: 'controlled', model: 'fixture', costStatus: 'known', costCurrency: 'USD' },
  ] });
  api.create.mockResolvedValue({ id: 'controlled-experiment' });
});
afterEach(async () => {
  await act(async () => cleanups.splice(0).forEach((cleanup) => cleanup()));
  vi.unstubAllGlobals();
});
async function mount() {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host), client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([
    { path: '/strategy/experiments/new', element: <StrategyExperimentCreatePage strategies={[]} /> },
    { path: '/strategy/experiments/:id', element: <p>创建完成</p> },
  ], { initialEntries: ['/strategy/experiments/new'] });
  cleanups.push(() => { root.unmount(); router.dispose(); client.clear(); host.remove(); });
  await act(async () => root.render(<QueryClientProvider client={client}><ConfirmDialogProvider>
    <RouterProvider router={router} />
  </ConfirmDialogProvider></QueryClientProvider>));
  await click('从零探索');
}
async function click(text: string) {
  const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === text);
  if (!button) throw new Error(`缺少操作：${text}`);
  await act(async () => button.click());
}
const metadata = () => document.querySelector('dl[aria-label="标的信息"]')!.textContent;

describe('实验探索标的目录信息', () => {
  it.each([
    ['SH', 'CN'], ['SZ', 'CN'], ['BJ', 'CN'], ['OF', 'CN'], ['HK', 'HK'], ['US', 'US'],
  ])('使用目录市场 %s，不能根据代码后缀改成其他市场', (directoryMarket, expected) => {
    expect(discoveryInstrumentFromDirectory(directory(directoryMarket, 'STOCK', 'OTHER.US'))?.market).toBe(expected);
  });
  it('缺失、未知、失效和不支持的标的信息不能产生默认股票配置', () => {
    for (const item of [null, directory('UNKNOWN', 'STOCK', 'AAPL.US'),
      directory('US', 'INDEX', 'INDEX.US'), directory('HK', 'MUTUAL_FUND', 'FUND.HK'),
      { ...choices[0]!, active: false }]) expect(discoveryInstrumentFromDirectory(item)).toBeNull();
  });
  it.each([
    [0, 'CN', 'stock', 'CNY', '中国内地', '股票'],
    [1, 'HK', 'etf', 'HKD', '香港', 'ETF'],
    [2, 'US', 'stock', 'USD', '美国', '股票'],
    [3, 'CN', 'fund', 'CNY', '中国内地', '基金 NAV'],
  ] as const)('目录选择 %s 的展示、准备与创建使用同一份信息', async (index, market, assetType, currency, marketText, assetText) => {
    await mount();
    await click(choices[index]!.displayName);
    expect(metadata()).toContain(marketText); expect(metadata()).toContain(assetText);
    await click('下一步'); await click('下一步'); await click('受控准备完成');
    await click('创建实验');
    await vi.waitFor(() => expect(api.create).toHaveBeenCalledOnce());
    const payload = api.create.mock.calls[0]![0];
    expect(payload.discoveryScope).toEqual({ executionInstrument: {
      symbol: choices[index]!.symbol, market, assetType,
    }, primaryTimeframe: '1d' });
    expect(payload.runConfig.baseCurrency).toBe(currency);
    expect(payload.runConfig.initialCash).toEqual({ [currency]: '100000' });
    expect(payload.runConfig.executionPriceProtocol.priceBasis.adjustment).toBe('hfq');
    expect(payload.runConfig.priceResearch.actualPriceWindow).toEqual({});
  });
  it('编辑搜索会清除旧信息；手输代码不能沿用上一个标的提交', async () => {
    await mount(); await click(choices[1]!.displayName);
    const input = document.querySelector<HTMLInputElement>('input[aria-label="探索标的"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'AAPL.US');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(metadata()).not.toContain('香港'); expect(metadata()).toContain('待选择标的');
    await click('下一步'); expect(document.body.textContent).toContain('请从目录选择探索标的。');
    expect(document.body.textContent).toContain('策略与目标'); expect(api.create).not.toHaveBeenCalled();
    await click(choices[2]!.displayName); expect(metadata()).toContain('美国');
    await click('下一步'); await click('上一步'); expect(metadata()).toContain('美国');
  });
});
