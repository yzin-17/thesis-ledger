import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { arenaLiveAccountSchema } from '@thesis-ledger/schemas';
import { LiveMatchesRepository } from '../../src/model-arena/live/live-matches.repository.js';
import { scheduleImmediateObservation } from '../../src/model-arena/live/live-wakeup-schedule.js';
import { liveProtocolFixture } from './live-fixture.js';

const mocks = vi.hoisted(() => ({
  liveMatch: vi.fn(),
  liveAgents: vi.fn(),
  saveLiveAccount: vi.fn(),
  liveTimeline: vi.fn(),
  saveLiveTimeline: vi.fn(),
}));
vi.mock('../../src/model-arena/live/live-storage.js', () => ({
  liveMatch: mocks.liveMatch,
  liveAgents: mocks.liveAgents,
  saveLiveAccount: mocks.saveLiveAccount,
}));
vi.mock('../../src/model-arena/live/live-timeline.js', () => ({
  liveTimeline: mocks.liveTimeline,
  saveLiveTimeline: mocks.saveLiveTimeline,
}));

const owner = randomUUID(),
  matchId = randomUUID(),
  agentId = randomUUID();
const baseAccount = () =>
  arenaLiveAccountSchema.parse({
    revision: 1,
    cash: '10000',
    positions: [],
    cashSettlements: [],
    orders: [],
    fills: [],
    watchedSymbols: [],
    wakeups: [
      {
        id: randomUUID(),
        createdAt: '2026-11-01T00:00:00Z',
        firedAt: null,
        condition: { kind: 'price', symbol: 'AAPL.US', operator: 'gte', price: '100' },
      },
    ],
  });

function fixture() {
  const match = {
    id: matchId,
    ownerId: owner,
    state: 'paused',
    startedAt: new Date(),
    protocol: liveProtocolFixture(),
  };
  const agent = { id: agentId, state: 'waiting', reason: null, account: baseAccount() };
  const db = {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(db)),
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
  mocks.liveMatch.mockImplementation(async (_tx, _id, user) => {
    if (user && user !== owner) throw new Error('比赛不存在');
    return match;
  });
  mocks.liveAgents.mockImplementation(async () => [agent]);
  mocks.liveTimeline.mockResolvedValue(null);
  mocks.saveLiveAccount.mockImplementation(async (_tx, _id, data) => {
    agent.account = data;
  });
  return { match, agent, db, repo: new LiveMatchesRepository(db as never) };
}

