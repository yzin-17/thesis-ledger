import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { type CorporateActionFact } from '@thesis-ledger/schemas';
import { dailyOrderRawInput } from './daily-order-raw-snapshot.fixture.js';
import { snapshotEventDsaFixture } from './snapshot-event-dsa-v3.fixtures.js';
import { freezeTradePlanFixture } from './trade-plan-snapshot.fixture.js';
import { hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';

it.each(['4', '4.8'] as const)('拆股与现金分配冻结回放，除权后开盘 %s', async (afterSplit) => {
  const root = await mkdtemp(
    join(process.env.DAILY_ACTION_REPLAY_DIR ?? tmpdir(), 'daily-action-replay-'),
  );
  try {
    const f = await dailyOrderRawInput({
      end: '2026-05-26',
      prices(date) {
        const open = date < '2026-05-21' ? 10 : Number(afterSplit);
        return { open, high: open + 0.1, low: open - 0.1, close: open };
      },
    });
    const strategy = f.input.strategy;
    if (strategy.execution.timing !== 'dailyBarOrders') throw new Error('fixture');
    const [buy, , stop] = strategy.execution.orders;
    buy!.order = { kind: 'limit', price: { type: 'constant', value: '10' } };
    stop!.exitGroup = 'protection';
    strategy.execution.orders.push({
      ...stop!,
      id: 'profit',
      action: { kind: 'takeProfit' },
      order: { kind: 'limit', price: { type: 'constant', value: '11' } },
    });
    strategy.tradePlan = {
      version: 1,
      evaluation: 'barClose',
      stages: [],
      cooldown: { bars: 5, stopBars: 5 },
    };
    f.input.strategyVersionHash = hashCanonicalManifest(strategy);
    const base = {
      symbol: '600519.SH',
      market: 'CN',
      instrumentType: 'STOCK',
      provider: 'fixture-actions',
      providerRevision: 'actions-r1',
      availableAt: '2026-05-18T00:00:00Z',
    } as const;
    const facts: CorporateActionFact[] = [
      {
        ...base,
        type: 'SPLIT',
        ratio: '2',
        recordDate: '2026-05-20',
        effectiveDate: '2026-05-21',
        occurredAt: '2026-05-21T00:00:00+08:00',
      },
      {
        ...base,
        type: 'CASH_DIVIDEND',
        cashAmount: '0.1',
        currency: 'CNY',
        recordDate: '2026-05-19',
        effectiveDate: '2026-05-20',
        paymentDate: '2026-05-22',
        occurredAt: '2026-05-20T00:00:00+08:00',
      },
    ];
    const events = snapshotEventDsaFixture({ facts });
    const policy = await events.effectiveControlPolicyV3();
    Object.assign(policy.projection.effective, { revision: 7, sourceDesiredRevision: 7 });
    events.effectiveControlPolicyV3.mockResolvedValue(policy);
    const catalog = await events.marketRouteCatalogV3();
    events.marketRouteCatalogV3.mockResolvedValue({ ...catalog, catalogRevision: 12 });
    const getEvents = events.marketEventsV3.getMockImplementation()!;
    events.marketEventsV3.mockImplementation(async (request) => {
      const result = await getEvents(request);
      result.fetchedAt = '2026-05-26T08:00:00Z';
      result.admission!.validUntil = '2026-06-01T00:00:00Z';
      return result;
    });
    Object.assign(f.dsa, events);
    const snapshot = await freezeTradePlanFixture(root, f);
    expect(events.marketEventsV3).toHaveBeenCalledTimes(2);
    const readers = [
      f.reader.readV3,
      f.dsa.backtestCalendar,
      f.dsa.backtestInstrumentFacts,
      events.effectiveControlPolicyV3,
      events.marketRouteCatalogV3,
      events.marketEventsV3,
    ];
    for (const reader of readers) {
      reader.mockClear();
      reader.mockImplementation(() => {
        throw new Error('冻结后禁止访问来源');
      });
    }
    const result = await snapshot.run();
    expect(await snapshot.run()).toEqual(result);
    if (process.env.DAILY_ACTION_REPLAY_DIR)
      await writeFile(join(root, 'worker.json'), JSON.stringify(result, null, 2));
    for (const reader of readers) expect(reader).not.toHaveBeenCalled();
    const orders = result.dailyOrders!.orders;
    expect(orders.find((o) => o.templateId === 'buy')).toMatchObject({
      quantity: '5400',
      filledQuantity: '4000',
      remainingQuantity: '1400',
      state: 'cancelled',
      price: { price: '5' },
    });
    expect(orders.find((o) => o.templateId === 'profit')).toMatchObject({
      state: 'cancelled',
      price: { price: '5.5' },
    });
    if (afterSplit === '4.8') {
      expect(result.rejectedOrders).toMatchObject([
        {
          orderId: orders.find((o) => o.templateId === 'stop')!.id,
          side: 'sell',
          reasonCode: 'RULE_REJECTED',
          message: expect.stringContaining('INVALID_TICK'),
        },
      ]);
      expect(result.completeness).toBe('unavailable');
      expect(result.equityCurve.at(-1)?.value.amount).toBe('999293.8');
      return;
    }
    expect(snapshot.execute().analytics.completeness).toBe('complete');
    expect(result.rejectedOrders).toEqual([]);
    expect(result.dailyOrders!.exits[orders[0]!.id]).toBe('4000');
    expect(orders.find((o) => o.templateId === 'stop')).toMatchObject({
      state: 'filled',
      filledQuantity: '4000',
      price: { price: '4.85' },
    });
    const fills = result.simulationFills;
    expect(
      fills.map((f) => [
        f.side,
        f.quantity,
        f.price,
        f.occurredAt.slice(8, 10),
        f.charges.map((c) => c.amount),
      ]),
    ).toEqual([
      ['buy', '1000', '10', '19', ['5', '0.1']],
      ['buy', '1000', '10', '20', ['1', '0.1']],
      ['sell', '1000', '3.996', '21', ['5', '2', '0.04']],
      ['sell', '1000', '3.996', '22', ['0', '2', '0.04']],
      ['sell', '1000', '3.996', '25', ['0', '2', '0.04']],
      ['sell', '1000', '3.996', '26', ['0', '2', '0.04']],
    ]);
    expect(result.trades).toMatchObject([
      {
        entryQuantity: '4000',
        exitQuantity: '4000',
        entryValue: { amount: '20000' },
        exitValue: { amount: '15984' },
        realizedPnl: { amount: '-4035.36' },
        closedAt: fills.at(-1)!.occurredAt,
        fillIds: fills.map((f) => f.fillId),
      },
    ]);
    // 100 万初始现金，加登记的分红 100，再计闭合买卖净亏损。
    expect(result.equityCurve.at(-1)?.value.amount).toBe('996064.64');
    expect(result.warnings).toContain('BENCHMARK_RAW_ACTIONS_UNSUPPORTED');
    expect(result.completeness).toBe('partial');
  } finally {
    if (!process.env.DAILY_ACTION_REPLAY_DIR) await rm(root, { recursive: true, force: true });
  }
});
