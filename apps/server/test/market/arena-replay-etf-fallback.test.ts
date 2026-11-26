import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { statusCompositionDemandV1Schema } from '@thesis-ledger/schemas';
import { MarketArenaReplayReader } from '../../src/market/market-arena-replay-reader.js';
import { readReplayExecutionEvidence } from '../../src/market/market-arena-replay-execution.js';
import { liveProtocolFixture } from '../model-arena/live-fixture.js';
import { compositionFixture } from './status-composition-fixtures.js';

const sample = JSON.parse(
  readFileSync(new URL('./fixtures/arena-sampled-frozen-business.json', import.meta.url), 'utf8'),
);
const at = '2026-11-10T05:01:00.000Z';
const day = '2026-11-10';
const blocked = vi.fn(() => {
  throw new Error('unexpected_external_operation');
});
beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(blocked);
});
afterEach(() => {
  expect(blocked).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function setup(assetType: 'STOCK' | 'ETF' = 'ETF', etfSymbol = '588000.SH') {
  const symbol = assetType === 'ETF' ? etfSymbol : '600036.SH';
  const p = liveProtocolFixture({
    simulationPolicy: 'sampled-v1',
    market: 'CN',
    currency: 'CNY',
    timeZone: 'Asia/Shanghai',
    universe: 'fixed',
    instruments: [
      {
        instrumentId: '11111111-1111-4111-8111-111111111111',
        symbol,
        assetType,
      },
    ],
  });
  const dsa = {
    historicalExecution: vi.fn().mockResolvedValue(structuredClone(sample.snapshot)),
    backtestInstrumentFacts: vi.fn(),
  };
  const status = { readComposition: vi.fn() };
  const bars = {
    readRetainedResearch: vi
      .fn()
      .mockResolvedValue({
        status: 'selected',
        selection: { response: { bars: sample.points } },
        seriesVersion: sample.sourceRef,
        evidence: sample.receipts,
      }),
  };
  const reader = new MarketArenaReplayReader(
    {
      read: vi.fn(async ({ start, end }) => ({
        status: 'ready',
        calendar: {
          ...sample.calendar,
          coverageStart: start,
          coverageEnd: end,
          sessions: sample.calendar.sessions.filter(
            (s: { tradingDate: string }) => s.tradingDate >= start && s.tradingDate <= end,
          ),
        },
      })),
    } as never,
    bars as never,
    dsa as never,
    status,
    { read: blocked },
  );
  return { p, symbol, dsa, status, reader };
}

it('既有 ETF 快照仍可报价和产生可执行输入，不调用股票回退', async () => {
  const s = setup();
  expect(await s.reader.quote(s.p, at, s.symbol)).toMatchObject({
    price: '1.343',
    execution: { status: 'available' },
  });
  const observed = await s.reader.observe(s.p, at, [s.symbol]);
  expect(observed.context.quotes).toHaveLength(1);
  expect(observed.context.quotes[0]).toMatchObject({
    lot: '100',
    tick: '0.001',
    positionAvailableOn: '2026-11-11',
  });
  expect(s.status.readComposition).not.toHaveBeenCalled();
  expect(s.dsa.backtestInstrumentFacts).not.toHaveBeenCalled();
});

it.each(['588000.SH', '512480.SH'])(
  'ETF %s 快照失败时保留价格与内部 cause，返回稳定原因且不构造股票查询',
  async (symbol) => {
    const s = setup('ETF', symbol);
    const raw = statusCompositionDemandV1Schema.safeParse({
      requirement: 'completeWindow',
      query: {
        contractVersion: 1,
        capabilityVersion: 1,
        consumer: 'thesis-ledger',
        requestId: 'frozen-etf-query',
        symbol: s.symbol,
        range: { start: day, end: day },
        routeKey: {
          kind: 'data',
          market: 'CN',
          assetType: 'ETF',
          capability: 'DAILY_TRADING_STATUS',
        },
      },
    });
    if (raw.success) throw new Error('expected_stock_only_contract');
    s.dsa.historicalExecution.mockRejectedValue(raw.error);
    const quote = await s.reader.quote(s.p, at, s.symbol);
    expect(quote).toMatchObject({
      price: '1.343',
      execution: { status: 'unavailable', reason: 'replay_rules_unavailable' },
    });
    expect(JSON.stringify(quote)).not.toContain('invalid_union');
    await expect(s.reader.observe(s.p, at, [s.symbol])).rejects.toMatchObject({
      message: 'replay_rules_unavailable',
      cause: raw.error,
    });
    expect(s.status.readComposition).not.toHaveBeenCalled();
    expect(s.dsa.backtestInstrumentFacts).not.toHaveBeenCalled();
  },
);

it('未提供 ETF 快照读取端口时不走身份或股票状态回退，纯估值仍可用', async () => {
  const s = setup();
  const dsa = { backtestInstrumentFacts: vi.fn() };
  await expect(
    readReplayExecutionEvidence(dsa as never, s.status, s.p, s.p.instruments[0]!, at, at, day),
  ).rejects.toThrow('replay_rules_unavailable');
  expect(dsa.backtestInstrumentFacts).not.toHaveBeenCalled();
  expect(s.status.readComposition).not.toHaveBeenCalled();
  s.dsa.historicalExecution.mockRejectedValue(new Error('archive_not_admitted'));
  const read = await s.reader.observe(s.p, at, [s.symbol], [], []);
  expect(read.prices.get(s.symbol)).toBe('1.343');
  expect(read.context.quotes).toEqual([]);
  expect(s.dsa.historicalExecution).not.toHaveBeenCalled();
});

it('股票仍可经身份和 DAILY_TRADING_STATUS 合法回退得到可执行输入', async () => {
  const s = setup('STOCK');
  s.dsa.historicalExecution.mockRejectedValue(new Error('snapshot_unavailable'));
  s.dsa.backtestInstrumentFacts.mockResolvedValue({
    facts: [
      {
        ...sample.snapshot.fact,
        symbol: s.symbol,
        instrumentType: 'STOCK',
        tradable: false,
        executionRules: { status: 'unavailable' },
      },
    ],
  });
  const trading = compositionFixture({ symbol: s.symbol, dates: [day] }).samples.find(
    (item: { name: string }) => item.name === 'DAILY_TRADING_STATUS',
  );
  s.status.readComposition.mockResolvedValue({
    entries: [{ query: trading.request, status: 'included', result: trading.result }],
  });
  expect(await s.reader.quote(s.p, at, s.symbol)).toMatchObject({
    execution: { status: 'available' },
  });
  expect(s.status.readComposition).toHaveBeenCalledWith([
    expect.objectContaining({
      query: expect.objectContaining({
        routeKey: {
          kind: 'data',
          market: 'CN',
          assetType: 'STOCK',
          capability: 'DAILY_TRADING_STATUS',
        },
      }),
    }),
  ]);
});

it.each([
  new Error('invalid_union: internal schema with private payload'.repeat(100)),
  'private non-error failure',
  { secret: 'private exception payload' },
])('研究报价不透传任意内部异常，保留已取得价格', async (error) => {
  const s = setup('STOCK');
  s.dsa.historicalExecution.mockRejectedValue(new Error('snapshot_unavailable'));
  s.dsa.backtestInstrumentFacts.mockRejectedValue(error);
  const quote = await s.reader.quote(s.p, at, s.symbol);
  expect(quote).toMatchObject({
    price: '1.343',
    execution: { status: 'unavailable', reason: 'replay_rules_unavailable' },
  });
  expect(JSON.stringify(quote)).not.toContain('private');
});

it('已知日历缺口仍保留其业务原因码', async () => {
  const s = setup('STOCK');
  s.dsa.historicalExecution.mockRejectedValue(new Error('snapshot_unavailable'));
  s.dsa.backtestInstrumentFacts.mockRejectedValue(new Error('replay_calendar_unavailable'));
  expect(await s.reader.quote(s.p, at, s.symbol)).toMatchObject({
    execution: { status: 'unavailable', reason: 'replay_calendar_unavailable' },
  });
});
