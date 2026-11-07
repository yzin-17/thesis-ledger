// @vitest-environment jsdom
import { createRequire } from 'node:module';
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import * as schemas from '@thesis-ledger/schemas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMobileTheme } from '../src/theme';
import { ArenaScreen } from '../src/features/model-arena/ArenaScreen';
import { ArenaWeekScreen } from '../src/features/model-arena/ArenaWeekScreen';

const runtime = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('react-native', () => vi.importActual('react-native-web'));
vi.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
vi.mock('../src/app/MobileRuntime', () => ({ useMobileRuntime: () => runtime.value }));
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
  runtime.value = {
    theme: getMobileTheme('light'),
    scope: ['arena-refresh'],
    api: new ThesisLedgerApiClient('http://localhost/api/v1', async (input, init) => {
      const url = new URL(String(input));
      requests.push({ path: url.pathname, method: init?.method ?? 'GET' });
      const gate = gates.get(url.pathname);
      if (gate) return gate.promise;
      const data = fixture.response(url);
      if (data === undefined) throw new Error('未配置响应 ' + url.pathname);
      return Response.json(data);
    }),
  };
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
type Kind = 'detail' | 'round' | 'list' | 'week-list' | 'week';
async function mount(kind: Kind, wait = true) {
  const params: Record<string, string> = {};
  if (kind === 'detail' || kind === 'round' || kind === 'week') params.match = ids.arena;
  if (kind === 'round') params.round = ids.round;
  if (kind === 'week') params.id = ids.week;
  const props = { route: { params }, navigation: { navigate: vi.fn(), push: vi.fn() } };
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        {kind.startsWith('week') ? (
          <ArenaWeekScreen {...(props as unknown as ComponentProps<typeof ArenaWeekScreen>)} />
        ) : (
          <ArenaScreen {...(props as unknown as ComponentProps<typeof ArenaScreen>)} />
        )}
      </QueryClientProvider>,
    ),
  );
  if (wait)
    await vi.waitFor(() => {
      expect(client.isFetching()).toBe(0);
      expect(host.textContent).toContain('受控双模型比赛');
      if (kind === 'detail') expect(host.textContent).toContain('净值 10100');
      if (kind === 'round') expect(host.textContent).toContain('2026-11-02 轮次');
      if (kind === 'week') expect(host.textContent).toContain('本周决策');
    });
}
function pending(paths: string[]) {
  for (const path of paths) gates.set(path, Promise.withResolvers<Response>());
}
async function refresh(count: number) {
  await act(async () => {
    void client.invalidateQueries({ predicate: (q) => !q.queryKey.includes('watchlist-identity') });
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
const indicators = () => host.querySelectorAll('[role="progressbar"]');
const label = () => indicators()[0]?.getAttribute('aria-label');

describe('移动竞技场与周报后台读取', () => {
  for (const kind of ['detail', 'round'] as const) {
    it.each([false, true])(
      `${kind}保留原内容，等待两种响应顺序且只有一个圈：%s`,
      async (reverse) => {
        const paths = [arenaPath, kind === 'round' ? roundPath : comparisonPath];
        await mount(kind);
        const before = host.textContent;
        pending(paths);
        await refresh(2);
        await vi.waitFor(() => expect(indicators()).toHaveLength(1));
        expect(label()).toBe(kind === 'round' ? '正在刷新比赛轮次' : '正在刷新比赛详情');
        expect(host.textContent).toBe(before);
        const order = reverse ? [...paths].reverse() : paths;
        await release(order[0]!);
        await vi.waitFor(() => expect(client.isFetching()).toBe(1));
        expect(indicators()).toHaveLength(1);
        expect(host.textContent).toBe(before);
        await release(order[1]!);
        await vi.waitFor(() => expect(indicators()).toHaveLength(0));
        expect(host.textContent).toBe(before);
        expect(requests.filter((r) => r.path === paths[0])).toHaveLength(2);
        expect(requests.filter((r) => r.path === paths[1])).toHaveLength(2);
      },
    );
  }
  it.each([
    ['list', '/api/v1/model-arenas', '正在刷新比赛列表'],
    ['week-list', '/api/v1/model-weeklies', '正在刷新周报列表'],
    ['week', weekPath, '正在刷新周报详情'],
  ] as const)('单查询页面保留原内容并结束刷新：%s', async (kind, path, expected) => {
    await mount(kind);
    const before = host.textContent;
    pending([path]);
    await refresh(1);
    await vi.waitFor(() => expect(indicators()).toHaveLength(1));
    expect(label()).toBe(expected);
    expect(host.textContent).toBe(before);
    await release(path);
    await vi.waitFor(() => expect(indicators()).toHaveLength(0));
    expect(host.textContent).toBe(before);
  });
  it('详情已读取时等待排名，排名失败和恢复保持具体反馈', async () => {
    pending([arenaPath, comparisonPath]);
    await mount('detail', false);
    await vi.waitFor(() => expect(indicators()).toHaveLength(1));
    expect(label()).toBe('正在读取');
    await release(arenaPath);
    await vi.waitFor(() => expect(label()).toBe('正在刷新比赛详情'));
    expect(indicators()).toHaveLength(1);
    expect(host.textContent).toContain('模拟现金 10000 CNY');
    await release(comparisonPath, 503);
    await vi.waitFor(() => expect(client.isFetching()).toBe(0));
    await vi.waitFor(() => expect(host.textContent).toContain('受控读取失败'));
    expect(indicators()).toHaveLength(0);
    pending([comparisonPath]);
    await act(async () =>
      [...host.querySelectorAll('[role="button"]')]
        .find((b) => b.textContent === '重新读取')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
    await vi.waitFor(() => expect(indicators()).toHaveLength(1));
    await release(comparisonPath);
    await vi.waitFor(() => expect(indicators()).toHaveLength(0));
    expect(host.textContent).toContain('净值 10100');
  });
  it('周报失败保留冻结内容，重试后恢复', async () => {
    await mount('week');
    pending([weekPath]);
    await refresh(1);
    await release(weekPath, 503);
    await vi.waitFor(() => expect(client.isFetching()).toBe(0));
    await vi.waitFor(() => expect(host.textContent).toContain('受控读取失败'));
    expect(host.textContent).toContain('本周决策');
    pending([weekPath]);
    await act(async () =>
      [...host.querySelectorAll('[role="button"]')]
        .find((b) => b.textContent === '重新读取')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
    await vi.waitFor(() => expect(indicators()).toHaveLength(1));
    await release(weekPath);
    await vi.waitFor(() => expect(indicators()).toHaveLength(0));
    expect(host.textContent).toContain('本周决策');
    expect(host.textContent).not.toContain('受控读取失败');
  });
});
