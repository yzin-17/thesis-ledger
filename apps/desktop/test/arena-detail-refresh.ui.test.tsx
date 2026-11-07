// @vitest-environment jsdom
import { createRequire } from 'node:module';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import * as schemas from '@thesis-ledger/schemas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArenaPage } from '../src/features/model-arena/ArenaPage';
import { ArenaWeekPage } from '../src/features/model-arena/ArenaWeekPage';

const desktop = vi.hoisted(() => ({ api: null as unknown }));
vi.mock('../src/shared/api/client', () => ({ getDesktopApiClient: () => desktop.api }));
const { ids, arenaRefreshFixture } = createRequire(import.meta.url)(
  '../../../scripts/fixtures/arena-detail-refresh.cjs',
);
const fixture = arenaRefreshFixture(schemas);
const arenaPath = '/api/v1/model-arenas/' + ids.arena;
const roundPath = arenaPath + '/rounds/' + ids.round;
const comparisonPath = arenaPath + '/comparison';
const weekPath = '/api/v1/model-weeklies/' + ids.arena + '/' + ids.week;
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let gates: Map<string, ReturnType<typeof Promise.withResolvers<Response>>>;
let requests: Array<{ path: string; method: string }>;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  gates = new Map();
  requests = [];
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  desktop.api = new ThesisLedgerApiClient('http://localhost/api/v1', async (input, init) => {
    const url = new URL(String(input));
    requests.push({ path: url.pathname, method: init?.method ?? 'GET' });
    const gate = gates.get(url.pathname);
    if (gate) return gate.promise;
    const data = fixture.response(url);
    if (data === undefined) throw new Error('未配置响应 ' + url.pathname);
    return Response.json(data);
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    for (const [path, gate] of gates)
      gate.resolve(Response.json(fixture.response(new URL(path, 'http://localhost'))));
    root.unmount();
  });
  client.clear();
  host.remove();
  expect(requests.every((r) => r.method === 'GET')).toBe(true);
  vi.unstubAllGlobals();
});
async function mount(path: string, wait = true) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/strategy/arena/:match?/:round?" element={<ArenaPage />} />
            <Route path="/journal/model-weeklies/:match?/:id?" element={<ArenaWeekPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
  if (wait)
    await vi.waitFor(() => {
      expect(client.isFetching()).toBe(0);
      expect(host.textContent).toContain('受控双模型比赛');
      if (path.startsWith('/strategy/arena/')) {
        expect(
          host.querySelector(path.includes(ids.round) ? 'article' : 'tbody tr'),
        ).not.toBeNull();
      }
      if (path.includes(ids.week)) expect(host.textContent).toContain('本周决策');
    });
}
function pending(paths: string[]) {
  for (const path of paths) gates.set(path, Promise.withResolvers<Response>());
}
async function refresh(count: number) {
  await act(async () => {
    void client.invalidateQueries();
  });
  await vi.waitFor(() => expect(client.isFetching()).toBe(count));
}
async function release(path: string, status = 200) {
  await act(async () =>
    gates
      .get(path)!
      .resolve(
        Response.json(
          status === 200
            ? fixture.response(new URL(path, 'http://localhost'))
            : { error: 'controlled_read_failure', message: '受控读取失败' },
          { status },
        ),
      ),
  );
}
const indicators = () => host.querySelectorAll('[data-slot="list-refresh"]');
const label = () => indicators()[0]?.getAttribute('aria-label');

