import { expect, it, vi } from 'vitest';
import { LiveRuntime } from '../../src/model-arena/live/live-runtime.js';
import { liveProtocolFixture } from './live-fixture.js';
import { LiveExecutionContext } from '../../src/model-arena/live/live-execution-context.js';
import { MarketArenaValuationReader } from '../../src/market/market-arena-valuation-reader.js';

function fixture(dates: { startsOn: string | null; endsOn: string | null }, day = '2040-01-02', state = 'open') {
  const row = { id: 'match', ownerId: 'owner', state: 'running', createdAt: new Date(), protocol: liveProtocolFixture(dates) };
  const db = { $queryRaw: vi.fn().mockImplementation(async (query: TemplateStringsArray | { strings: string[] }) => {
    const sql = 'strings' in query ? query.strings.join('') : query.join('');
    if (sql.includes('ArenaLiveTimeline')) return [];
    return [row];
  }) };
  const cycle = { id: 'cycle', matchId: 'match', attempt: 0 };
  const cycles = { recover: vi.fn(), pending: vi.fn().mockResolvedValue([cycle]), claim: vi.fn().mockResolvedValue(true) };
  const market = { getSession: vi.fn().mockResolvedValue({ state, date: day, latestCompletedTradingDate: day,
    sessions: [{ startAt: new Date(Date.now() - 3600000).toISOString(), endAt: new Date(Date.now() + 3600000).toISOString() }] }) };
  const appointments = { admit: vi.fn() }, orders = { expire: vi.fn(), match: vi.fn() }, research = { execute: vi.fn() };
  const valuations = { gap: vi.fn(), capture: vi.fn() }, matches = { transition: vi.fn() }, queue = { ensure: vi.fn().mockResolvedValue('pending') };
  const runtime = new LiveRuntime(db as never, {} as never, market as never, appointments as never, cycles as never, orders as never, research as never, valuations as never, matches as never);
  Reflect.set(runtime, 'queue', queue);
  return { runtime, db, row, cycle, cycles, orders, research, valuations, appointments, matches, queue };
}
it('没有截止日期时跨年继续观察、撮合和投递，不自动结束', async () => {
  const f = fixture({ startsOn: null, endsOn: null });
  await f.runtime.reconcile();
  expect(f.orders.match).toHaveBeenCalledWith('match'); expect(f.appointments.admit).toHaveBeenCalledWith('match');
  expect(f.valuations.capture).toHaveBeenCalledWith('match'); expect(f.queue.ensure).toHaveBeenCalledOnce();
  expect(f.matches.transition).not.toHaveBeenCalled();
  f.db.$queryRaw.mockResolvedValueOnce([f.cycle]).mockResolvedValueOnce([f.row]);
  await f.runtime.execute({ id: 'cycle', attempt: 1 }); expect(f.research.execute).toHaveBeenCalledWith('cycle', 1);
});
it('填写截止日期时仍自动结束，未来开始日期不撮合或投递', async () => {
  const ended = fixture({ startsOn: null, endsOn: '2030-12-31' }); await ended.runtime.reconcile();
  expect(ended.matches.transition).toHaveBeenCalledWith('owner', 'match', 'ended'); expect(ended.orders.match).not.toHaveBeenCalled();
  const future = fixture({ startsOn: '2041-01-01', endsOn: null }); await future.runtime.reconcile();
  expect(future.orders.match).not.toHaveBeenCalled(); expect(future.queue.ensure).not.toHaveBeenCalled();
});
it.each(['closed', 'unknown'])('不限期市场 %s 不撮合，但仍安排研究任务投递', async (state) => {
  const f = fixture({ startsOn: null, endsOn: null }, '2040-01-02', state); await f.runtime.reconcile();
  expect(f.orders.match).not.toHaveBeenCalled();
  expect(f.appointments.admit).toHaveBeenCalledWith('match');
  expect(f.queue.ensure).toHaveBeenCalledOnce();
  expect(f.matches.transition).not.toHaveBeenCalled();
  f.db.$queryRaw.mockResolvedValueOnce([f.cycle]).mockResolvedValueOnce([f.row]);
  await f.runtime.execute({ id: 'cycle', attempt: 1 });
  expect(f.cycles.claim).toHaveBeenCalledOnce();
  expect(f.research.execute).toHaveBeenCalledWith('cycle', 1);
  expect(f.cycles.claim.mock.calls[0]?.[3]).toBeUndefined();
});
it('不限期不延长委托寿命，市价仍限当前会话，指定到期日缺日历仍拒绝', async () => {
  const close = new Date(Date.now() + 3600000).toISOString();
  const session = { state: 'open', date: '2040-01-02', sessions: [{ startAt: new Date(Date.now() - 3600000).toISOString(), endAt: close }] };
  const execution = new LiveExecutionContext({ instrument: { findMany: vi.fn() } } as never, { getSession: vi.fn().mockResolvedValue(session) } as never, {} as never);
  const p = liveProtocolFixture({ startsOn: null, endsOn: null });
  const { context } = await execution.build(p, []);
  expect(context.expiresAt(null, 'market')).toBe(close);
  expect(() => context.expiresAt('2041-01-01', 'limit')).toThrow('expiry_calendar_unavailable');
  const bounded = await execution.build({ ...p, endsOn: '2040-01-03' }, []);
  expect(() => bounded.context.expiresAt('2041-01-01', 'limit')).toThrow('expiry_outside_season');
});
it('不限期估值跨年仍读取正式会话，未来开始前不生成估值', async () => {
  const market = { getSession: vi.fn().mockResolvedValue({ state: 'closed', date: '2040-01-02', latestTradingDate: '2040-01-01' }) };
  const reader = new MarketArenaValuationReader(market as never, {} as never);
  const p = liveProtocolFixture({ startsOn: null, endsOn: null });
  expect(await reader.read(p, [])).toMatchObject({ prices: new Map(), session: { date: '2040-01-02' } });
  expect(await reader.read({ ...p, startsOn: '2041-01-01' }, [])).toBeNull();
});