describe('自主比赛手动决策与恢复', () => {
  beforeEach(() => vi.clearAllMocks());
  it('暂停恢复未发出的原预约，已出站周期保留未知并清除回放研究屏障', async () => {
    const f = fixture();
    f.match.state = 'running';
    const wakeup = f.agent.account.wakeups[0]!;
    wakeup.firedAt = '2026-11-12T16:00:00Z';
    f.db.$queryRaw.mockResolvedValueOnce([
      { requestId: null, trigger: JSON.stringify([wakeup.id]) },
      { requestId: 'controlled-request', trigger: JSON.stringify([]) },
    ]);
    mocks.liveTimeline.mockResolvedValue({
      phase: 'replay',
      status: 'research',
      cursorAt: '2026-11-12T15:59:00Z',
      pendingAt: wakeup.firedAt,
    });
    await f.repo.transition(owner, matchId, 'paused');
    expect(f.agent.account.wakeups[0]?.firedAt).toBeNull();
    expect(f.agent.account.revision).toBe(2);
    expect(
      f.db.$executeRaw.mock.calls.some((call) => call.includes('request_outcome_unknown')),
    ).toBe(true);
    expect(mocks.saveLiveTimeline).toHaveBeenCalledWith(
      f.db,
      matchId,
      expect.objectContaining({ pendingAt: null, status: 'ready', reason: null }),
    );
  });
  it('结束清空预约并保存账户，预算耗尽模型不被重置为等待', async () => {
    const f = fixture();
    f.match.state = 'running';
    f.agent.state = 'budget_exhausted';
    await f.repo.transition(owner, matchId, 'ended');
    expect(f.agent.account.wakeups).toEqual([]);
    expect(f.agent.account.revision).toBe(2);
    expect(mocks.saveLiveAccount).toHaveBeenCalledOnce();
    const statements = f.db.$executeRaw.mock.calls.map(([query]) =>
      Array.from(query as TemplateStringsArray).join(''),
    );
    expect(statements.filter((sql) => sql.includes('UPDATE "ArenaLiveAgent"'))).toEqual([]);
    expect(statements.filter((sql) => sql.includes('UPDATE "ArenaLiveMatch"'))).toHaveLength(1);
  });
  it('恢复后保留原价格事件并补一个已到期时间预约，重复点击不积累', async () => {
    const f = fixture();
    const before = f.agent.account.revision;
    await f.repo.transition(owner, matchId, 'running');
    expect(f.agent.account.revision).toBe(before + 1);
    expect(f.agent.account.wakeups.map((w) => w.condition.kind)).toEqual(['price', 'time']);
    const reserved = f.agent.account.wakeups[1]!.condition;
    expect(reserved.kind).toBe('time');
    if (reserved.kind === 'time') expect(Date.parse(reserved.at)).toBeLessThanOrEqual(Date.now());
    f.match.state = 'running';
    expect(await f.repo.trigger(owner, matchId, agentId)).toMatchObject({
      appointment: 'already_scheduled',
    });
    expect(await f.repo.trigger(owner, matchId, agentId)).toMatchObject({
      appointment: 'already_scheduled',
    });
    expect(f.agent.account.wakeups).toHaveLength(2);
    expect(mocks.saveLiveAccount).toHaveBeenCalledTimes(1);
  });
  it('手动触发只有价格预约时新增时间预约，拒绝暂停和其他所有者，已有周期只返回状态', async () => {
    const f = fixture();
    await expect(f.repo.trigger(owner, matchId, agentId)).rejects.toThrow('比赛未运行');
    f.match.state = 'running';
    await expect(f.repo.trigger(randomUUID(), matchId, agentId)).rejects.toThrow('比赛不存在');
    expect(await f.repo.trigger(owner, matchId, agentId)).toMatchObject({
      appointment: 'scheduled',
    });
    expect(f.agent.account.wakeups.map((w) => w.condition.kind)).toEqual(['price', 'time']);
    f.agent.account.wakeups = f.agent.account.wakeups.filter((w) => w.condition.kind === 'price');
    f.db.$queryRaw.mockResolvedValueOnce([{ id: randomUUID() }]);
    expect(await f.repo.trigger(owner, matchId, agentId)).toMatchObject({
      state: 'waiting',
      appointment: 'already_in_progress',
    });
    expect(f.agent.account.wakeups).toHaveLength(1);
    expect(mocks.saveLiveAccount).toHaveBeenCalledTimes(1);
  });
  it('正在研究时幂等确认而非返回 409；回放阻塞仍拒绝；恢复使用游标', async () => {
    const f = fixture();
    f.match.state = 'running';
    f.agent.state = 'researching';
    expect(await f.repo.trigger(owner, matchId, agentId)).toMatchObject({
      state: 'researching',
      appointment: 'already_in_progress',
    });
    expect(mocks.saveLiveAccount).not.toHaveBeenCalled();
    f.agent.state = 'waiting';
    f.agent.state = 'needs_attention';
    await expect(f.repo.trigger(owner, matchId, agentId)).rejects.toThrow('无法安排');
    f.agent.state = 'waiting';
    mocks.liveTimeline.mockResolvedValue({
      phase: 'replay',
      status: 'blocked',
      cursorAt: '2026-01-05T14:30:00Z',
      pendingAt: null,
    });
    await expect(f.repo.trigger(owner, matchId, agentId)).rejects.toThrow('尚未准备好');
    f.match.state = 'paused';
    mocks.liveTimeline.mockResolvedValue({
      phase: 'replay',
      status: 'ready',
      cursorAt: '2026-01-05T14:30:00Z',
      pendingAt: null,
    });
    await f.repo.transition(owner, matchId, 'running');
    expect(f.agent.account.wakeups.at(-1)?.condition).toEqual({
      kind: 'time',
      at: '2026-01-05T14:30:00Z',
    });
  });
  it('已有已到期时间预约不重复安排，但未来预约需要追加本轮观察', () => {
    const account = baseAccount(),
      at = '2026-11-13T02:00:00Z';
    expect(scheduleImmediateObservation(account, at)).toBe(true);
    expect(scheduleImmediateObservation(account, at)).toBe(false);
    const future = baseAccount();
    future.wakeups.push({
      id: randomUUID(),
      createdAt: at,
      firedAt: null,
      condition: { kind: 'time', at: '2026-11-14T02:00:00Z' },
    });
    expect(scheduleImmediateObservation(future, at)).toBe(true);
  });
});
