// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InstrumentSearchResult } from '@thesis-ledger/schemas';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  InstrumentSymbolField,
  type InstrumentSymbolFieldProps,
} from '../src/features/market-data/InstrumentSymbolField.js';
import { InstrumentOptionField } from '../src/features/market-data/InstrumentOptionField.js';

const api = vi.hoisted(() => ({ search: vi.fn(), confirm: vi.fn() }));
vi.mock('../src/shared/api/client.js', () => ({
  getDesktopApiClient: () => ({
    market: { searchInstruments: api.search, confirmInstrument: api.confirm },
  }),
}));
const item = (
  id: string,
  symbol: string,
  market = 'OF',
  instrumentType = 'MUTUAL_FUND',
): InstrumentSearchResult => ({
  id,
  symbol,
  market,
  instrumentType,
  displayName: `目录名称${id}`,
  canonicalCode: symbol.split('.')[0]!,
  active: true,
  confirmable: true,
  disabledReason: null,
  generation: 1,
});
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
function Harness(props: Partial<InstrumentSymbolFieldProps>) {
  const [value, setValue] = useState(props.value ?? '');
  return (
    <>
      <InstrumentSymbolField
        {...props}
        value={value}
        onChange={(next) => {
          setValue(next);
          props.onChange?.(next);
        }}
      />
      <output>{value}</output>
    </>
  );
}
async function mount(props: Partial<InstrumentSymbolFieldProps> = {}) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Harness {...props} />
      </QueryClientProvider>,
    ),
  );
}
const input = () => host.querySelector('input[role="combobox"]') as HTMLInputElement;
async function type(value: string) {
  await act(async () => {
    input().focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), value);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function flush(ms = 30) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}
const options = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')];
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  api.search.mockReset();
  api.confirm.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
});

it('selects the real directory result with market/type limits and preserves the canonical submission value', async () => {
  const fund = item('fund', '000001.OF');
  api.search.mockResolvedValue([
    fund,
    item('stock', '000001.SZ', 'SZ', 'STOCK'),
    { ...item('inactive', '000002.OF'), active: false },
  ]);
  const selected = vi.fn();
  await mount({ markets: ['OF'], instrumentTypes: ['MUTUAL_FUND'], onSelect: selected });
  await type('000001');
  await flush(360);
  await flush();
  expect(options()).toHaveLength(1);
  expect(options()[0]!.textContent).toContain('目录名称fund');
  await act(async () => options()[0]!.click());
  expect(host.querySelector('output')!.textContent).toBe('000001.OF');
  expect(selected).toHaveBeenCalledWith(fund);
  expect(api.confirm).not.toHaveBeenCalled();
  expect(api.search.mock.calls[0]![1]).toBeInstanceOf(AbortSignal);
});
it('does not expose a late result for a different input and cancels the obsolete query', async () => {
  let finish!: (items: InstrumentSearchResult[]) => void;
  api.search
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue([item('new', '000002.OF')]);
  await mount();
  await type('old');
  await flush(360);
  await flush();
  const signal = api.search.mock.calls[0]![1] as AbortSignal;
  await type('new');
  expect(options()).toHaveLength(0);
  await flush(360);
  await flush();
  expect(signal.aborted).toBe(true);
  await act(async () => finish([item('old', '000001.OF')]));
  await flush();
  expect(
    options()
      .map((option) => option.textContent)
      .join(),
  ).toContain('目录名称new');
  expect(
    options()
      .map((option) => option.textContent)
      .join(),
  ).not.toContain('目录名称old');
});
it('distinguishes failure from empty results and retries without overwriting manual input', async () => {
  api.search.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([]);
  await mount();
  await type('未知代码');
  await flush(360);
  await flush();
  expect(document.body.textContent).toContain('标的目录暂时无法读取');
  expect(document.body.textContent).not.toContain('未找到符合当前条件');
  const retry = [...document.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('重试标的搜索'),
  )!;
  await act(async () => retry.click());
  await flush();
  expect(document.body.textContent).toContain('未找到符合当前条件');
  expect(host.querySelector('output')!.textContent).toBe('未知代码');
});
it('does not request the directory for disabled values or empty input', async () => {
  await mount({ value: '000001.OF', disabled: true });
  await flush(360);
  await flush();
  expect(input().disabled).toBe(true);
  expect(api.search).not.toHaveBeenCalled();
});
it('searches bounded holdings without querying or admitting a global directory result', async () => {
  const change = vi.fn();
  await act(async () =>
    root.render(
      <InstrumentOptionField
        label="账户持仓"
        value="000001.OF"
        options={[{ value: '000001.OF', label: '我的基金' }]}
        onChange={change}
      />,
    ),
  );
  await type('我的');
  expect(options()).toHaveLength(1);
  await act(async () => options()[0]!.click());
  expect(change).toHaveBeenCalledWith('000001.OF');
  expect(api.search).not.toHaveBeenCalled();
});

it('keeps manually entered values on close and clears only on an explicit user action', async () => {
  api.search.mockResolvedValue([]);
  await mount();
  await type('CUSTOM.US');
  await flush(360);
  await flush();
  await act(async () =>
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  );
  expect(host.querySelector('output')!.textContent).toBe('CUSTOM.US');
  const clear = host.querySelector<HTMLButtonElement>('[aria-label="清空标的"]')!;
  await act(async () => clear.click());
  expect(host.querySelector('output')!.textContent).toBe('');
});
