import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { arenaLiveAccountSchema, type ArenaLiveDecision } from '@thesis-ledger/schemas';
import { LiveExecutionContext } from '../../src/model-arena/live/live-execution-context.js';
import { liveProtocolFixture } from './live-fixture.js';

const now = '2026-11-12T16:00:00.000Z';
const protocol = liveProtocolFixture({ startsOn: null, endsOn: null });
function account() {
  return arenaLiveAccountSchema.parse({
    revision: 0,
    cash: '10000',
    positions: [
      { symbol: 'AAPL.US', quantity: '2', acquiredOn: '2026-11-11', availableOn: '2026-11-11' },
    ],
    cashSettlements: [],
    orders: [],
    wakeups: [],
    watchedSymbols: [],
    fills: [],
  });
}
const decision: ArenaLiveDecision = {
  summary: '受控执行范围',
  orders: [
    {
      clientId: 'buy',
      symbol: 'MSFT.US',
      side: 'buy',
      kind: 'limit',
      quantity: '1',
      price: '10',
      expiresOn: '2026-11-13',
      exitGroup: null,
    },
  ],
  cancelOrderIds: [],
  watchedSymbols: ['SPY.US'],
  wakeups: [{ kind: 'price', symbol: 'QQQ.US', operator: 'gte', price: '10' }],
};
function fixture() {
  const symbols = ['AAPL', 'MSFT', 'SPY', 'QQQ', 'NVDA'];
  const db = {
    instrument: {
      findMany: vi.fn().mockResolvedValue(
        symbols.map((symbol) => ({
          id: symbol,
          canonicalCode: symbol,
          market: 'US',
          instrumentType: 'STOCK',
          active: symbol !== 'AAPL',
        })),
      ),
    },
  };
  const market = {
    getSession: vi.fn().mockResolvedValue({
      state: 'open',
      date: '2026-11-12',
      sessions: [{ startAt: '2026-11-12T14:30:00Z', endAt: '2026-11-12T21:00:00Z' }],
    }),
  };
  const reader = {
    read: vi
      .fn()
      .mockImplementation(async ({ symbol }) => ({
        status: 'available',
        observation: { symbol, marketTime: now, price: '10' },
        ends: new Map([['2026-11-13', '2026-11-13T21:00:00Z']]),
      })),
  };
  return { db, market, reader, context: new LiveExecutionContext(db as never, market, reader) };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => vi.useRealTimers());

it('标的去重保持顺序，仅持仓、委托和额外执行标的读取报价', async () => {
  const f = fixture();
  const result = await f.context.build(protocol, [account()], decision, ['NVDA.US', 'AAPL.US']);
  const where = f.db.instrument.findMany.mock.calls[0]![0].where.OR;
  expect(where.map((row: { canonicalCode: string }) => row.canonicalCode)).toEqual([
    'AAPL',
    'NVDA',
    'MSFT',
    'SPY',
    'QQQ',
  ]);
  expect(f.reader.read.mock.calls.map(([input]) => input.symbol)).toEqual([
    'AAPL.US',
    'MSFT.US',
    'NVDA.US',
  ]);
  expect(f.reader.read.mock.calls[0]![0]).toMatchObject({
    previousDay: '2026-11-11',
    expiresOn: [],
  });
  expect(result.context.allowedSymbols.has('AAPL.US')).toBe(true);
  expect(result.context.quotes).toHaveLength(3);
  expect(result.context.expiresAt(null, 'market')).toBe('2026-11-12T21:00:00.000Z');
  expect(result.context.expiresAt('2026-11-13', 'limit')).toBe('2026-11-13T21:00:00Z');
});

it('固定宇宙拒绝范围外目录，既有持仓仍留在允许集合', async () => {
  const f = fixture();
  const result = await f.context.build(
    { ...protocol, universe: 'fixed', instruments: [] },
    [account()],
    decision,
  );
  expect(f.reader.read).not.toHaveBeenCalled();
  expect([...result.context.allowedSymbols]).toEqual(['AAPL.US']);
  expect(result.context.quotes).toEqual([]);
});

it('指定远期到期日缺失时拒绝该期限，不回退成已知较早的收盘', async () => {
  const f = fixture();
  const result = await f.context.build(protocol, [account()], decision);
  expect(() => result.context.expiresAt('2026-12-01', 'limit')).toThrow('expiry_calendar_unavailable');
});

it('买入只要求其他持仓估值，撤单不读取新价格和既有期限', async () => {
  const f = fixture();
  const valuation = { read: vi.fn().mockResolvedValue({ prices: new Map([['AAPL.US', '20']]) }) };
  const context = new LiveExecutionContext(f.db as never, f.market, f.reader, undefined, valuation);
  const result = await context.build(protocol, [account()], decision);
  expect(f.reader.read.mock.calls.map(([i]) => i.symbol)).toEqual(['MSFT.US']);
  expect(result.context.valuationPrices).toEqual(new Map([['AAPL.US', '20'], ['MSFT.US', '10']]));
  const held = account();
  held.orders.push({ symbol: 'MSFT.US', state: 'active', expiresOn: '2030-01-01' } as never);
  f.reader.read.mockClear(); valuation.read.mockClear();
  await context.build(protocol, [held], { ...decision, orders: [] });
  expect(f.reader.read).not.toHaveBeenCalled();
  expect(valuation.read).not.toHaveBeenCalled();
});

it('父子期限都传入实时和历史执行入口，不把跨夜保护缩短为父单期限', async () => {
  const f = fixture();
  const plan = structuredClone(decision);
  plan.orders[0]!.onFill = { activation: 'on_full_fill', activateOrders: [{
    clientId: 'protect', side: 'sell', kind: 'stop_loss', price: '9',
    quantity: { basis: 'parent_open_quantity' }, reduceOnly: true,
    validUntil: { kind: 'date', expiresOn: '2026-12-01' },
  }] };
  await f.context.build(protocol, [account()], plan);
  expect(f.reader.read.mock.calls[0]![0].expiresOn).toEqual(['2026-11-13', '2026-12-01']);
  const replay = { observe: vi.fn().mockResolvedValue({ context: {}, session: {} }) };
  const context = new LiveExecutionContext(f.db as never, f.market, f.reader, replay);
  await context.build(protocol, [account()], plan, [], now);
  expect(replay.observe.mock.calls[0]![5]).toEqual(['2026-11-13', '2026-12-01']);
});

it('来源明确拒绝与异常分别保留原因，老报价不进入执行上下文', async () => {
  const f = fixture();
  f.reader.read.mockResolvedValueOnce({ status: 'unavailable', reason: 'calendar_unavailable' });
  f.reader.read.mockRejectedValueOnce(new Error('fixture'));
  f.reader.read.mockResolvedValueOnce({
    status: 'available',
    observation: { symbol: 'NVDA.US', marketTime: '2026-11-12T15:58:59.999Z' },
    ends: new Map(),
  });
  const result = await f.context.build(protocol, [account()], decision, ['NVDA.US']);
  expect(result.missing).toEqual({
    'MSFT.US': 'calendar_unavailable',
    'NVDA.US': 'execution_evidence_unavailable',
  });
  expect(result.context.quotes).toEqual([]);
});
