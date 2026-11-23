import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import {
  arenaSubmitDecision,
  arenaMatchOrders,
  arenaExpireOrders,
  arenaAccountNav,
} from '@thesis-ledger/domain';
import { arenaLiveDecisionSchema, arenaLiveAccountSchema } from '@thesis-ledger/schemas';
import { LiveExecutionContext } from '../../src/model-arena/live/live-execution-context.js';
import { MarketArenaReplayReader } from '../../src/market/market-arena-replay-reader.js';
import { liveProtocolFixture } from '../model-arena/live-fixture.js';

const sample = JSON.parse(
  readFileSync(new URL('./fixtures/arena-sampled-frozen-business.json', import.meta.url), 'utf8'),
);
it('复用原成功决策与两根真实分钟，零外网零数据库完成统一研究政策闭环', async () => {
  const original = JSON.stringify(sample);
  const blocked = vi.fn(() => {
    throw new Error('unexpected_external_operation');
  });
  const network = vi.spyOn(globalThis, 'fetch').mockImplementation(blocked);
  try {
    const calendars = {
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
    };
    const bars = {
      readRetainedResearch: vi.fn(async () => ({
        status: 'selected',
        selection: {
          response: { bars: sample.points },
        },
        seriesVersion: sample.sourceRef,
        evidence: sample.receipts,
      })),
    };
    // 保留原身份、交易状态；移除本政策不消费的完整费率与涨跌停输入。
    const snapshot = {
      ...sample.snapshot,
      priceRule: undefined,
      fact: {
        ...sample.snapshot.fact,
        tradable: false,
        executionRules: { status: 'unavailable' },
      },
    };
    const dsa = {
      historicalExecution: vi.fn().mockResolvedValue(snapshot),
      backtestInstrumentFacts: blocked,
    };
    const status = { readComposition: blocked },
      actions = { read: vi.fn().mockResolvedValue(['coverage_unverified']) };
    const replay = new MarketArenaReplayReader(
      calendars as never,
      bars as never,
      dsa as never,
      status,
      actions,
    );
    const context = new LiveExecutionContext(
      { instrument: { findMany: blocked } } as never,
      { getSession: blocked },
      { read: blocked },
      replay,
    );
    const p = liveProtocolFixture({
      simulationPolicy: 'sampled-v1',
      market: 'CN',
      currency: 'CNY',
      timeZone: 'Asia/Shanghai',
      initialCash: '100000',
      universe: 'fixed',
      instruments: [
        {
          instrumentId: '11111111-1111-4111-8111-111111111111',
          symbol: '588000.SH',
          assetType: 'ETF',
        },
      ],
    });
    const d = arenaLiveDecisionSchema.parse(sample.decision),
      empty = arenaLiveAccountSchema.parse(sample.account);
    const prepared = await context.build(p, [empty], d, [], '2026-11-10T05:01:00.000Z');
    const accepted = arenaSubmitDecision(empty, empty.revision, d, prepared.context);
    expect(arenaMatchOrders(accepted, prepared.context, true)).toEqual(accepted);
    const next = await context.build(p, [accepted], undefined, [], '2026-11-10T05:02:00.000Z');
    const filled = arenaMatchOrders(accepted, next.context, true);
    expect(filled.fills).toHaveLength(1);
    expect(filled.fills[0]).toMatchObject({
      quantity: '14800',
      price: '1.343',
      fee: '0',
      sourceRef: sample.sourceRef,
    });
    expect(filled.cash).toBe('80123.6');
    expect(filled.positions[0]).toMatchObject({ quantity: '14800', availableOn: '2026-11-11' });
    expect(arenaAccountNav(filled, next.context.valuationPrices!)).toBe('100000');
    expect(arenaMatchOrders(filled, next.context, true)).toEqual(filled);
    expect(filled.orders.find((o) => o.parentOrderId)?.state).toBe('active');
    const expired = arenaExpireOrders(filled, '2026-11-10T07:00:00.000Z');
    expect(expired.orders.find((o) => o.parentOrderId)?.state).toBe('expired');
    const valued = await replay.observe(
      p,
      '2026-11-10T05:02:00.000Z',
      ['588000.SH'],
      filled.positions,
      [],
    );
    expect(valued.prices.get('588000.SH')).toBe('1.343');
    expect(valued.context.quotes).toEqual([]);
    expect(calendars.read.mock.calls.at(-1)![0].end).toBe('2026-11-10');
    const reads = [bars.readRetainedResearch.mock.calls.length, calendars.read.mock.calls.length];
    const cancelledInput = {
      ...d,
      orders: [],
      cancelOrderIds: [filled.orders.find((o) => o.parentOrderId)!.id],
    };
    const cancelContext = await context.build(
      p,
      [filled],
      cancelledInput,
      [],
      '2026-11-10T05:02:00.000Z',
    );
    expect(
      arenaSubmitDecision(
        filled,
        filled.revision,
        cancelledInput,
        cancelContext.context,
      ).orders.find((o) => o.parentOrderId)?.state,
    ).toBe('cancelled');
    expect([bars.readRetainedResearch.mock.calls.length, calendars.read.mock.calls.length]).toEqual(
      reads,
    );
    expect(blocked).not.toHaveBeenCalled();
    expect(JSON.stringify(sample)).toBe(original);
  } finally {
    network.mockRestore();
  }
});
