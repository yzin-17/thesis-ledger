import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { arenaLiveAccountSchema } from '@thesis-ledger/schemas';
import { LiveOrdersRepository } from '../../src/model-arena/live/live-orders.repository.js';
import { liveProtocolFixture } from './live-fixture.js';

const mocks = vi.hoisted(() => ({
  liveMatch: vi.fn(), liveAgents: vi.fn(), saveLiveAccount: vi.fn(), liveTimeline: vi.fn(),
}));
vi.mock('../../src/model-arena/live/live-storage.js', () => ({
  liveMatch: mocks.liveMatch, liveAgents: mocks.liveAgents, saveLiveAccount: mocks.saveLiveAccount,
}));
vi.mock('../../src/model-arena/live/live-timeline.js', () => ({
  liveTimeline: mocks.liveTimeline,
}));

function fixture(state: 'open' | 'closed' | 'unknown') {
  const at = new Date(), next = new Date(at.getTime() + 60 * 60 * 1000).toISOString();
  const account = arenaLiveAccountSchema.parse({
    revision: 0, cash: '10000', positions: [], cashSettlements: [], orders: [],
    wakeups: [], fills: [], watchedSymbols: [],
  });
  const match = { id: randomUUID(), state: 'running', protocol: liveProtocolFixture({ endsOn: null }) };
  const agent = { id: randomUUID(), account };
  const cycle = { id: randomUUID(), state: 'running', attempt: 1, bookRevision: 0, agentId: agent.id,
    requestId: randomUUID(), leaseUntil: new Date(at.getTime() + 120000),
    deadlineAt: new Date(at.getTime() + 120000), input: { asOf: at.toISOString(), replay: false },
  };
  const db = {
    $queryRaw: vi.fn().mockImplementation(async () => [cycle]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
  };
  const execution = { build: vi.fn().mockResolvedValue({
    session: { state, date: state === 'unknown' ? null : '2026-11-13',
      sessions: state === 'open' ? [{ startAt: new Date(at.getTime() - 1000).toISOString(),
        endAt: new Date(at.getTime() + 60000).toISOString() }] : [] },
    context: { at: at.toISOString(), tradingDate: '2026-11-13',
      maxPositionBps: 10000, maxActiveSymbols: 50,
      fees: { buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 },
      allowedSymbols: new Set(['AAPL.US']), quotes: [],
      expiresAt: () => next, newId: randomUUID },
  }) };
  mocks.liveMatch.mockResolvedValue(match);
  mocks.liveAgents.mockImplementation(async () => [agent]);
  mocks.saveLiveAccount.mockImplementation(async (_tx, _id, value) => { agent.account = value; });
  mocks.liveTimeline.mockResolvedValue(null);
  const orders = new LiveOrdersRepository(db as never, execution as never);
  const decision = { summary: '盘前观察市场', orders: [], cancelOrderIds: [],
    wakeups: [{ kind: 'time', at: next }], watchedSymbols: [] };
  return { match, agent, cycle, db, orders, decision, next };
}

describe('盘前研究与模拟委托的独立门禁', () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(['closed', 'unknown'] as const)('%s 市场允许观望研究结果与未来预约持久化', async (state) => {
    const f = fixture(state);
    const result = await f.orders.submit(f.cycle.id, 1, f.decision);
    expect(result.orders).toHaveLength(0);
    expect(result.wakeups).toHaveLength(1);
    expect(result.wakeups[0]?.condition).toEqual({ kind: 'time', at: f.next });
    expect(f.db.$executeRaw).toHaveBeenCalledTimes(2); // 保存周期结果和模型等待状态
    expect(f.agent.account.revision).toBe(1);
  });

  it.each(['closed', 'unknown'] as const)('%s 市场拒绝新委托，不更新账户和决策', async (state) => {
    const f = fixture(state);
    await expect(f.orders.submit(f.cycle.id, 1, {
      ...f.decision,
      orders: [{ clientId: 'buy', symbol: 'AAPL.US', side: 'buy', kind: 'market',
        quantity: '1', price: null, expiresOn: null, exitGroup: null }],
    })).rejects.toThrow('market_closed');
    expect(f.agent.account.revision).toBe(0);
    expect(f.db.$executeRaw).not.toHaveBeenCalled();
  });

  it('开市也不能绕过合格交易行情提交新委托', async () => {
    const f = fixture('open');
    await expect(f.orders.submit(f.cycle.id, 1, {
      ...f.decision,
      orders: [{ clientId: 'buy', symbol: 'AAPL.US', side: 'buy', kind: 'market',
        quantity: '1', price: null, expiresOn: null, exitGroup: null }],
    })).rejects.toThrow('execution_evidence_missing');
    expect(f.db.$executeRaw).not.toHaveBeenCalled();
  });

  it('比赛暂停后不能保存盘前研究决策', async () => {
    const f = fixture('closed');
    f.match.state = 'paused';
    await expect(f.orders.submit(f.cycle.id, 1, f.decision)).rejects.toThrow('cycle_not_active');
    expect(f.db.$executeRaw).not.toHaveBeenCalled();
  });
});
