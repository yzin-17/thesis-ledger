// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstrumentCatalogPanel } from '../src/features/market-data/InstrumentCatalogPanel.js';
import { useInstrumentSearchQuery, marketDataKeys } from '../src/features/market-data/market-data.queries.js';
import { useConfirmInstrumentMutation } from '../src/features/market-data/market-data.mutations.js';

const api = vi.hoisted(() => ({ client: undefined as unknown }));
vi.mock('../src/shared/api/client.js', () => ({ getDesktopApiClient: () => api.client }));
const id = '11111111-1111-4111-8111-111111111111';
const item = { id, symbol: '600036.SH', canonicalCode: '600036', displayName: '招商银行', market: 'SH',
  instrumentType: 'STOCK', confirmable: true, confirmed: false, disabledReason: null, active: true, generation: 1 };

function Harness() {
  const [text, setText] = useState('招商银行');
  const [error, setError] = useState('');
  const search = useInstrumentSearchQuery(text);
  const confirm = useConfirmInstrumentMutation();
  return <><span>{error}</span><InstrumentCatalogPanel catalog={null} disabled={false} syncing={false}
    searchBusy={search.isFetching} searchRefreshing={search.isRefetching && search.data !== undefined}
    searchRequested searchError={search.isError ? '目录刷新失败' : null} searchResults={search.data ?? []}
    confirmingId={confirm.isPending ? confirm.variables ?? null : null} onSync={() => {}} onSearch={setText}
    onRetrySearch={() => void search.refetch()} onConfirm={(row) => {
      setError('');
      void confirm.mutateAsync(row.id).catch(() => setError('标的确认失败'));
    }} /></>;
}

let host: HTMLDivElement, root: Root, client: QueryClient;
async function render() {
  await act(async () => root.render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>));
}
async function wait(check: () => void) {
  await vi.waitFor(async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); check(); });
}
function button(label: string) {
  const result = [...host.querySelectorAll('button')].find((node) => node.textContent?.trim() === label);
  if (!result) throw new Error(`未找到按钮 ${label}`);
  return result;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals();
});

describe('目录确认持久状态与缓存', () => {
  it('确认成功立即收敛，刷新失败仍保留已确认，刷新和重新挂载保持；港美股不误标', async () => {
    let saved = false, readFails = false, finish!: () => void, writes = 0;
    const hk = { ...item, id: '22222222-2222-4222-8222-222222222222', symbol: '03968.HK', canonicalCode: '03968',
      market: 'HK', confirmable: false, confirmed: false, disabledReason: 'unsupported_market' };
    api.client = new ThesisLedgerApiClient('http://localhost/', async (_url, init) => {
      if (init?.method === 'POST') {
        writes += 1;
        await new Promise<void>((resolve) => { finish = resolve; });
        saved = true; readFails = true;
        return Response.json({});
      }
      if (readFails) return Response.json({ message: '受控刷新失败' }, { status: 503 });
      return Response.json([{ ...item, confirmed: saved }, hk]);
    });
    await render();
    await wait(() => expect(button('确认标的').disabled).toBe(false));
    expect(button('不支持关联').disabled).toBe(true);
    await act(async () => button('确认标的').click());
    expect(button('确认标的').disabled).toBe(true);
    expect(writes).toBe(1);
    await act(async () => finish());
    await wait(() => expect(button('已确认').disabled).toBe(true));
    expect(host.textContent).toContain('目录刷新失败');
    readFails = false;
    await act(async () => client.invalidateQueries({ queryKey: [...marketDataKeys.root, 'instruments'] }));
    await wait(() => expect(button('已确认').disabled).toBe(true));
    await act(async () => root.render(<span>目录已关闭</span>));
    client.clear(); await render();
    await wait(() => expect(button('已确认').disabled).toBe(true));
    expect(writes).toBe(1);
    expect(button('不支持关联').disabled).toBe(true);
  });

  it('写入失败保持待确认，重试成功后更新；所有搜索词缓存同步', async () => {
    let fail = true, saved = false, writes = 0;
    api.client = new ThesisLedgerApiClient('http://localhost/', async (_url, init) => {
      if (init?.method === 'POST') {
        writes += 1;
        if (fail) return Response.json({ message: '受控确认失败' }, { status: 503 });
        saved = true; return Response.json({});
      }
      return Response.json([{ ...item, confirmed: saved }]);
    });
    client.setQueryData(marketDataKeys.search('600036'), [item]);
    await render();
    await wait(() => expect(button('确认标的').disabled).toBe(false));
    await act(async () => button('确认标的').click());
    await wait(() => expect(host.textContent).toContain('标的确认失败'));
    expect(button('确认标的').disabled).toBe(false);
    expect(host.textContent).not.toContain('已确认');
    fail = false;
    await act(async () => button('确认标的').click());
    await wait(() => expect(button('已确认').disabled).toBe(true));
    expect(client.getQueryData(marketDataKeys.search('600036'))).toMatchObject([{ confirmed: true }]);
    expect(writes).toBe(2);
  });

  it('确认前发出的旧搜索被取消，晚到的未确认结果不能覆盖成功状态', async () => {
    let saved = false, finish!: (items: typeof item[]) => void, oldSignal!: AbortSignal;
    api.client = new ThesisLedgerApiClient('http://localhost/', async (_url, init) => {
      if (init?.method === 'POST') { saved = true; return Response.json({}); }
      return Response.json([{ ...item, confirmed: saved }]);
    });
    await render();
    await wait(() => expect(button('确认标的').disabled).toBe(false));
    const oldKey = marketDataKeys.search('600036');
    client.setQueryData(oldKey, [item]);
    const pending = client.fetchQuery({ queryKey: oldKey, queryFn: ({ signal }) => {
      oldSignal = signal;
      return new Promise<typeof item[]>((resolve) => { finish = resolve; });
    } }).catch(() => undefined);
    await act(async () => button('确认标的').click());
    await wait(() => expect(button('已确认').disabled).toBe(true));
    expect(oldSignal.aborted).toBe(true);
    await act(async () => finish([item]));
    await pending;
    expect(client.getQueryData(oldKey)).toMatchObject([{ confirmed: true }]);
  });
});
