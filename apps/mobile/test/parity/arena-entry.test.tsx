// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import type { ComponentProps } from 'react';
import { expect, it, vi } from 'vitest';
import { button, click, mount, setApi } from './mobile-view-harness';
import { ArenaScreen } from '../../src/features/model-arena/ArenaScreen';
import { ArenaWeekScreen } from '../../src/features/model-arena/ArenaWeekScreen';
const owner = '00000000-0000-4000-8000-000000000001';
it('增加周报入口后，研究页签仍从研究首页打开', () => {
  const navigator = readFileSync('src/app/ResearchNavigator.tsx', 'utf8');
  expect(navigator).toMatch(/<Stack\.Navigator\s+initialRouteName="ResearchHome"/);
});
it('研究下的比赛列表无需投资账户，进入建赛只导航、不派发', async () => {
  const navigate = vi.fn(),
    paths: string[] = [];
  setApi(async (url) => {
    const path = new URL(String(url)).pathname;
    paths.push(path);
    if (path.endsWith('/identity/context')) return Response.json({ principal: { id: owner } });
    if (path.endsWith('/model-arenas')) return Response.json([]);
    throw Error(path);
  });
  await mount(
    <ArenaScreen
      {...({ route: { params: undefined }, navigation: { navigate } } as unknown as ComponentProps<
        typeof ArenaScreen
      >)}
    />,
  );
  await vi.waitFor(() => expect(button('新建模拟比赛')).toBeTruthy());
  await click(button('新建模拟比赛'));
  expect(navigate).toHaveBeenCalledWith('ArenaSetup');
  expect(paths.every((p) => p.endsWith('/identity/context') || p.endsWith('/model-arenas'))).toBe(
    true,
  );
});
it('从独立周报列表定位比赛和原修订', async () => {
  const push = vi.fn();
  setApi(async (url) =>
    new URL(String(url)).pathname.endsWith('/identity/context')
      ? Response.json({ principal: { id: owner } })
      : Response.json([
          {
            id: owner,
            arenaId: owner,
            title: '受控比赛',
            week: '2026-11-02',
            revision: 2,
            publishedAt: '2026-11-06T01:00:00Z',
          },
        ]),
  );
  await mount(
    <ArenaWeekScreen
      {...({ route: { params: undefined }, navigation: { push } } as unknown as ComponentProps<
        typeof ArenaWeekScreen
      >)}
    />,
  );
  await vi.waitFor(() => expect(button('受控比赛 · 2026-11-02 当周 · 第 2 版')).toBeTruthy());
  await click(button('受控比赛 · 2026-11-02 当周 · 第 2 版'));
  expect(push).toHaveBeenCalledWith('ArenaWeek', { match: owner, id: owner });
});
it('周报中的成交和观望分别定位到对应参赛模型', async () => {
  const navigate = vi.fn();
  const round = '00000000-0000-4000-8000-000000000002';
  const trader = '00000000-0000-4000-8000-000000000003';
  const observer = '00000000-0000-4000-8000-000000000004';
  const day = '2026-11-02',
    at = day + 'T07:00:00Z';
  const report = {
    method: 'weekly-v1',
    calendarVersion: 'fixture',
    week: day,
    cutoff: at,
    timeZone: 'Asia/Shanghai',
    comparison: {
      arenaId: owner,
      start: day,
      end: day,
      currency: 'CNY',
      planned: 1,
      opened: 1,
      rows: [],
    },
    rounds: [
      {
        id: round,
        day,
        state: 'sealed',
        reason: null,
        fingerprint: 'fixture',
        entries: [
          {
            entrantId: observer,
            model: '乙',
            state: 'observe',
            decision: null,
            modelCost: '0',
            costStatus: 'known',
            costCurrency: 'USD',
            requestId: null,
          },
        ],
      },
    ],
    fills: [
      {
        id: trader,
        roundId: round,
        entrantId: trader,
        symbol: '001971.SZ',
        side: 'buy',
        quantity: '50',
        price: '10',
        fee: '0',
        executedAt: at,
        sourceRef: 'open',
      },
    ],
  };
  setApi(async (url) =>
    new URL(String(url)).pathname.endsWith('/identity/context')
      ? Response.json({ principal: { id: owner } })
      : Response.json({
          id: owner,
          arenaId: owner,
          title: '双模型联验',
          week: day,
          revision: 1,
          publishedAt: at,
          digest: 'fixture',
          report,
        }),
  );
  await mount(
    <ArenaWeekScreen
      {...({
        route: { params: { match: owner, id: owner } },
        navigation: { navigate },
      } as unknown as ComponentProps<typeof ArenaWeekScreen>)}
    />,
  );
  for (const [label, entrant] of [
    ['乙', observer],
    ['模拟买入', trader],
  ]) {
    const target = () =>
      [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(label!));
    await vi.waitFor(() => expect(target()).toBeDefined());
    await click(target()!);
    expect(navigate).toHaveBeenLastCalledWith('Strategy', {
      screen: 'ModelArena',
      params: { match: owner, round, entrant },
    });
  }
});
