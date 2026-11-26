import { expect, vi } from 'vitest';
import {
  arenaSubmitDecision,
  arenaMatchOrders,
  type ArenaPaperAccount,
} from '@thesis-ledger/domain';
import { type ArenaLiveDecision } from '@thesis-ledger/schemas';
import { MarketLiveExecutionReader } from '../../src/market/market-live-execution-reader.js';
import { LiveExecutionContext } from '../../src/model-arena/live/live-execution-context.js';
import { liveProtocolFixture } from '../model-arena/live-fixture.js';

/** DSA 实际 HTTP 的受控状态通过 Server 读取、统一下单及后续观察撮合。 */
export async function exerciseSzEtfState(
  state: Record<string, unknown>,
  facts: Record<string, unknown>,
) {
  expect(state).toMatchObject({
    symbol: '159915.SZ',
    state: 'normal',
    evidence: { provider: 'futu' },
  });
  const symbol = '159915.SZ',
    at = new Date().toISOString();
  const quote = {
    symbol,
    price: 2.295,
    units: { priceCurrency: 'CNY' },
    marketTime: '2026-11-23T01:31:35Z',
    fetchedAt: at,
    stale: false,
    freshness: 'live',
    provider: 'hithink',
    upstreamSource: 'fund-market-snapshot',
  };
  const market = {
    getQuote: vi.fn().mockResolvedValue(quote),
    getSession: vi.fn().mockResolvedValue({
      state: 'open',
      date: '2026-11-23',
      sessions: [
        {
          tradingDate: '2026-11-23',
          startAt: '2026-11-23T01:30:00Z',
          endAt: '2026-11-23T03:30:00Z',
        },
      ],
    }),
  };
  const dsa = {
    get: vi.fn().mockResolvedValue(state),
    backtestInstrumentFacts: vi.fn().mockResolvedValue(facts),
    post: vi.fn(),
    effectiveControlPolicyV3: vi.fn(),
    marketPublicFeesV3: vi.fn(),
  };
  const status = { readComposition: vi.fn() };
  const calendars = {
    read: vi
      .fn()
      .mockResolvedValue({
        status: 'ready',
        calendar: {
          sessions: ['2026-11-23', '2026-11-24'].map((day) => ({
            tradingDate: day,
            startAt: day + 'T01:30:00Z',
            endAt: day + 'T07:00:00Z',
          })),
        },
      }),
  };
  const reader = new MarketLiveExecutionReader(
    market as never,
    calendars,
    status,
    { read: vi.fn().mockResolvedValue(['coverage_unverified']) },
    dsa as never,
  );
  const db = {
    instrument: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: '11111111-1111-4111-8111-111111111111',
          canonicalCode: '159915',
          market: 'SZ',
          instrumentType: 'ETF',
          active: true,
        },
      ]),
    },
  };
  const context = new LiveExecutionContext(db as never, market, reader);
  const p = liveProtocolFixture({
    simulationPolicy: 'sampled-v1',
    market: 'CN',
    currency: 'CNY',
    timeZone: 'Asia/Shanghai',
  });
  const empty: ArenaPaperAccount = {
    revision: 0,
    cash: '10000',
    positions: [],
    orders: [],
    fills: [],
    cashSettlements: [],
    wakeups: [],
    watchedSymbols: [],
  };
  const decision: ArenaLiveDecision = {
    summary: '深市 ETF 隔离样本',
    watchedSymbols: [],
    cancelOrderIds: [],
    wakeups: [{ kind: 'fill', symbol }],
    orders: [
      {
        clientId: 'buy',
        symbol,
        side: 'buy',
        kind: 'limit',
        quantity: '100',
        price: '2.300',
        expiresOn: null,
        exitGroup: null,
      },
    ],
  };
  const initial = await context.build(p, [empty], decision);
  const accepted = arenaSubmitDecision(empty, 0, decision, initial.context);
  expect(arenaMatchOrders(accepted, initial.context, true)).toEqual(accepted);
  vi.setSystemTime(new Date('2026-11-23T01:32:07Z'));
  quote.marketTime = '2026-11-23T01:32:06Z';
  quote.fetchedAt = '2026-11-23T01:32:07Z';
  const next = await context.build(p, [accepted]);
  const filled = arenaMatchOrders(accepted, next.context, true);
  expect(filled.fills).toHaveLength(1);
  expect(filled.fills[0]).toMatchObject({ symbol, quantity: '100', price: '2.295', fee: '0' });
  expect(filled.cash).toBe('9770.5');
  expect(filled.positions[0]?.availableOn).toBe('2026-11-24');
  expect(arenaMatchOrders(filled, next.context, true)).toEqual(filled);
  dsa.get.mockResolvedValue({ ...state, state: 'suspended' });
  const halted = await context.build(p, [empty], decision);
  expect(() => arenaSubmitDecision(empty, 0, decision, halted.context)).toThrow(
    'instrument_not_tradable',
  );
  dsa.get.mockResolvedValue({ ...state, state: 'unknown' });
  const missing = await context.build(p, [empty], decision);
  expect(() => arenaSubmitDecision(empty, 0, decision, missing.context)).toThrow(
    'execution_evidence_missing',
  );
  expect(status.readComposition).not.toHaveBeenCalled();
  expect(dsa.marketPublicFeesV3).not.toHaveBeenCalled();
  expect(market.getQuote.mock.calls.every(([requested]) => requested === symbol)).toBe(true);
}
