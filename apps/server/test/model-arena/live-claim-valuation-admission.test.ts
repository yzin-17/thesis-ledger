import { beforeEach, expect, it, vi } from 'vitest';
import { arenaLiveAccountSchema } from '@thesis-ledger/schemas';
import { LiveCyclesRepository } from '../../src/model-arena/live/live-cycles.repository.js';
import { LiveValuations } from '../../src/model-arena/live/live-valuations.js';
import { liveProtocolFixture } from './live-fixture.js';

const storage = vi.hoisted(() => ({ match: vi.fn(), agents: vi.fn(), timeline: vi.fn() }));
vi.mock('../../src/model-arena/live/live-storage.js', () => ({
  liveMatch: storage.match,
  liveAgents: storage.agents,
}));
vi.mock('../../src/model-arena/live/live-timeline.js', () => ({ liveTimeline: storage.timeline }));
beforeEach(() => vi.resetAllMocks());
const at = '2026-11-12T16:00:00.000Z';
const emptyAccount = () =>
  arenaLiveAccountSchema.parse({
    revision: 0,
    cash: '10000',
    positions: [],
    cashSettlements: [],
    orders: [],
    wakeups: [],
    watchedSymbols: [],
    fills: [],
  });

it.each([
  [{ phase: 'replay', status: 'research', pendingAt: at }, at, true],
  [{ phase: 'replay', status: 'valuation', pendingAt: at }, at, false],
  [{ phase: 'replay', status: 'research', pendingAt: at }, 'wrong-clock', false],
  [null, at, false],
] as const)('领取必须保持回放阶段与时钟绑定：%j', async (clock, replayAt, accepted) => {
  const cycle = {
    id: 'cycle',
    matchId: 'match',
    agentId: 'agent',
    state: 'pending',
    attempt: 0,
    requestId: null,
  };
  storage.match.mockResolvedValue({
    id: 'match',
    state: 'running',
    protocol: liveProtocolFixture(),
  });
  storage.timeline.mockResolvedValue(clock);
  storage.agents.mockResolvedValue([{ id: 'agent', account: emptyAccount() }]);
  const tx = { $queryRaw: vi.fn().mockResolvedValue([cycle]), $executeRaw: vi.fn() };
  const db = {
    $queryRaw: vi.fn().mockResolvedValue([cycle]),
    $transaction: vi.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)),
  };
  const result = await new LiveCyclesRepository(db as never).claim(
    'cycle',
    1,
    new Date(at),
    undefined,
    replayAt,
  );
  if (accepted) {
    expect(result).toMatchObject({
      state: 'running',
      attempt: 1,
      input: { asOf: at, replay: true },
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  } else {
    expect(result).toBeNull();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  }
});

it.each([false, true])(
  '估值基准恢复 %s 时保持已有账户，否则仅在开放会话初始化',
  async (restored) => {
    const protocol = liveProtocolFixture({
      universe: 'fixed',
      instruments: [
        {
          instrumentId: '11111111-1111-4111-8111-111111111111',
          symbol: 'AAPL.US',
          assetType: 'STOCK',
        },
      ],
      benchmarks: ['equal_weight_buy_hold'],
    });
    storage.timeline.mockResolvedValue(null);
    storage.match.mockResolvedValue({
      id: 'match',
      state: 'running',
      startedAt: new Date(at),
      protocol,
    });
    storage.agents.mockResolvedValue([]);
    const benchmark = { ...emptyAccount(), cash: '9000' };
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]), $executeRaw: vi.fn() };
    const db = {
      $queryRaw: vi.fn().mockResolvedValue(
        restored
          ? [
              {
                evidence: { benchmarkAccount: benchmark },
                frame: {
                  at: '2026-11-12T15:00:00Z',
                  marketTime: null,
                  complete: true,
                  reason: null,
                  marks: [],
                  benchmarks: [],
                },
              },
            ]
          : [],
      ),
      instrument: { findMany: vi.fn() },
      $transaction: vi.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)),
    };
    const execution = {
      build: vi
        .fn()
        .mockResolvedValue({ session: { state: 'closed' }, context: { quotes: [], at } }),
    };
    const reader = {
      read: vi.fn().mockResolvedValue({
        at: new Date(at),
        marketTime: null,
        prices: new Map(),
        session: {},
        evidence: {},
        missing: {},
      }),
    };
    const frame = await new LiveValuations(db as never, reader, execution).capture('match');
    expect(frame).toMatchObject({
      complete: restored,
      benchmarks: [{ id: 'equal_weight_buy_hold', nav: restored ? '9000' : null }],
    });
    expect(execution.build).toHaveBeenCalledTimes(restored ? 0 : 1);
    expect(db.instrument.findMany).not.toHaveBeenCalled();
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
  },
);
