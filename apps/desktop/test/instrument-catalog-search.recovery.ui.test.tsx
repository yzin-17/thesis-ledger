// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstrumentCatalogPanel } from '../src/features/market-data/InstrumentCatalogPanel.js';
import { useInstrumentSearchQuery } from '../src/features/market-data/market-data.queries.js';
import type { InstrumentResult } from '../src/features/market-data/market-data.types.js';

const desktopApi = vi.hoisted(() => ({ client: undefined as unknown }));

vi.mock('../src/shared/api/client.js', () => ({
  getDesktopApiClient: () => desktopApi.client,
}));

type SearchHarnessProps = {
  onSync: () => void;
  onConfirm: (instrument: InstrumentResult) => void;
};

function SearchHarness({ onSync, onConfirm }: SearchHarnessProps) {
  const [submittedSearch, setSubmittedSearch] = useState('');
  const search = useInstrumentSearchQuery(submittedSearch);
  const searchError =
    search.isError && !search.isFetching ? '本地标的目录暂时无法读取，请重试。' : null;

  return (
    <InstrumentCatalogPanel
      catalog={null}
      disabled={false}
      syncing={false}
      searchBusy={search.isFetching}
      searchRequested={Boolean(submittedSearch)}
      searchError={searchError}
      searchResults={search.data ?? []}
      confirmingId={null}
      onSync={onSync}
      onSearch={setSubmittedSearch}
      onRetrySearch={() => void search.refetch()}
      onConfirm={onConfirm}
    />
  );
}

let host: HTMLDivElement | undefined;
let root: Root | undefined;
let queryClient: QueryClient | undefined;

async function mountSearch(onSync: () => void, onConfirm: (instrument: InstrumentResult) => void) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root!.render(
      <QueryClientProvider client={queryClient!}>
        <SearchHarness onSync={onSync} onConfirm={onConfirm} />
      </QueryClientProvider>,
    );
  });
}

function visibleButton(text: string): HTMLButtonElement {
  const button = [...(host?.querySelectorAll('button') ?? [])].find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!(button instanceof HTMLButtonElement)) throw new Error(`找不到按钮：${text}`);
  return button;
}

async function waitForText(text: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (host?.textContent?.includes(text)) return;
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
  expect(host?.textContent).toContain(text);
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  queryClient?.clear();
  host?.remove();
  vi.unstubAllGlobals();
  root = undefined;
  host = undefined;
  queryClient = undefined;
  desktopApi.client = undefined;
});

describe('标的目录搜索失败恢复', () => {
  it('展示未搜索、加载、失败和无匹配状态，并只重试当前本地目录 GET', async () => {
    let resolveFirstResponse: ((response: Response) => void) | undefined;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirstResponse = resolve;
    });
    const requests: Array<{ url: string; method: string }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requests.push({ url: url.toString(), method: init?.method ?? 'GET' });
      if (requests.length === 1) return firstResponse;
      return new Response('[]', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    desktopApi.client = new ThesisLedgerApiClient(
      'http://127.0.0.1:3000/api/v1/',
      fetcher as typeof fetch,
    );
    const onSync = vi.fn();
    const onConfirm = vi.fn();
    await mountSearch(onSync, onConfirm);

    expect(host?.textContent).toContain('输入代码、名称或拼音首字母');
    expect(requests).toEqual([]);

    const input = host?.querySelector<HTMLInputElement>('input[aria-label="搜索已同步标的"]');
    expect(input).toBeInstanceOf(HTMLInputElement);
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(input, '600000');
    await act(async () => {
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      host
        ?.querySelector('form')
        ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(host?.querySelector('[role="status"]')?.getAttribute('aria-busy')).toBe('true');
    expect(host?.textContent).toContain('正在搜索本地标的…');
    expect(requests).toEqual([
      {
        url: 'http://127.0.0.1:3000/api/market-data/instruments/search?q=600000&limit=50',
        method: 'GET',
      },
    ]);

    await act(async () => {
      resolveFirstResponse?.(
        new Response('{"message":"temporarily unavailable"}', {
          status: 503,
          headers: { 'content-type': 'application/json' },
        }),
      );
      await firstResponse;
    });
    await waitForText('本地标的目录暂时无法读取，请重试。');
    expect(input?.value).toBe('600000');

    await act(async () => visibleButton('重试').click());
    await waitForText('没有找到匹配的本地标的');

    expect(input?.value).toBe('600000');
    expect(requests).toEqual([
      {
        url: 'http://127.0.0.1:3000/api/market-data/instruments/search?q=600000&limit=50',
        method: 'GET',
      },
      {
        url: 'http://127.0.0.1:3000/api/market-data/instruments/search?q=600000&limit=50',
        method: 'GET',
      },
    ]);
    expect(onSync).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
