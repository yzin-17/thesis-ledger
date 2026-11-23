import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { arenaLiveAccountSchema } from '@thesis-ledger/schemas';
import { LiveResearchBudget } from '../../src/model-arena/live/live-research-budget.js';

const mocks = vi.hoisted(() => ({
  liveMatch: vi.fn(),
  liveAgents: vi.fn(),
  saveLiveAccount: vi.fn(),
  liveTimeline: vi.fn(),
}));
vi.mock('../../src/model-arena/live/live-storage.js', () => ({
  liveMatch: mocks.liveMatch,
  liveAgents: mocks.liveAgents,
  saveLiveAccount: mocks.saveLiveAccount,
  liveRemaining: (budget: unknown) => budget,
}));
vi.mock('../../src/model-arena/live/live-timeline.js', () => ({
  liveTimeline: mocks.liveTimeline,
}));

const budget = () => ({ requests: 10, tokens: 10000, costMicros: 1000 });
const account = () =>
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
        condition: { kind: 'time', at: '2026-11-12T08:00:00Z' },
        createdAt: '2026-11-12T07:00:00Z',
        firedAt: '2026-11-12T08:00:00Z',
      },
      {
        id: randomUUID(),
        condition: { kind: 'price', symbol: 'AAPL.US', operator: 'gte', price: '350' },
        createdAt: '2026-11-12T07:00:00Z',
        firedAt: null,
      },
    ],
  });

function fixture({
  source = 'schema_invalid',
  previous = null,
  state = 'running',
  replay = false,
  requests = 10,
}: {
  source?: string;
  previous?: { state: string; reason: string | null } | null;
  state?: 'running' | 'paused';
  replay?: boolean;
  requests?: number;
} = {}) {
  const future = new Date(Date.now() + 24 * 3600000).toISOString();
  const invalidModelDecision = JSON.stringify({
    action: 'decision',
    decision: {
      orders: [{ kind: 'limit', side: 'buy', exitGroup: 'AAPL-01' }],
      wakeups: [
        { kind: 'time', at: future },
        { kind: 'price', symbol: 'AAPL.US', operator: 'lte', price: '300' },
      ],
    },
  });
  const audit = {
    calls: [
      {
        state: 'settled',
        error: { code: source },
        diagnostics: { outputText: invalidModelDecision },
      },
    ],
  };
  const cycle: {
    id: string;
    agentId: string;
    matchId: string;
    state: string;
    attempt: number;
    reason: string | null;
    requestAudit: unknown;
  } = {
    id: randomUUID(),
    agentId: randomUUID(),
    matchId: randomUUID(),
    state: 'running',
    attempt: 1,
    reason: null,
    requestAudit: audit,
  };
  const match = { id: cycle.matchId, state, remaining: budget() };
  const agent: {
    id: string;
    state: string;
    reason: string | null;
    account: unknown;
    remaining: ReturnType<typeof budget>;
  } = {
    id: cycle.agentId,
    state: 'researching',
    reason: null,
    account: account(),
    remaining: { ...budget(), requests },
  };
  const db = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
    $queryRaw: vi.fn(async (query: TemplateStringsArray) => {
      const sql = query.join('');
      if (sql.includes('ORDER BY "createdAt" DESC LIMIT 1')) return previous ? [previous] : [];
      return [cycle];
    }),
    $executeRaw: vi.fn(async (query: TemplateStringsArray, ...params: unknown[]) => {
      const sql = query.join('');
      if (sql.includes('UPDATE "ArenaLiveCycle" SET state=')) {
        cycle.state = String(params[0]);
        cycle.reason = String(params[1]);
        cycle.requestAudit = JSON.parse(String(params[2]));
      }
      if (sql.includes('UPDATE "ArenaLiveAgent" SET state=')) {
        agent.state = String(params[0]);
        agent.reason = String(params[1]);
      }
      return 1;
    }),
  };
  mocks.liveMatch.mockResolvedValue(match);
  mocks.liveAgents.mockResolvedValue([agent]);
  mocks.liveTimeline.mockResolvedValue(replay ? { phase: 'replay' } : null);
  mocks.saveLiveAccount.mockImplementation(async (_tx, _id, next: unknown) => {
    agent.account = next;
  });
  return { cycle, agent, match, db, future, manager: new LiveResearchBudget(db as never) };
}

