import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { arenaLiveAccountSchema } from '@thesis-ledger/schemas';
import { LiveAppointments } from '../../src/model-arena/live/live-appointments.js';
import { liveProtocolFixture } from './live-fixture.js';

const mocks = vi.hoisted(() => ({
  liveMatch: vi.fn(),
  liveAgents: vi.fn(),
  liveTimeline: vi.fn(),
  saveLiveAccount: vi.fn(),
}));
vi.mock('../../src/model-arena/live/live-storage.js', () => ({
  liveMatch: mocks.liveMatch,
  liveAgents: mocks.liveAgents,
  saveLiveAccount: mocks.saveLiveAccount,
  liveActiveMatches: vi.fn(),
}));
vi.mock('../../src/model-arena/live/live-timeline.js', () => ({
  liveTimeline: mocks.liveTimeline,
}));

const now = new Date('2026-11-13T13:00:00Z'); // 美东 08:00，常规交易尚未开盘
const before = '2026-11-13T12:00:00Z';
const timeWakeup = () => ({
  id: randomUUID(),
  condition: { kind: 'time' as const, at: before },
  createdAt: before,
  firedAt: null,
});
const priceWakeup = () => ({
  id: randomUUID(),
  condition: { kind: 'price' as const, symbol: 'AAPL.US', operator: 'gte' as const, price: '100' },
  createdAt: before,
  firedAt: null,
});

function fixture(state: 'open' | 'closed' | 'unknown', startsOn: string | null = null) {
  const protocol = liveProtocolFixture({ startsOn, endsOn: null });
  const match = { id: randomUUID(), state: 'running', protocol };
  const agent = {
    id: randomUUID(),
    state: 'waiting',
    account: arenaLiveAccountSchema.parse({
      revision: 0,
      cash: '10000',
      positions: [],
      cashSettlements: [],
      orders: [],
      fills: [],
      watchedSymbols: [],
      wakeups: [timeWakeup()],
    }),
  };
  const session =
    state === 'unknown'
      ? { state, reason: 'calendar_unavailable', sessions: [] }
      : {
          state,
          date: '2026-11-13',
          sessions: [
            {
              tradingDate: '2026-11-13',
              startAt: '2026-11-13T12:00:00Z',
              endAt: '2026-11-13T21:00:00Z',
            },
          ],
        };
  const market = {
    getSession: vi.fn().mockResolvedValue(session),
    getQuote: vi.fn().mockResolvedValue({
      symbol: 'AAPL.US',
      price: 200,
      stale: false,
      freshness: 'live',
      marketTime: '2026-11-13T12:59:50Z',
      fetchedAt: '2026-11-13T12:59:55Z',
      units: { priceCurrency: 'USD' },
    }),
  };
  const db = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    instrument: { findFirst: vi.fn().mockResolvedValue({ instrumentType: 'STOCK' }) },
  };
  mocks.liveMatch.mockResolvedValue(match);
  mocks.liveAgents.mockImplementation(async () => [agent]);
  mocks.liveTimeline.mockResolvedValue(null);
  mocks.saveLiveAccount.mockImplementation(async (_tx, _id, raw) => {
    agent.account = raw;
  });
  const scheduler = new LiveAppointments(db as never, market as never);
  return { scheduler, agent, market, match, db };
}

describe('自主竞技场盘前研究预约', () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(['closed', 'unknown'] as const)(
    '%s 会话仍触发到期时间研究，不读盘口行情',
    async (state) => {
      const f = fixture(state);
      expect(await f.scheduler.admit(f.match.id, now)).toHaveLength(1);
      expect(f.agent.account.wakeups[0]?.firedAt).toBe(now.toISOString());
      expect(f.market.getQuote).not.toHaveBeenCalled();
      expect(await f.scheduler.admit(f.match.id, now)).toEqual([]);
    },
  );

  it('休市时仅价格触发不产生研究，不能用陈旧行情唤醒', async () => {
    const f = fixture('closed');
    f.agent.account.wakeups = [priceWakeup()];
    expect(await f.scheduler.admit(f.match.id, now)).toEqual([]);
    expect(f.market.getQuote).not.toHaveBeenCalled();
    expect(f.db.instrument.findFirst).not.toHaveBeenCalled();
    expect(f.agent.account.wakeups[0]?.firedAt).toBeNull();
  });

  it('开市且报价属于真实交易会话时，价格事件可以唤醒', async () => {
    const f = fixture('open');
    f.agent.account.wakeups = [priceWakeup()];
    expect(await f.scheduler.admit(f.match.id, now)).toHaveLength(1);
    expect(f.market.getQuote).toHaveBeenCalledOnce();
    expect(f.agent.account.wakeups[0]?.firedAt).toBe(now.toISOString());
  });

  it('比赛尚未开始或已暂停时不能被盘前预约唤醒', async () => {
    const future = fixture('closed', '2026-11-14');
    expect(await future.scheduler.admit(future.match.id, now)).toEqual([]);
    expect(future.market.getSession).not.toHaveBeenCalled();
    const paused = fixture('closed');
    paused.match.state = 'paused';
    expect(await paused.scheduler.admit(paused.match.id, now)).toEqual([]);
    expect(paused.agent.account.wakeups[0]?.firedAt).toBeNull();
  });
  it.each(['2026-11-13T12:58:00Z', '2026-11-13T13:00:01Z'])(
    '过期或晚于截点的报价不能唤醒价格事件：%s',
    async (marketTime) => {
      const f = fixture('open');
      f.agent.account.wakeups = [priceWakeup()];
      const quote = await f.market.getQuote();
      f.market.getQuote.mockClear();
      f.market.getQuote.mockResolvedValue({ ...quote, marketTime });
      expect(await f.scheduler.admit(f.match.id, now)).toEqual([]);
      expect(f.market.getQuote).toHaveBeenCalledOnce();
      expect(f.agent.account.wakeups[0]?.firedAt).toBeNull();
      expect(mocks.saveLiveAccount).not.toHaveBeenCalled();
    },
  );
  it('读取报价后会话已关闭时，价格条件不能沿用旧会话', async () => {
    const f = fixture('open');
    f.agent.account.wakeups = [priceWakeup()];
    const session = await f.market.getSession();
    f.market.getSession.mockClear();
    f.market.getSession
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce({ ...session, state: 'closed' });
    expect(await f.scheduler.admit(f.match.id, now)).toEqual([]);
    expect(f.market.getSession).toHaveBeenCalledTimes(2);
    expect(f.agent.account.wakeups[0]?.firedAt).toBeNull();
    expect(mocks.saveLiveAccount).not.toHaveBeenCalled();
  });
});
