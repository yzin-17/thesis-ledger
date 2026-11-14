import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LiveRuntime } from '../../src/model-arena/live/live-runtime.js';
import { liveProtocolFixture } from './live-fixture.js';

const storage = vi.hoisted(() => ({ match: vi.fn(), timeline: vi.fn() }));
vi.mock('../../src/model-arena/live/live-storage.js', () => ({
  liveMatch: storage.match,
  liveActiveMatches: async function* () {
    /* 本样本仅覆盖待投递与领取 */
  },
}));
vi.mock('../../src/model-arena/live/live-timeline.js', () => ({ liveTimeline: storage.timeline }));
const at = '2026-11-12T16:00:00.000Z';
const pending = { id: 'controlled-cycle', matchId: 'controlled-match', attempt: 0 };
function fixture(clock: unknown, state: 'open' | 'closed' | 'unknown' = 'open') {
  storage.match.mockResolvedValue({
    protocol: liveProtocolFixture({ startsOn: null, endsOn: null }),
  });
  storage.timeline.mockResolvedValue(clock);
  const cycles = {
    recover: vi.fn(),
    pending: vi.fn().mockResolvedValue([pending]),
    claim: vi.fn().mockResolvedValue(true),
    deliveryFailed: vi.fn(),
  };
  const market = {
    getSession: vi
      .fn()
      .mockResolvedValue({
        state,
        date: '2026-11-12',
        sessions: [{ startAt: '2026-11-12T14:30:00Z', endAt: '2026-11-12T21:00:00Z' }],
      }),
  };
  const queue = { ensure: vi.fn().mockResolvedValue('pending') };
  const research = { execute: vi.fn() };
  const db = { $queryRaw: vi.fn().mockResolvedValue([pending]) };
  const runtime = new LiveRuntime(
    db as never,
    {} as never,
    market,
    {} as never,
    cycles as never,
    {} as never,
    research as never,
    {} as never,
    {} as never,
  );
  Reflect.set(runtime, 'queue', queue);
  return { runtime, queue, cycles, market, research };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(at);
});
afterEach(() => vi.useRealTimers());

it('回放只在研究阶段的开放会话投递，并按原时钟／attempt 领取', async () => {
  const f = fixture({ phase: 'replay', status: 'research', pendingAt: at });
  await f.runtime.reconcile();
  expect(f.queue.ensure).toHaveBeenCalledWith(pending, 1);
  await f.runtime.execute({ id: pending.id, attempt: 1 });
  expect(f.cycles.claim).toHaveBeenCalledWith(
    pending.id,
    1,
    new Date(at),
    new Date('2026-11-12T21:00:00Z'),
    at,
    { state: 'open', date: '2026-11-12', reason: null },
  );
  expect(f.research.execute).toHaveBeenCalledWith(pending.id, 1);
});

it.each([
  { phase: 'replay', status: 'valuation', pendingAt: at },
  { phase: 'replay', status: 'research', pendingAt: null },
])('回放屏障不满足时不投递、不领取：%j', async (clock) => {
  const f = fixture(clock);
  await f.runtime.reconcile();
  await f.runtime.execute({ id: pending.id, attempt: 1 });
  expect(f.queue.ensure).not.toHaveBeenCalled();
  expect(f.cycles.claim).not.toHaveBeenCalled();
  expect(f.research.execute).not.toHaveBeenCalled();
});

it.each(['closed', 'unknown'] as const)('回放会话 %s 仍不放行研究', async (state) => {
  const f = fixture({ phase: 'replay', status: 'research', pendingAt: at }, state);
  await f.runtime.reconcile();
  await f.runtime.execute({ id: pending.id, attempt: 1 });
  expect(f.queue.ensure).not.toHaveBeenCalled();
  expect(f.cycles.claim).not.toHaveBeenCalled();
});

it('确认投递终态才记投递失败，查询故障保持异常且不冒充终态', async () => {
  const f = fixture(null);
  f.queue.ensure.mockResolvedValueOnce('terminal');
  await f.runtime.reconcile();
  expect(f.cycles.deliveryFailed).toHaveBeenCalledWith(pending.id, 1);
  f.cycles.deliveryFailed.mockClear();
  f.queue.ensure.mockRejectedValueOnce(new Error('controlled-queue-failure'));
  await expect(f.runtime.reconcile()).rejects.toThrow('controlled-queue-failure');
  expect(f.cycles.deliveryFailed).not.toHaveBeenCalled();
});
