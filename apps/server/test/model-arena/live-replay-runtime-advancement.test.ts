import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { arenaLiveAccountSchema } from '@thesis-ledger/schemas';
import { LiveReplayRuntime } from '../../src/model-arena/live/live-replay-runtime.js';
import { liveProtocolFixture } from './live-fixture.js';

const storage = vi.hoisted(() => ({
  match: vi.fn(),
  agents: vi.fn(),
  saveAccount: vi.fn(),
  timeline: vi.fn(),
  saveTimeline: vi.fn(),
}));
vi.mock('../../src/model-arena/live/live-storage.js', () => ({
  liveMatch: storage.match,
  liveAgents: storage.agents,
  saveLiveAccount: storage.saveAccount,
}));
vi.mock('../../src/model-arena/live/live-timeline.js', () => ({
  liveTimeline: storage.timeline,
  saveLiveTimeline: storage.saveTimeline,
}));
beforeEach(() => vi.resetAllMocks());
const at = '2026-11-12T16:00:00.000Z';
function fixture() {
  const protocol = liveProtocolFixture({ endsOn: null });
  const originAt = '2026-11-12T15:59:00.000Z';
  const clock = {
    phase: 'replay',
    status: 'ready',
    originAt,
    cursorAt: originAt,
    pendingAt: null as string | null,
    reason: null,
  };
  const wakeupId = randomUUID();
  const account = arenaLiveAccountSchema.parse({
    revision: 0,
    cash: '10000',
    positions: [],
    cashSettlements: [],
    orders: [],
    fills: [],
    watchedSymbols: [],
    wakeups: [
      { id: wakeupId, condition: { kind: 'time', at }, createdAt: originAt, firedAt: null },
    ],
  });
  const agent = { id: randomUUID(), state: 'waiting', account };
  storage.match.mockResolvedValue({ id: 'match', ownerId: 'owner', state: 'running', protocol });
  storage.agents.mockResolvedValue([agent]);
  storage.timeline.mockImplementation(async () => clock);
  storage.saveTimeline.mockImplementation(async (_tx, _id, value) => {
    Object.assign(clock, value);
  });
  storage.saveAccount.mockImplementation(async (_tx, _id, value) => {
    agent.account = value;
  });
  const db = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    $transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => work(db)),
  };
  const reader = {
    next: vi.fn().mockResolvedValue(at),
    observe: vi.fn().mockResolvedValue({
      at,
      session: { state: 'open' },
      prices: new Map(),
      evidence: { controlled: true },
      observations: [],
      context: {
        at,
        tradingDate: '2026-11-12',
        fees: protocol.fees,
        maxPositionBps: 10000,
        maxActiveSymbols: 50,
        allowedSymbols: new Set(),
        quotes: [],
        newId: randomUUID,
        expiresAt: () => at,
      },
    }),
  };
  const matches = { transition: vi.fn() };
  return {
    runtime: new LiveReplayRuntime(db as never, reader, matches),
    db,
    reader,
    matches,
    clock,
    account,
    agent,
    wakeupId,
    protocol,
  };
}

it('推进到预约时点后逐账户保存并停在研究屏障，不越过待研究时点', async () => {
  const f = fixture();
  await f.runtime.reconcile('match', new Date('2026-11-12T16:02:00Z'));
  expect(f.reader.observe).toHaveBeenCalledOnce();
  expect(f.reader.next).toHaveBeenCalledOnce();
  expect(f.clock).toMatchObject({
    cursorAt: '2026-11-12T15:59:00.000Z',
    pendingAt: at,
    status: 'research',
  });
  expect(f.agent.account.wakeups).toEqual([
    {
      id: f.wakeupId,
      condition: { kind: 'time', at },
      createdAt: '2026-11-12T15:59:00.000Z',
      firedAt: at,
    },
  ]);
  expect(storage.saveAccount).toHaveBeenCalledOnce();
  const statements = f.db.$executeRaw.mock.calls.map(([query]) =>
    Array.from(query as TemplateStringsArray).join(''),
  );
  expect(statements.filter((sql) => sql.includes('INSERT INTO "ArenaLiveCycle"'))).toHaveLength(1);
  expect(statements.filter((sql) => sql.includes('INSERT INTO "ArenaLiveValuation"'))).toHaveLength(
    2,
  );
  expect(f.matches.transition).not.toHaveBeenCalled();
});

it('跨过市场时区的最后一天后结束，既有截止日期不被推进器延长', async () => {
  const f = fixture();
  f.protocol.endsOn = '2026-11-12';
  f.clock.cursorAt = '2026-11-13T05:00:00.000Z';
  await f.runtime.reconcile('match', new Date('2026-11-14T00:00:00Z'));
  expect(f.matches.transition).toHaveBeenCalledWith('owner', 'match', 'ended');
  expect(f.reader.next).not.toHaveBeenCalled();
  expect(f.reader.observe).not.toHaveBeenCalled();
});
