import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { arenaLiveAccountSchema, type ArenaLiveProtocol } from '@thesis-ledger/schemas';
import type { ArenaPaperContext } from '@thesis-ledger/domain';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { LiveMatchesRepository } from '../../src/model-arena/live/live-matches.repository.js';
import { LiveOrdersRepository } from '../../src/model-arena/live/live-orders.repository.js';
import { LiveReplayRuntime } from '../../src/model-arena/live/live-replay-runtime.js';
import { LiveCyclesRepository } from '../../src/model-arena/live/live-cycles.repository.js';
import { liveAgents, saveLiveAccount, type LiveCycleRow } from '../../src/model-arena/live/live-storage.js';
import { liveProtocolFixture } from './live-fixture.js';
import type { ArenaReplayObservation } from '../../src/market/market-arena-replay-reader.js';

const url = process.env.AI_PROVIDER_DATABASE_URL;
if (url && (new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/ai_provider_concurrency_fixture')) throw new Error('需要专属隔离库');
const db = new PrismaService({ datasourceUrl: url ?? 'postgresql://fixture@127.0.0.1:1/unused' });
const matches = new LiveMatchesRepository(db), ids: string[] = [];
const matching = { kind: 'simulated_volume' as const, maxSharesPerObservation: '2' };
function observe(at: string, price: string, p: ArenaLiveProtocol): ArenaReplayObservation {
  const day = at.slice(0, 10);
  const context: ArenaPaperContext = { at, tradingDate: day, fees: p.fees, matching: p.matching,
    maxPositionBps: 10000, maxActiveSymbols: 50, allowedSymbols: new Set(['AAPL.US']), newId: randomUUID,
    expiresAt: () => '2030-12-31T21:00:00.000Z', quotes: [{ symbol: 'AAPL.US', price, marketTime: at, observedAt: at,
      sourceRef: 'independent-partial-fixture', evidence: { simulatedVolume: p.matching }, tradingDate: day,
      positionAvailableOn: day, cashAvailableOn: day, lot: '1', tick: '0.01', buyBlocked: null, sellBlocked: null,
      statutoryBuyFee: () => '0', statutorySellFee: () => '0' }] };
  return { at, context, evidence: {}, prices: new Map([['AAPL.US', price]]), session: {
    state: 'open', tradingDayState: 'open', date: day, evaluatedAt: at, latestTradingDate: day,
    market: 'US', timezone: 'America/New_York', calendarRevision: 'fixture',
    sessions: [{ tradingDate: day, startAt: '2026-01-01T00:00:00Z', endAt: '2031-01-01T00:00:00Z' }] } };
}
const decision = () => ({ summary: '受控部分成交', orders: [{ clientId: 'entry', symbol: 'AAPL.US', side: 'buy', kind: 'limit',
  quantity: '27', price: '359.50', expiresOn: null, exitGroup: null,
  onFill: { activation: 'on_each_fill', afterExit: 'keep_entry_remainder', activateOrders: [{ clientId: 'stop', side: 'sell', kind: 'stop_loss', price: '355',
    quantity: { basis: 'parent_open_quantity' }, reduceOnly: true, validUntil: { kind: 'activation_session_close' } }] } }],
  cancelOrderIds: [] as string[], watchedSymbols: ['AAPL.US'], wakeups: [{ kind: 'time', at: '2099-01-01T00:00:00Z' }] });
function stagedDecision() {
  const d = decision(), plan = d.orders[0]!.onFill;
  Object.assign(plan, { exitPolicy: 'staged' });
  plan.activateOrders.push(Object.assign({ ...plan.activateOrders[0]! }, { clientId: 'take', kind: 'take_profit', price: '375',
    quantity: { basis: 'parent_filled_fraction', numerator: 1, denominator: 3 } }));
  return d;
}
async function create(p: ArenaLiveProtocol) {
  const owner = randomUUID(), { id } = await matches.create(owner, p); ids.push(id);
  await matches.transition(owner, id, 'running'); return id;
}
const read = async (id: string) => arenaLiveAccountSchema.parse((await liveAgents(db, id))[0]!.account);
async function liveCycle(id: string) {
  const [agent] = await liveAgents(db, id), book = await read(id), cycleId = randomUUID(), deadline = new Date(Date.now() + 60000);
  await db.$executeRaw`INSERT INTO "ArenaLiveCycle" (id,"matchId","agentId",state,attempt,trigger,"bookRevision","requestId","deadlineAt","leaseUntil")
    VALUES (${cycleId}::uuid,${id}::uuid,${agent!.id}::uuid,'running',1,'[]',${book.revision},${randomUUID()}::uuid,${deadline},${deadline})`;
  return cycleId;
}
describe.skipIf(!url)('实际部分成交的持久化入口', () => {
  afterAll(async () => {
    for (const id of ids) {
      await db.$executeRaw`DELETE FROM "ArenaLiveCycle" WHERE "matchId"=${id}::uuid`;
      await db.$executeRaw`DELETE FROM "ArenaLiveValuation" WHERE "matchId"=${id}::uuid`;
      await db.$executeRaw`DELETE FROM "ArenaLiveAgent" WHERE "matchId"=${id}::uuid`;
      await db.$executeRaw`DELETE FROM "ArenaLiveMatch" WHERE id=${id}::uuid`;
    }
    await db.$disconnect();
  });
  it('并发读取同一行情只成交2股；重建仓储买10、退出4、正式撤17后保留6股', async () => {
    const p = liveProtocolFixture({ matching }), id = await create(p);
    let sample = observe(new Date().toISOString(), '360', p);
    const execution = { build: async () => ({ ...sample, missing: {} }) };
    const orders = new LiveOrdersRepository(db, execution);
    await orders.submit(await liveCycle(id), 1, decision());
    for (let n = 0; n < 7; n++) {
      await new Promise(done => setTimeout(done, 3));
      sample = observe(new Date().toISOString(), n < 5 ? '359' : '350', p);
      const recovered = new LiveOrdersRepository(db, execution);
      await Promise.all([recovered.match(id), recovered.match(id)]);
      await recovered.match(id);
    }
    const before = await read(id);
    expect(before.fills.map(f => f.quantity)).toEqual(Array(7).fill('2'));
    const cancel = { ...decision(), orders: [], cancelOrderIds: [before.orders[0]!.id] };
    await orders.submit(await liveCycle(id), 1, cancel);
    const six = await read(id);
    expect(six.orders[0]).toMatchObject({ state: 'cancelled', filledQuantity: '10', remainingQuantity: '17' });
    expect(six.orders[1]).toMatchObject({ state: 'active', filledQuantity: '4', remainingQuantity: '6' });
    expect(six.positions.reduce((n, p) => n + Number(p.quantity), 0)).toBe(6);
  });
  it('正式回放使用同一冻结额度；退出后撤余，重建运行时仍为买10卖4余6', async () => {
    const p = liveProtocolFixture({ matching, startsOn: '2026-11-02', entrants: [liveProtocolFixture().entrants[0]!] }), id = await create(p);
    const first = '2026-11-02T14:31:00.000Z';
    const source = { next: async (_p: ArenaLiveProtocol, after: string, target: string) => {
      if (after < first) return first;
      return new Date(Math.min(Date.parse(target), Date.parse(after) + 60000)).toISOString();
    }, observe: async (_p: ArenaLiveProtocol, at: string) => observe(at, at < '2026-11-02T14:37:00.000Z' ? '359' : '350', p) };
    const runtime = new LiveReplayRuntime(db, source, matches);
    await runtime.reconcile(id, new Date(first));
    const [cycle] = await db.$queryRaw<LiveCycleRow[]>`SELECT * FROM "ArenaLiveCycle" WHERE "matchId"=${id}::uuid AND state='pending'`;
    await new LiveCyclesRepository(db).claim(cycle!.id, 1, new Date(), undefined, first);
    await db.$executeRaw`UPDATE "ArenaLiveCycle" SET "requestId"=${randomUUID()}::uuid WHERE id=${cycle!.id}::uuid`;
    const orders = new LiveOrdersRepository(db, { build: async (_p, _b, _d, _s, at) => ({ ...observe(at!, '360', p), missing: {} }) });
    const d = decision(); d.orders[0]!.onFill.afterExit = 'cancel_entry_remainder';
    await orders.submit(cycle!.id, 1, d);
    await db.$executeRaw`UPDATE "ArenaLiveAgent" SET state='budget_exhausted' WHERE "matchId"=${id}::uuid`;
    await runtime.reconcile(id, new Date('2026-11-02T14:37:00.000Z'));
    await new LiveReplayRuntime(db, source, matches).reconcile(id, new Date('2026-11-02T14:39:00.000Z'));
    const six = await read(id);
    expect(six.orders[0]).toMatchObject({ state: 'cancelled', filledQuantity: '10', remainingQuantity: '17' });
    expect(six.orders[1]).toMatchObject({ state: 'active', filledQuantity: '4', remainingQuantity: '6' });
    expect(six.fills.map(f => f.side)).toEqual(['buy', 'buy', 'buy', 'buy', 'buy', 'sell', 'sell']);
  });
  it('逐次分档经正式实时仓储并发撮合、恢复和撤余，不重复卖出已耗尽额度', async () => {
    const p = liveProtocolFixture({ matching: { ...matching, maxSharesPerObservation: '10' } }), id = await create(p);
    const [agent] = await liveAgents(db, id), original = await read(id);
    original.positions.push({ symbol: 'AAPL.US', quantity: '50', acquiredOn: '2026-11-12', availableOn: '2026-11-13' });
    await saveLiveAccount(db, agent!.id, original);
    let sample = observe(new Date().toISOString(), '360', p);
    const execution = { build: async () => ({ ...sample, missing: {} }) }, orders = new LiveOrdersRepository(db, execution);
    const d = stagedDecision();
    await orders.submit(await liveCycle(id), 1, d);
    const identities = (await read(id)).orders.map(o => o.id);
    for (const price of ['359', '380', '359', '380']) {
      await new Promise(done => setTimeout(done, 3)); sample = observe(new Date().toISOString(), price, p);
      const recovered = new LiveOrdersRepository(db, execution);
      await Promise.all([recovered.match(id), recovered.match(id)]); await recovered.match(id);
    }
    const twenty = await read(id);
    expect(twenty.orders[0]).toMatchObject({ filledQuantity: '20', remainingQuantity: '7' });
    expect(twenty.orders[2]).toMatchObject({ filledQuantity: '6', state: 'waiting_parent', remainingQuantity: '0' });
    expect(twenty.orders[1]!.remainingQuantity).toBe('14');
    await orders.submit(await liveCycle(id), 1, { ...d, orders: [], cancelOrderIds: [twenty.orders[0]!.id] });
    for (let n = 0; n < 2; n++) {
      await new Promise(done => setTimeout(done, 3)); sample = observe(new Date().toISOString(), '350', p);
      const recovered = new LiveOrdersRepository(db, execution); await Promise.all([recovered.match(id), recovered.match(id)]);
    }
    const final = await read(id);
    expect(final.orders.map(o => o.id)).toEqual(identities);
    expect(final.orders[2]).toMatchObject({ state: 'filled', filledQuantity: '6' });
    expect(final.positions.map(p => p.quantity)).toEqual(['50']);
    expect(final.fills.filter(f => f.side === 'sell').map(f => f.quantity)).toEqual(['3', '3', '10', '4']);
  });
  it('新增分档额度与撤入场余量并发时按账户版本收敛，不丢已退出量或重复建档', async () => {
    const p = liveProtocolFixture({ matching: { ...matching, maxSharesPerObservation: '10' } }), id = await create(p);
    let sample = observe(new Date().toISOString(), '360', p);
    const execution = { build: async () => ({ ...sample, missing: {} }) }, orders = new LiveOrdersRepository(db, execution);
    const d = stagedDecision(); await orders.submit(await liveCycle(id), 1, d);
    for (const price of ['359', '380']) {
      await new Promise(done => setTimeout(done, 3)); sample = observe(new Date().toISOString(), price, p); await orders.match(id);
    }
    const before = await read(id), cycle = await liveCycle(id);
    await new Promise(done => setTimeout(done, 3)); sample = observe(new Date().toISOString(), '359', p);
    const command = { ...d, orders: [], cancelOrderIds: [before.orders[0]!.id] };
    const [cancelled] = await Promise.allSettled([orders.submit(cycle, 1, command), new LiveOrdersRepository(db, execution).match(id)]);
    if (cancelled.status === 'rejected') {
      expect(String(cancelled.reason)).toContain('account_conflict');
      // 本测试直接调用仓储；模拟 Runner 收敛失败周期后，才能创建新的重读决策。
      await db.$executeRaw`UPDATE "ArenaLiveCycle" SET state='failed',reason='account_conflict',"completedAt"=CURRENT_TIMESTAMP,"leaseUntil"=NULL WHERE id=${cycle}::uuid AND state='running'`;
      await orders.submit(await liveCycle(id), 1, command);
    }
    const final = await read(id), bought = Number(final.orders[0]!.filledQuantity);
    expect([10, 20]).toContain(bought); expect(final.orders[0]!.state).toBe('cancelled');
    expect(final.orders.map(o => o.id)).toEqual(before.orders.map(o => o.id));
    expect(final.orders[2]!.filledQuantity).toBe('3'); expect(final.orders[1]!.remainingQuantity).toBe(String(bought - 3));
    await new LiveOrdersRepository(db, execution).match(id); expect(await read(id)).toEqual(final);
  });
});
