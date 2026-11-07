import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { expect, vi } from 'vitest';
import { fixtureDatabase, fixtureNews, sessions, serve, sources } from './journey-fixture.mjs';
import { releaseArenaFixture } from './fixture-cleanup.js';
import { RedisService } from '../../dist/src/platform/redis.service.js';
import { ArenaWeekWorker } from '../../dist/src/model-arena/arena-week-worker.js';
import { ArenaWeekStore } from '../../dist/src/model-arena/arena-week-store.js';
import { ArenaRoundWorker } from '../../dist/src/model-arena/arena-round-worker.js';
import { ArenaRoundAdmission } from '../../dist/src/model-arena/arena-round-admission.js';
import { ArenaDecisionRunner } from '../../dist/src/model-arena/arena-decision-runner.js';
import { ArenaModelDecisions } from '../../dist/src/model-arena/arena-model-decisions.js';
import { ArenaResearchPackets } from '../../dist/src/model-arena/arena-research-packets.js';
import { ArenaExecutionRunner } from '../../dist/src/model-arena/arena-execution-runner.js';
import { ArenaExecutionStore } from '../../dist/src/model-arena/arena-execution-store.js';

export async function checkJourney(inspect) {
  // 同一验收驱动 Desktop/Mobile 使用的公共客户端及已编译的 Nest HTTP 入口。
  const { ThesisLedgerApiClient, arenaInitialForm, copyArenaGroup, saveArenaSetup } =
    await import('../../../../packages/api-client/dist/index.js');
  const db = fixtureDatabase(),
    redis = new RedisService();
  const days = sessions(),
    [thu, fri] = days;
  vi.stubEnv('STRATEGY_IDENTITY_MODE', 'account');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(thu.startAt));
  const symbol = '001971.SZ';
  const news = fixtureNews(symbol, thu);
  const app = await serve(db, days, news);
  const base = (await app.getUrl()) + '/api/v1/';
  const credentials = (name) => ({ username: name, displayName: name, password: randomUUID() });
  const alice = credentials('journey.alice'),
    bob = credentials('journey.bob');
  async function identify(user, register) {
    const response = await fetch(base + 'identity/' + (register ? 'users' : 'sessions'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(register ? user : { username: user.username, password: user.password }),
    });
    expect(response.ok).toBe(true);
    const { token, principal } = await response.json();
    const client = new ThesisLedgerApiClient(base, (url, init) => {
      const headers = new Headers(init.headers);
      headers.set('x-thesis-ledger-session', token);
      return fetch(url, { ...init, headers });
    });
    return { client, principal, token };
  }
  const { market, routes, calls, sdk, opening } = sources(symbol, thu, news);
  const roundWorker = new ArenaRoundWorker(db, redis, new ArenaRoundAdmission(db), routes, market);
  const decisions = new ArenaDecisionRunner(
    db,
    new ArenaResearchPackets(db, market),
    new ArenaModelDecisions(db, routes, sdk),
  );
  const execution = new ArenaExecutionRunner(db, opening, new ArenaExecutionStore(db));
  const weeks = app.get(ArenaWeekStore),
    worker = new ArenaWeekWorker(db, redis, weeks);
  let owner, child;
  try {
    const a = await identify(alice, true),
      b = await identify(bob, true);
    owner = a.principal.id;
    const api = a.client,
      arenas = api.modelArenas;
    const instrument = await db.instrument.create({
      data: {
        market: 'SZ',
        canonicalCode: '001971',
        instrumentType: 'STOCK',
        displayName: '联验标的',
        generation: 1,
      },
    });
    await api.watchlist.change({ action: 'createGroup', revision: 0, name: '跟踪订单' });
    const group = (await api.watchlist.list()).groups[0].id;
    await api.watchlist.add(instrument.id, group);
    expect((await b.client.watchlist.list()).items).toEqual([]);
    await expect(copyArenaGroup(b.client, group)).rejects.toMatchObject({ status: 404 });
    const pool = await copyArenaGroup(api, group);
    expect(pool).toEqual([{ instrumentId: instrument.id, symbol, assetType: 'STOCK' }]);
    const models = ['alpha', 'beta'].map((model) => ({ providerId: 'fixture', model }));
    const match = await saveArenaSetup(
      api,
      {
        ...arenaInitialForm(),
        title: '双模型联验',
        startsOn: thu.tradingDate,
        endsOn: fri.tradingDate,
        initialCash: '1000',
        requests: '1',
        allRequests: '2',
        tokens: '17500',
        allTokens: '35000',
      },
      pool,
      models,
      'USD',
    );
    const protocol = (await arenas.get(match.id)).protocol;
    const short = await arenas.create({
      ...protocol,
      title: '单方缺额',
      entrants: protocol.entrants.map((e, i) =>
        i ? { ...e, budget: { ...e.budget, tokens: e.budget.tokens - 1 } } : e,
      ),
    });
    await arenas.transition(short.id, 'start');
    await arenas.transition(match.id, 'start');
    vi.setSystemTime(new Date(thu.endAt));
    roundWorker.start();
    await expect
      .poll(() => db.arenaRound.count({ where: { arenaId: { in: [match.id, short.id] } } }))
      .toBe(2);
    await roundWorker.reconcile();
    await Promise.all([decisions.run(), decisions.run()]);
    const first = (await arenas.get(match.id)).rounds[0];
    expect(first.outcome.state).toBe('sealed');
    expect((await arenas.get(short.id)).rounds[0].outcome.reason).toBe('participant_budget');
    expect(await db.arenaReservation.count({ where: { arenaId: short.id } })).toBe(0);
    expect(calls.map((c) => c.model).sort()).toEqual(['alpha', 'beta']);
    expect(calls[0].input.facts).toEqual(calls[1].input.facts);
    expect(calls[0].input.facts).toContainEqual(expect.objectContaining({ ref: news.ref }));
    await arenas.transition(short.id, 'pause');
    vi.setSystemTime(new Date(fri.startAt));
    await execution.run();
    const q = { symbol, start: fri.tradingDate, end: fri.tradingDate };
    // 赛期跨越了 24 小时会话有效期，后续读取通过原用户重新登录。
    const fresh = (await identify(alice, false)).client.modelArenas;
    const points = await fresh.points(match.id, q);
    expect(points).toMatchObject([
      { roundId: first.id, model: 'fixture / alpha', quantity: '50', price: '10' },
    ]);
    const original = await fresh.round(match.id, points[0].roundId);
    const observe = original.entries.find((e) => e.model === 'beta');
    expect(observe).toMatchObject({ state: 'observe', fills: [] });
    expect(await fresh.points(match.id, { ...q, entrantId: observe.entrantId })).toEqual([]);
    vi.setSystemTime(new Date(fri.endAt));
    await roundWorker.reconcile();
    await expect
      .poll(() => db.arenaOccurrence.count({ where: { arenaId: match.id, state: 'complete' } }))
      .toBe(2);
    await decisions.run();
    expect(calls).toHaveLength(2);
    const weekend = new Date(Date.parse(fri.endAt) + 86400000);
    vi.setSystemTime(weekend);
    child = fork(
      fileURLToPath(new URL('./week-crash-child.mjs', import.meta.url)),
      [weekend.toISOString(), match.id],
      { execArgv: [], stdio: ['ignore', 'ignore', 'inherit', 'ipc'] },
    );
    const claimed = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('未收到周报领取回执')), 10000);
      child.once('message', (value) => {
        clearTimeout(timeout);
        resolve(value);
      });
      child.once('exit', () => {
        clearTimeout(timeout);
        reject(Error('周报进程提前退出'));
      });
    });
    expect(claimed.attempt).toBe(1);
    const exit = once(child, 'exit');
    child.kill('SIGKILL');
    expect((await exit)[1]).toBe('SIGKILL');
    child = undefined;
    expect(await db.arenaWeekRevision.count({ where: { weekId: claimed.id } })).toBe(0);
    const job = await db.arenaWeek.findUniqueOrThrow({ where: { id: claimed.id } });
    expect(job.state).toBe('running');
    vi.setSystemTime(new Date(job.leaseUntil.getTime() + 1));
    worker.start();
    await expect.poll(() => db.arenaWeekRevision.count({ where: { weekId: job.id } })).toBe(1);
    await weeks.execute({ id: job.id, attempt: 1 });
    await worker.run();
    expect(await db.arenaWeek.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
      state: 'published',
      attempt: 2,
    });
    const viewer = await identify(alice, false),
      other = await identify(bob, false);
    const reviews = viewer.client.modelArenas;
    const list = await reviews.weeklies(match.id);
    expect(list).toHaveLength(1);
    const report = await reviews.weekly(match.id, list[0].id);
    expect(report.report.fills).toMatchObject([
      { roundId: first.id, entrantId: points[0].entrantId, quantity: '50' },
    ]);
    const round = await reviews.round(match.id, report.report.fills[0].roundId);
    expect(round.fingerprint).toBe(report.report.rounds.find((r) => r.id === first.id).fingerprint);
    expect(round.entries.every((e) => e.decision.actions[0].references.includes(news.ref))).toBe(
      true,
    );
    expect(round.facts.find((f) => f.ref === news.ref).title).toBe('受控公告披露新增订单');
    expect(await other.client.modelArenas.weeklies()).toEqual([]);
    await expect(other.client.modelArenas.weekly(match.id, list[0].id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(reviews.weekly(short.id, list[0].id)).rejects.toMatchObject({ status: 404 });
    await expect(reviews.round(short.id, first.id)).rejects.toMatchObject({ status: 404 });
    if (inspect)
      await inspect({
        base,
        token: viewer.token,
        days,
        group,
        match: match.id,
        week: list[0].id,
        symbol,
        instrumentId: instrument.id,
      });
    expect(await db.trade.count()).toBe(0);
  } finally {
    if (child && child.exitCode === null && !child.signalCode) {
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      await exited;
    }
    await worker.onModuleDestroy();
    await roundWorker.onModuleDestroy();
    await redis.onModuleDestroy();
    if (owner) await releaseArenaFixture(db, owner);
    await app.close();
    await db.$disconnect();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  }
}
