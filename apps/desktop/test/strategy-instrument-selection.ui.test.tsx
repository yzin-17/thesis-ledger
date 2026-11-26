// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InstrumentSearchResult } from '@thesis-ledger/schemas';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StrategyEditorSheet } from '../src/features/strategy/StrategyEditorSheet.js';
import { StrategyExecutionInstrumentField } from '../src/features/strategy/StrategyExecutionInstrumentField.js';
import { createDefaultStrategySchema } from '../src/features/strategy/strategy.schema.js';
import type { StrategySchema } from '../src/features/strategy/strategy.types.js';

const api = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('../src/shared/api/client.js', () => ({ getDesktopApiClient: () => ({ market: { searchInstruments: api.search } }) }));
const row = (symbol: string, market: string, instrumentType: string): InstrumentSearchResult => ({
  id: symbol, symbol, market, instrumentType, displayName: `目录${symbol}`, canonicalCode: symbol.split('.')[0]!, active: true, confirmable: true, disabledReason: null, generation: 1,
});
const rows = [row('510300.SH', 'SH', 'ETF'), row('00700.HK', 'HK', 'STOCK'), row('02800.HK', 'HK', 'ETF'), row('AAPL.US', 'US', 'STOCK'), row('SPY.US', 'US', 'ETF'), row('000001.OF', 'OF', 'MUTUAL_FUND')];
let root: Root, host: HTMLDivElement, client: QueryClient;
const saved = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  api.search.mockReset().mockResolvedValue(rows); saved.mockReset();
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });
async function mount(ui = <StrategyEditorSheet open presentation="page" mode="create" busy={false} onOpenChange={vi.fn()} onSave={saved} />) {
  await act(async () => root.render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>));
}
async function search(value: string) {
  await act(async () => {
    const input = host.querySelector<HTMLInputElement>('[aria-label="执行标的"]')!;
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 360)); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
}
async function select(symbol: string) {
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((el) => el.textContent?.includes(`目录${symbol}`));
  expect(option).toBeDefined();
  await act(async () => {
    const down = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
    Object.defineProperty(down, 'pointerType', { value: 'mouse' });
    option!.dispatchEvent(down); option!.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, detail: 1 }));
    await Promise.resolve();
  });
}
async function save() {
  await act(async () => { [...host.querySelectorAll('button')].find((el) => el.textContent === '创建策略')!.click(); await Promise.resolve(); });
}

it.each([
  ['510300.SH', 'CN', 'etf'], ['00700.HK', 'HK', 'stock'], ['02800.HK', 'HK', 'etf'], ['AAPL.US', 'US', 'stock'], ['SPY.US', 'US', 'etf'],
])('选择 %s 后显式复制到来源，保存完整目录身份', async (symbol, market, assetType) => {
  await mount();
  expect(host.querySelector('#strategy-asset-type')).toBeNull();
  await search('目录');
  expect(document.querySelectorAll('[role="option"]')).toHaveLength(5);
  await select(symbol);
  await act(async () => { [...host.querySelectorAll('button')].find(el => el.textContent === '使用执行标的')!.click(); });
  await save();
  expect(saved).toHaveBeenCalledTimes(1);
  expect(saved.mock.calls[0]![0]).toMatchObject({ executionInstrument: { symbol, market, assetType }, signalSources: [{ id: 'execution', asset: { symbol, market, assetType } }] });
});

it('更换、清空与未完成搜索不沿用旧身份，加载已有版本不改写原值', async () => {
  const schema = createDefaultStrategySchema();
  schema.executionInstrument = { symbol: 'AAPL.US', market: 'US', assetType: 'stock' };
  const original = structuredClone(schema);
  await mount(<StrategyEditorSheet open presentation="page" mode="edit" version={{ id: 'old', version: 1, schema, createdAt: '' }} busy={false} onOpenChange={vi.fn()} onSave={saved} />);
  expect(schema).toEqual(original);
  await search('目录'); await select('02800.HK');
  expect(host.querySelector<HTMLInputElement>('[aria-label="执行标的"]')!.value).toBe('目录02800.HK · 02800.HK');
  await act(async () => { [...host.querySelectorAll('button')].find((el) => el.textContent === '高级 JSON')!.click(); await Promise.resolve(); });
  expect(JSON.parse(host.querySelector<HTMLTextAreaElement>('#strategy-json')!.value).executionInstrument.symbol).toBe('02800.HK');
  await act(async () => { [...host.querySelectorAll('button')].find((el) => el.textContent === '常用配置')!.click(); await Promise.resolve(); });
  expect(host.querySelector<HTMLInputElement>('[aria-label="执行标的"]')!.value).toBe('目录02800.HK · 02800.HK');
  await search('不存在的名称');
  await act(async () => { [...host.querySelectorAll('button')].find((el) => el.textContent === '保存为新版本')!.click(); await Promise.resolve(); });
  expect(saved).not.toHaveBeenCalled();
  await search('目录'); await select('510300.SH');
  await act(async () => { document.querySelector<HTMLButtonElement>('[aria-label="清空标的"]')!.click(); await Promise.resolve(); });
  expect(host.querySelector<HTMLInputElement>('[aria-label="执行标的"]')!.value).toBe('');
  expect(schema).toEqual(original);
});

it('净值模式仅选择场外基金，仍由结果写入基金类型', async () => {
  function Nav() {
    const [schema, setSchema] = useState<StrategySchema>({ ...createDefaultStrategySchema(), execution: { mode: 'nav' } });
    return <><StrategyExecutionInstrumentField schema={schema} onChange={setSchema} /><output>{JSON.stringify(schema.executionInstrument)}</output></>;
  }
  await mount(<Nav />); await search('目录');
  expect(document.querySelectorAll('[role="option"]')).toHaveLength(1);
  await select('000001.OF');
  expect(JSON.parse(host.querySelector('output')!.textContent!)).toEqual({ symbol: '000001.OF', market: 'CN', assetType: 'fund' });
});