describe('自主研究失败周期与观察预约原子收敛', () => {
  beforeEach(() => vi.resetAllMocks());
  it('订单不合规时仍保留独立有效的下一时间预约，旧周期失败、账户订单不变', async () => {
    const f = fixture();
    await f.manager.fail(f.cycle.id, 1, 'model_output_invalid');
    const saved = arenaLiveAccountSchema.parse(f.agent.account);
    expect(f.cycle.state).toBe('failed');
    expect(f.agent.state).toBe('waiting');
    expect(saved.orders).toEqual([]);
    expect(saved.wakeups).toHaveLength(3);
    expect(saved.wakeups[2]?.condition).toEqual({ kind: 'time', at: f.future });
    expect(saved.revision).toBe(2);
    expect(f.cycle.requestAudit).toMatchObject({
      failure: { recovery: { source: 'model', at: f.future } },
    });
    expect(mocks.saveLiveAccount).toHaveBeenCalledOnce();
  });
  it('模型输出截断后停止，不自动创建延迟观察或恢复既有预约', async () => {
    const f = fixture({ source: 'output_truncated' });
    const original = structuredClone(f.agent.account);
    await f.manager.fail(f.cycle.id, 1, 'model_output_invalid');
    expect(f.agent.account).toEqual(original);
    expect(f.agent.state).toBe('needs_attention');
    expect(mocks.saveLiveAccount).not.toHaveBeenCalled();
  });
  it('连续第二次输出无效停止自动续接，要求用户手动恢复', async () => {
    const f = fixture({ previous: { state: 'failed', reason: 'model_output_invalid' } });
    await f.manager.fail(f.cycle.id, 1, 'model_output_invalid');
    expect(f.agent.state).toBe('needs_attention');
    expect(mocks.saveLiveAccount).not.toHaveBeenCalled();
    expect(f.cycle.requestAudit).toMatchObject({
      failure: { recoveryStopped: 'repeated_invalid_output' },
    });
  });
  it('存在待触发时间预约时不重复创建', async () => {
    const f = fixture();
    const saved = arenaLiveAccountSchema.parse(f.agent.account);
    saved.wakeups.push({
      id: randomUUID(),
      condition: { kind: 'time', at: f.future },
      createdAt: new Date().toISOString(),
      firedAt: null,
    });
    f.agent.account = saved;
    await f.manager.fail(f.cycle.id, 1, 'model_output_invalid');
    expect(f.agent.state).toBe('waiting');
    expect(mocks.saveLiveAccount).not.toHaveBeenCalled();
    expect(arenaLiveAccountSchema.parse(f.agent.account).wakeups).toHaveLength(3);
  });
  it.each([{ state: 'paused' as const }, { replay: true }, { requests: 0 }])(
    '暂停、历史回放或额度不足时不追加恢复预约：%j',
    async (options) => {
      const f = fixture(options);
      await f.manager.fail(f.cycle.id, 1, 'model_output_invalid');
      expect(f.agent.state).toBe('needs_attention');
      expect(mocks.saveLiveAccount).not.toHaveBeenCalled();
    },
  );
  it('未知用量仍需要人工确认，不静默发起下一次调用', async () => {
    const f = fixture();
    await f.manager.fail(f.cycle.id, 1, 'unknown_usage');
    expect(f.cycle.state).toBe('unknown_usage');
    expect(f.agent.state).toBe('needs_attention');
    expect(mocks.saveLiveAccount).not.toHaveBeenCalled();
  });
});