describe('竞技场与周报后台读取', () => {
  for (const kind of ['比赛详情', '比赛轮次'] as const) {
    it.each([false, true])(
      `${kind}等待两种响应顺序，保留原数据且始终只有一个圈：%s`,
      async (reverse) => {
        const route = '/strategy/arena/' + ids.arena + (kind === '比赛轮次' ? '/' + ids.round : '');
        const paths = [arenaPath, kind === '比赛轮次' ? roundPath : comparisonPath];
        await mount(route);
        const row = host.querySelector(kind === '比赛轮次' ? 'article' : 'tbody tr')!;
        const before = row.textContent;
        pending(paths);
        await refresh(2);
        await vi.waitFor(() => expect(indicators()).toHaveLength(1));
        expect(label()).toBe('正在刷新' + kind);
        expect(host.contains(row)).toBe(true);
        expect(row.textContent).toBe(before);
        const order = reverse ? [...paths].reverse() : paths;
        await release(order[0]!);
        await vi.waitFor(() => expect(client.isFetching()).toBe(1));
        expect(indicators()).toHaveLength(1);
        expect(row.textContent).toBe(before);
        await release(order[1]!);
        await vi.waitFor(() => expect(indicators()).toHaveLength(0));
        expect(host.contains(row)).toBe(true);
        expect(row.textContent).toBe(before);
        expect(requests.filter((r) => r.path === paths[0])).toHaveLength(2);
        expect(requests.filter((r) => r.path === paths[1])).toHaveLength(2);
      },
    );
  }

  it.each([
    ['/strategy/arena', '/api/v1/model-arenas', '正在刷新比赛列表'],
    ['/journal/model-weeklies', '/api/v1/model-weeklies', '正在刷新周报列表'],
    ['/journal/model-weeklies/' + ids.arena + '/' + ids.week, weekPath, '正在刷新周报详情'],
  ])('单查询页面保留原内容并结束刷新：%s', async (route, path, expected) => {
    await mount(route!);
    const before = host.textContent;
    const links = [...host.querySelectorAll('a')].map((a) => a.href);
    pending([path!]);
    const refreshButton = host.querySelector<HTMLButtonElement>('[aria-label="刷新模型周报"]');
    if (route.startsWith('/journal')) {
      expect(refreshButton?.disabled).toBe(false);
      await act(async () => refreshButton!.click());
      await vi.waitFor(() => expect(client.isFetching()).toBe(1));
    } else await refresh(1);
    await vi.waitFor(() => expect(indicators()).toHaveLength(1));
    if (refreshButton) expect(refreshButton.disabled).toBe(true);
    expect(label()).toBe(expected);
    expect(host.textContent).toBe(before);
    expect([...host.querySelectorAll('a')].map((a) => a.href)).toEqual(links);
    await release(path!);
    await vi.waitFor(() => expect(indicators()).toHaveLength(0));
    if (refreshButton) expect(refreshButton.disabled).toBe(false);
    expect(host.textContent).toBe(before);
  });

  it('首次详情读取后等待排名，保留首次加载和失败重试的区别', async () => {
    pending([arenaPath, comparisonPath]);
    await mount('/strategy/arena/' + ids.arena, false);
    expect(host.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe('正在读取比赛');
    expect(indicators()).toHaveLength(0);
    await release(arenaPath);
    await vi.waitFor(() => expect(indicators()).toHaveLength(1));
    expect(host.textContent).toContain('模拟现金 10000 CNY');
    await release(comparisonPath, 503);
    await vi.waitFor(() => expect(client.isFetching()).toBe(0));
    await vi.waitFor(() => expect(indicators()).toHaveLength(0));
    const retry = [...host.querySelectorAll('button')].find(
      (b) => b.textContent === '比较数据读取失败，重试',
    )!;
    expect(retry).toBeTruthy();
    pending([comparisonPath]);
    await act(async () => retry.click());
    await vi.waitFor(() => expect(indicators()).toHaveLength(1));
    await release(comparisonPath);
    await vi.waitFor(() => expect(indicators()).toHaveLength(0));
    expect(host.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('周报刷新失败保留原修订和深链，重试后恢复', async () => {
    await mount('/journal/model-weeklies/' + ids.arena + '/' + ids.week);
    const links = [...host.querySelectorAll('a')].map((a) => a.href);
    pending([weekPath]);
    await refresh(1);
    await release(weekPath, 503);
    await vi.waitFor(() => expect(client.isFetching()).toBe(0));
    await vi.waitFor(() => expect(host.textContent).toContain('读取失败，重新读取'));
    expect(host.textContent).toContain('第 2 版');
    expect(host.textContent).toContain('本周决策');
    expect([...host.querySelectorAll('a')].map((a) => a.href)).toEqual(links);
    pending([weekPath]);
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((b) => b.textContent === '读取失败，重新读取')!
        .click(),
    );
    await vi.waitFor(() => expect(indicators()).toHaveLength(1));
    await release(weekPath);
    await vi.waitFor(() => expect(indicators()).toHaveLength(0));
    expect(host.textContent).not.toContain('读取失败，重新读取');
    expect(host.textContent).toContain('第 2 版');
  });
});
