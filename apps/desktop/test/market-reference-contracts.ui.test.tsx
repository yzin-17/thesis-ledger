// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MarketReferenceContractField } from '../src/features/market-data/MarketReferenceContractField.js';
import type { ReferenceContractKind } from '@thesis-ledger/api-client';
const api = vi.hoisted(() => ({ read: vi.fn(), search: vi.fn(), confirm: vi.fn() }));
vi.mock('../src/shared/api/client.js', () => ({
  getDesktopApiClient: () => ({
    market: {
      getReference: api.read,
      searchInstruments: api.search,
      confirmInstrument: api.confirm,
    },
  }),
}));
const page = (file: string) =>
  JSON.parse(
    readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../../../packages/api-client/test/fixtures/reference-contracts',
        `${file}.json`,
      ),
      'utf8',
    ),
  );
let host: HTMLDivElement, root: Root, client: QueryClient;
function Form({ kind }: { kind: ReferenceContractKind }) {
  const [value, setValue] = useState('');
  return (
    <>
      <MarketReferenceContractField kind={kind} value={value} onChange={setValue} />
      <output>{value}</output>
    </>
  );
}
async function mount(kind: ReferenceContractKind) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Form kind={kind} />
      </QueryClientProvider>,
    ),
  );
}
const field = (label: string) =>
  host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
async function input(label: string, value: string) {
  await act(async () => {
    const e = field(label);
    e.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(e, value);
    e.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const button = (text: string) =>
  [...host.querySelectorAll('button')].find((e) => e.textContent?.trim() === text)!;
async function click(text: string) {
  await act(async () => button(text).click());
  await flush();
}
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}
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
  api.read.mockReset();
  api.search.mockReset().mockResolvedValue([]);
  api.confirm.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
});
it('requires an explicit date/read and searches real source contracts without creating Instrument IDs or suffixes', async () => {
  api.read.mockResolvedValue(page('futures'));
  await mount('future');
  expect(api.read).not.toHaveBeenCalled();
  await click('读取合约清单');
  expect(api.read).not.toHaveBeenCalled();
  expect(host.textContent).toContain('请选择清单交易日');
  await input('合约清单交易日', '2026-11-06');
  await click('读取合约清单');
  expect(api.read.mock.calls[0]![0]).toMatchObject({
    dataset: 'futures-daily-shfe',
    start: '2026-11-06',
    end: '2026-11-06',
    pageSize: 20,
  });
  await input('期货代码', '铜');
  await act(async () => {
    field('期货代码').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    field('期货代码').blur();
    field('期货代码').focus();
  });
  expect(
    [...document.querySelectorAll('[role="option"]')].every((item) =>
      item.textContent?.includes('铜'),
    ),
  ).toBe(true);
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((e) =>
    e.textContent?.includes('CU2611'),
  )!;
  await act(async () => option.click());
  expect(host.querySelector('output')?.textContent).toBe('CU2611');
  expect(api.confirm).not.toHaveBeenCalled();
  expect(host.textContent).toContain('本页 20 条可选合约');
});
it('selects only source option codes, preserves near-month scope and does not auto-read later pages', async () => {
  api.read.mockImplementation(async (input) =>
    page(input.page === 2 ? 'options-page2' : 'options'),
  );
  await mount('option');
  await input('期权标的 ETF', '159915.SZ');
  await click('读取合约清单');
  expect(api.read).not.toHaveBeenCalled();
  await input('期权标的 ETF', '510050.SH');
  await click('读取合约清单');
  await input('期权合约代码', '10012637');
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((e) =>
    e.textContent?.includes('10012637'),
  )!;
  await act(async () => option.click());
  expect(host.querySelector('output')?.textContent).toBe('10012637');
  expect(api.read).toHaveBeenCalledTimes(1);
  await click('下一页合约');
  expect(api.read.mock.calls[1]![0]).toMatchObject({ page: 2, symbol: '510050.SH' });
  expect(host.textContent).toContain('本页 4 条可选合约');
});
it('condition changes cancel pending reads, hide stale candidates, and failure retries retain the manual code', async () => {
  let finish!: (data: unknown) => void;
  api.read
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockRejectedValueOnce(new Error('来源暂不可用'))
    .mockResolvedValue(page('futures'));
  await mount('future');
  await input('合约清单交易日', '2026-11-06');
  await click('读取合约清单');
  const signal = api.read.mock.calls[0]![1] as AbortSignal;
  await input('合约清单交易日', '2026-11-05');
  expect(signal.aborted).toBe(true);
  await act(async () => finish(page('futures')));
  await flush();
  await input('期货代码', 'RB0');
  expect(document.querySelectorAll('[role="option"]')).toHaveLength(0);
  await click('读取合约清单');
  expect(host.textContent).toContain('来源暂不可用');
  expect(host.querySelector('output')?.textContent).toBe('RB0');
  await click('读取合约清单');
  expect(api.read).toHaveBeenCalledTimes(3);
});
