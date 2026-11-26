import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { arenaLiveAccountSchema } from '@thesis-ledger/schemas';
import type { ArenaPaperContext } from '@thesis-ledger/domain';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { LiveMatchesRepository } from '../../src/model-arena/live/live-matches.repository.js';
import { LiveOrdersRepository } from '../../src/model-arena/live/live-orders.repository.js';
import { liveAgents } from '../../src/model-arena/live/live-storage.js';
import { liveProtocolFixture } from './live-fixture.js';

const url = process.env.AI_PROVIDER_DATABASE_URL;
if (url && (new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/ai_provider_concurrency_fixture')) throw new Error('需要隔离数据库');
const db = new PrismaService({ datasourceUrl: url ?? 'postgresql://fixture@127.0.0.1:1/unused' });
const matches = new LiveMatchesRepository(db);
const ids: string[] = [];
let quoteAt = new Date(Date.now() - 1000).toISOString();
let sampleAt = new Date().toISOString();
let price = '10';
const execution = { build: vi.fn(async () => ({
  session: { state: 'open' as const, tradingDayState: 'open' as const, date: '2026-11-12', evaluatedAt: sampleAt, sessions: [{ tradingDate: '2026-11-12', startAt: '2026-01-01T00:00:00Z', endAt: '2031-01-01T00:00:00Z' }] },
  missing: {}, context: { at: sampleAt, tradingDate: '2026-11-12', maxPositionBps: 10000, maxActiveSymbols: 50,
    fees: { buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 }, allowedSymbols: new Set(['AAPL.US']),
    quotes: [{ symbol: 'AAPL.US', price, marketTime: quoteAt, observedAt: sampleAt, sourceRef: 'controlled', evidence: { source: 'controlled' },
      tradingDate: '2026-11-12', positionAvailableOn: '2026-11-12', cashAvailableOn: '2026-11-12', lot: '1', tick: '0.01',
      buyBlocked: null, sellBlocked: null, statutoryBuyFee: () => '0', statutorySellFee: () => '0' }],
    expiresAt: () => '2030-12-31T20:00:00Z', newId: randomUUID,
  } satisfies ArenaPaperContext,
})) };
const orders = new LiveOrdersRepository(db, execution);
async function create() {
  const owner = randomUUID();
  const match = await matches.create(owner, liveProtocolFixture()); ids.push(match.id);
  await matches.transition(owner, match.id, 'running');
  const [agent] = await liveAgents(db, match.id);
  price = '10'; sampleAt = new Date().toISOString(); quoteAt = new Date(Date.now() - 1000).toISOString();
  return { owner, matchId: match.id, agentId: agent!.id };
}
async function cycle(matchId: string, agentId: string) {
  const agent = (await liveAgents(db, matchId)).find((a) => a.id === agentId)!;
  const revision = arenaLiveAccountSchema.parse(agent.account).revision;
  const id = randomUUID(), deadline = new Date(Date.now() + 60000);
  await db.$executeRaw`INSERT INTO "ArenaLiveCycle" (id,"matchId","agentId",state,attempt,trigger,"bookRevision","requestId","deadlineAt","leaseUntil")
    VALUES (${id}::uuid,${matchId}::uuid,${agentId}::uuid,'running',1,'[]',${revision},${randomUUID()}::uuid,${deadline},${deadline})`;
  return id;
}
const decision = () => ({ summary: '受控限价委托', orders: [{ clientId: 'buy', symbol: 'AAPL.US', side: 'buy', kind: 'limit',
  quantity: '10', price: '10', expiresOn: null, exitGroup: null }], cancelOrderIds: [], watchedSymbols: ['AAPL.US'],
  wakeups: [{ kind: 'fill', symbol: 'AAPL.US' }] });
describe.skipIf(!url)('自主委托事务', () => {
  afterAll(async () => {
    for (const id of ids) {
      await db.$executeRaw`DELETE FROM "ArenaLiveCycle" WHERE "matchId"=${id}::uuid`;
      await db.$executeRaw`DELETE FROM "ArenaLiveAgent" WHERE "matchId"=${id}::uuid`;
      await db.$executeRaw`DELETE FROM "ArenaLiveMatch" WHERE id=${id}::uuid`;
    }
    await db.$disconnect();
  });
  it('统一提交后只冻结资金，随后并发撮合只形成一笔成交并保留来源证据', async () => {
    const a = await create(), c = await cycle(a.matchId, a.agentId);
    const submitted = await orders.submit(c, 1, decision());
    expect(submitted.cash).toBe('10000'); expect(submitted.orders[0]?.reservedCash).toBe('100');
    sampleAt = new Date().toISOString(); quoteAt = sampleAt;
    await Promise.all([orders.match(a.matchId), orders.match(a.matchId)]);
    const saved = arenaLiveAccountSchema.parse((await liveAgents(db, a.matchId)).find((r) => r.id === a.agentId)!.account);
    expect(saved.cash).toBe('9900'); expect(saved.fills).toHaveLength(1);
    expect(saved.fills[0]?.evidence).toEqual({ source: 'controlled' });
    expect(saved.positions[0]?.quantity).toBe('10');
    await expect(orders.submit(c, 1, decision())).rejects.toThrow('cycle_not_active');
  });
  it('撮合改变了账户版本后，旧研究结果不能提交新委托', async () => {
    const a = await create(), first = await cycle(a.matchId, a.agentId);
    await orders.submit(first, 1, decision());
    const second = await cycle(a.matchId, a.agentId);
    sampleAt = new Date().toISOString(); quoteAt = sampleAt;
    await orders.match(a.matchId);
    await expect(orders.submit(second, 1, { ...decision(), orders: [], summary: '过时判断' })).rejects.toThrow('account_conflict');
    const saved = arenaLiveAccountSchema.parse((await liveAgents(db, a.matchId)).find((r) => r.id === a.agentId)!.account);
    expect(saved.orders).toHaveLength(1); expect(saved.fills).toHaveLength(1);
  });
  it('暂停之后的迟到结果不能提交，挂单在暂停期间也不能成交', async () => {
    const a = await create(), c = await cycle(a.matchId, a.agentId);
    await orders.submit(c, 1, decision());
    const late = await cycle(a.matchId, a.agentId);
    await matches.transition(a.owner, a.matchId, 'paused');
    sampleAt = new Date().toISOString(); quoteAt = sampleAt;
    await orders.match(a.matchId);
    await expect(orders.submit(late, 1, decision())).rejects.toThrow('cycle_not_active');
    const saved = arenaLiveAccountSchema.parse((await liveAgents(db, a.matchId)).find((r) => r.id === a.agentId)!.account);
    expect(saved.orders[0]?.state).toBe('active'); expect(saved.fills).toEqual([]);
  });
  it('父单与保护同事务提交；成交事务回滚后恢复，重复领取和并发撮合各只落一次', async () => {
    const a = await create(), c = await cycle(a.matchId, a.agentId);
    const d = { ...decision(), orders: [{ ...decision().orders[0]!, quantity: '27', price: '359.50',
      onFill: { activation: 'on_full_fill', activateOrders: [{ clientId: 'stop', side: 'sell', kind: 'stop_loss', price: '355',
        quantity: { basis: 'parent_open_quantity' }, reduceOnly: true, validUntil: { kind: 'activation_session_close' } }] } }] };
    const submitted = await orders.submit(c, 1, d);
    expect(submitted.orders.map((o) => o.state)).toEqual(['active', 'waiting_parent']);
    expect(submitted.orders[1]!.clientId).toBe(c + ':stop');
    const calls = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "ArenaLiveCycle" WHERE "matchId"=${a.matchId}::uuid`;
    price = '354'; await new Promise((resolve) => setTimeout(resolve, 5)); sampleAt = new Date().toISOString(); quoteAt = sampleAt;
    const interruptedDb = new Proxy(db, { get(target, key) {
      if (key === '$transaction') return (work: (tx: unknown) => Promise<unknown>) => target.$transaction(async (tx) => {
        await work(tx); throw new Error('controlled_process_interruption');
      });
      return Reflect.get(target, key);
    } });
    await expect(new LiveOrdersRepository(interruptedDb, execution).match(a.matchId)).rejects.toThrow('controlled_process_interruption');
    const read = async () => arenaLiveAccountSchema.parse((await liveAgents(db, a.matchId)).find((r) => r.id === a.agentId)!.account);
    expect(await read()).toEqual(submitted);
    const recovered = new LiveOrdersRepository(db, execution);
    await Promise.all([recovered.match(a.matchId), recovered.match(a.matchId)]);
    const entered = await read();
    expect(entered.fills.map((f) => f.side)).toEqual(['buy']);
    expect(entered.orders[1]).toMatchObject({ state: 'active', quantity: '27', parentOrderId: entered.orders[0]!.id });
    expect(entered.positions[0]?.entryOrderId).toBe(entered.orders[0]!.id);
    await recovered.match(a.matchId); expect(await read()).toEqual(entered);
    price = '350'; await new Promise((resolve) => setTimeout(resolve, 5)); sampleAt = new Date().toISOString(); quoteAt = sampleAt;
    await Promise.all([recovered.match(a.matchId), recovered.match(a.matchId)]);
    expect((await read()).fills.map((f) => [f.side, f.quantity, f.price])).toEqual([['buy', '27', '354'], ['sell', '27', '350']]);
    expect(await db.$queryRaw`SELECT count(*) AS n FROM "ArenaLiveCycle" WHERE "matchId"=${a.matchId}::uuid`).toEqual(calls);
  });
  it('撤父单与成交并发时按账户行锁收敛，最多一次入场且保护不重复', async () => {
    const a = await create(), c = await cycle(a.matchId, a.agentId);
    const d = { ...decision(), orders: [{ ...decision().orders[0]!, onFill: { activation: 'on_full_fill', activateOrders: [{
      clientId: 'stop', side: 'sell', kind: 'stop_loss', price: '9', quantity: { basis: 'parent_open_quantity' },
      reduceOnly: true, validUntil: { kind: 'activation_session_close' },
    }] } }] };
    const submitted = await orders.submit(c, 1, d), cancelCycle = await cycle(a.matchId, a.agentId);
    await new Promise((resolve) => setTimeout(resolve, 5)); sampleAt = new Date().toISOString(); quoteAt = sampleAt;
    await Promise.allSettled([orders.match(a.matchId), orders.submit(cancelCycle, 1, {
      ...decision(), orders: [], cancelOrderIds: [submitted.orders[0]!.id],
    })]);
    const saved = arenaLiveAccountSchema.parse((await liveAgents(db, a.matchId)).find((r) => r.id === a.agentId)!.account);
    expect(saved.orders).toHaveLength(2);
    if (saved.orders[0]!.state === 'filled') {
      expect(saved.fills).toHaveLength(1); expect(saved.orders[1]!.state).toBe('active');
    } else {
      expect(saved.fills).toEqual([]); expect(saved.orders.map((o) => o.state)).toEqual(['cancelled', 'cancelled']);
    }
  });
});
