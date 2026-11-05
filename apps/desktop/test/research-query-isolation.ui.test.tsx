// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider, keepPreviousData } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  researchReportDetailSchema,
  researchResultV2Schema,
  researchReportSummarySchema,
  type ResearchReportDetail,
  type ResearchReportLocatorInput,
  type ResearchReportSummary,
  type ResearchReportListInput,
} from '@thesis-ledger/schemas';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
import {
  useResearchReportQuery,
  useResearchReportsQuery,
} from '../src/features/ai/research.queries.js';
import { setIdentitySession } from '../src/shared/api/identity-session.js';

type Page = { items: ResearchReportSummary[]; hasMore: boolean; nextCursor: string | null };
const api = vi.hoisted(() => ({
  detail:
    vi.fn<
      (
        id: string,
        scope: ResearchReportLocatorInput,
        signal?: AbortSignal,
      ) => Promise<ResearchReportDetail>
    >(),
  list: vi.fn<(query: ResearchReportListInput, signal?: AbortSignal) => Promise<Page>>(),
}));
vi.mock('../src/shared/api/client.js', () => ({ getDesktopApiClient: () => ({ research: api }) }));
const raw = JSON.parse(
  readFileSync('../../packages/schemas/fixtures/research-v2.samples.json', 'utf8'),
) as { result: unknown };
const result = researchResultV2Schema.parse(raw.result);
const id = '00000000-0000-4000-8000-000000000077';
const saved = researchReportDetailSchema.parse({
  id,
  status: 'succeeded',
  question: '仅原身份可读的受控问题',
  createdAt: result.createdAt,
  updatedAt: result.createdAt,
  historicalScope: { status: 'known', snapshot: result.scopeSnapshot },
  resultVersion: 2,
  availability: 'available',
  summary: result.inference.conclusion,
  quality: result.quality,
  errorCode: null,
  errorSummary: null,
  result,
  submission: null,
});
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
let view: ReturnType<typeof useResearchReportQuery>;
let listed: ReturnType<typeof useResearchReportsQuery>;
let mounted = false;
function Detail({ mode }: { mode: 'actual' | 'shadow' }) {
  view = useResearchReportQuery(id, { view: 'scoped', mode });
  return <output data-error={view.isError}>{view.data?.question ?? ''}</output>;
}
function List({ kind }: { kind: 'instrument' | 'account' }) {
  listed = useResearchReportsQuery({ view: 'scoped', mode: 'shadow', kind });
  return (
    <output>
      {listed.data?.pages.flatMap((page) => page.items.map((item) => item.question)).join('')}
    </output>
  );
}
async function mount(element: ReactNode) {
  if (!mounted) {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, placeholderData: keepPreviousData } },
    });
    mounted = true;
  }
  await act(async () => {
    root.render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
  });
}
const tick = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
beforeEach(() => {
  vi.resetAllMocks();
  setIdentitySession(null);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});
afterEach(async () => {
  if (mounted) {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
    mounted = false;
  }
  setIdentitySession(null);
  vi.unstubAllGlobals();
});

it('即使全局配置保留旧数据，模式变化也不显示旧报告占位', async () => {
  let reject!: (error: Error) => void;
  api.detail.mockResolvedValueOnce(saved).mockImplementationOnce(
    () =>
      new Promise((_done, fail) => {
        reject = fail;
      }),
  );
  await mount(<Detail mode="shadow" />);
  await vi.waitFor(async () => {
    await tick();
    expect(view.data?.id).toBe(id);
  });
  await mount(<Detail mode="actual" />);
  expect(view.data).toBeUndefined();
  expect(host.textContent).not.toContain(saved.question);
  await act(async () => reject(new ThesisLedgerApiError(404, { error: 'not_found' })));
  await vi.waitFor(async () => {
    await tick();
    expect(view.isError).toBe(true);
  });
  expect(view.data).toBeUndefined();
});
it('模式变化中止原读取，忽略中止的晚到响应不能替换新范围', async () => {
  let resolve!: (value: ResearchReportDetail) => void;
  api.detail
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    )
    .mockRejectedValueOnce(new ThesisLedgerApiError(404, { error: 'not_found' }));
  await mount(<Detail mode="shadow" />);
  await tick();
  const signal = api.detail.mock.calls[0]![2];
  await mount(<Detail mode="actual" />);
  expect(signal?.aborted).toBe(true);
  await act(async () => resolve(saved));
  await vi.waitFor(async () => {
    await tick();
    expect(view.isError).toBe(true);
  });
  expect(view.data).toBeUndefined();
  expect(host.textContent).not.toContain(saved.question);
});
it('身份变化不复用前一个主体的详情缓存或占位正文', async () => {
  api.detail
    .mockResolvedValueOnce(saved)
    .mockRejectedValueOnce(new ThesisLedgerApiError(404, { error: 'not_found' }));
  await mount(<Detail mode="shadow" />);
  await vi.waitFor(async () => {
    await tick();
    expect(view.data?.id).toBe(id);
  });
  await act(async () =>
    setIdentitySession({
      token: 'r'.repeat(43),
      expiresAt: '2030-01-01T00:00:00Z',
      principal: {
        id: 'a1111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        username: 'reader',
        displayName: '受控读者',
      },
    }),
  );
  expect(view.data).toBeUndefined();
  await vi.waitFor(async () => {
    await tick();
    expect(view.isError).toBe(true);
  });
  expect(host.textContent).not.toContain(saved.question);
  expect(api.detail).toHaveBeenCalledTimes(2);
});
it('对象类别变化立即隐藏旧列表；不把保留占位当成当前结果', async () => {
  let resolve!: (value: Page) => void;
  const summary = researchReportSummarySchema.strip().parse(saved);
  api.list
    .mockResolvedValueOnce({ items: [summary], hasMore: false, nextCursor: null })
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
  await mount(<List kind="instrument" />);
  await vi.waitFor(async () => {
    await tick();
    expect(listed.data?.pages[0]?.items).toHaveLength(1);
  });
  await mount(<List kind="account" />);
  expect(listed.data).toBeUndefined();
  expect(host.textContent).not.toContain(saved.question);
  await act(async () => resolve({ items: [], hasMore: false, nextCursor: null }));
  await vi.waitFor(async () => {
    await tick();
    expect(listed.isSuccess).toBe(true);
  });
  expect(listed.data?.pages[0]?.items).toEqual([]);
});
