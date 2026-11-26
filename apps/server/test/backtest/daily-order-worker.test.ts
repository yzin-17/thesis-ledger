import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  strategySchema,
  validateStrategyRunConfig,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import {
  dailyOrderSnapshot,
  dailyOrderStrategy,
  dailyPolicy,
} from './daily-order-worker.fixture.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { tradePlanSnapshot } from './trade-plan-snapshot.fixture.js';
import { dailyOrderRawSnapshot } from './daily-order-raw-snapshot.fixture.js';

it('日线委托须在正式运行配置明确政策，旧市价配置不受影响', async () => {
  const f = await completeSnapshotFixture(),
    strategy = await dailyOrderStrategy();
  expect(validateStrategyRunConfig(f.input.strategy, f.input.runConfig).valid).toBe(true);
  expect(validateStrategyRunConfig(strategy, f.input.runConfig)).toMatchObject({
    valid: false,
    errors: [{ path: ['runConfig', 'dailyOrderMatching'] }],
  });
  expect(
    validateStrategyRunConfig(strategy, { ...f.input.runConfig, dailyOrderMatching: dailyPolicy })
      .valid,
  ).toBe(true);
});

it.each(['eachFill', 'fullFill'] as const)(
  '冻结 Worker：首单部分成交到期后分档退出，保护方式 %s',
  async (activation) => {
    const root = await mkdtemp(join(tmpdir(), 'daily-order-stage-'));
    try {
      const strategy = await dailyOrderStrategy(true);
      if (strategy.execution.timing !== 'dailyBarOrders') throw new Error('fixture');
      strategy.execution.orders[0]!.validity = { kind: 'DAY' };
      for (const order of strategy.execution.orders)
        if (order.parent) order.parent.activation = activation;
      strategy.tradePlan = {
        version: 1,
        evaluation: 'barClose',
        stages: [
          {
            id: 'reduce',
            trigger: { kind: 'gainPercent', value: '0.1' },
            action: { kind: 'reduce', basis: 'initialQuantity', fraction: '0.4' },
          },
        ],
      };
      strategy.execution.orders.push({
        id: 'stage',
        action: { kind: 'stage', stageId: 'reduce' },
        order: { kind: 'market' },
        validity: { kind: 'DAY' },
      });
      const f = await tradePlanSnapshot(root, strategySchema.parse(strategy) as BacktestStrategy, {
        dates: ['2026-05-18', '2026-05-19', '2026-05-20'],
        closes: [10, 11, 11],
        opens: [10, 10, 11],
        intrabarRange: 0.5,
        dailyOrderMatching: dailyPolicy,
      });
      const worker = await f.run();
      expect(worker.completeness).toBe('complete');
      expect(worker.simulationFills?.map((fill) => [fill.side, fill.quantity])).toEqual([
        ['buy', '100'],
        ['sell', '40'],
      ]);
      const stop = worker.dailyOrders?.orders.find((order) => order.templateId === 'stop');
      expect(stop).toMatchObject({
        state: 'cancelled',
        quantity: activation === 'eachFill' ? '60' : '0',
        remainingQuantity: activation === 'eachFill' ? '60' : '0',
      });
      expect(worker.dailyOrders?.orders.find((order) => order.templateId === 'buy')).toMatchObject({
        state: 'expired',
        filledQuantity: '100',
      });
      expect(await f.run()).toEqual(worker);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
it.each([false, true])(
  '正式冻结 Worker：两根限价／附属保护 %s，原始订单状态和完整回放一致',
  async (protection) => {
    const root = await mkdtemp(join(tmpdir(), 'daily-order-worker-'));
    try {
      const f = await dailyOrderSnapshot(root, protection);
      const vertical = f.execute();
      expect(vertical.fills.map((fill) => [fill.side, fill.quantity, fill.price])).toEqual(
        protection
          ? [
              ['buy', '100', '9.5'],
              ['sell', '100', '8.4915'],
            ]
          : [
              ['buy', '100', '9.5'],
              ['buy', '100', '9.5'],
            ],
      );
      expect(vertical.rejects).toEqual([]);
      expect(f.execute()).toEqual(vertical);
      const worker = await f.run();
      expect(worker.completeness).toBe('complete');
      expect(worker.dailyOrders?.matching).toEqual(dailyPolicy);
    if (!protection) expect(worker.simulationFills.map(fill => fill.charges[0]?.amount)).toEqual(['5', '0']);
      expect(worker.dailyOrders?.orders[0]).toMatchObject({
        state: protection ? 'cancelled' : 'expired',
        filledQuantity: protection ? '100' : '200',
        quantityBasis: 'normalized-units',
      });

      expect(await f.run()).toEqual(worker);
      expect(f.fixture.reader.readV3.mock.calls.length).toBeGreaterThan(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

it('原价实际股数的冻结 Worker：共享额度部分成交、T+1 与已触发止损余单', async () => {
  const root = await mkdtemp(join(tmpdir(), 'daily-order-raw-'));
  try {
    const f = await dailyOrderRawSnapshot(root), result = await f.run();
    expect(result.simulationFills.map(fill => [fill.side, fill.quantity, fill.price, fill.occurredAt.slice(0, 10)])).toEqual([
      ['buy', '1000', '10.01', '2026-05-19'], ['sell', '1000', '9.99', '2026-05-20'],
    ]);
    expect(result.dailyOrders?.orders.find(order => order.templateId === 'buy')).toMatchObject({ state: 'cancelled', filledQuantity: '1000', remainingQuantity: '1700', quantityBasis: 'actual-units' });
    expect(result.dailyOrders?.orders.find(order => order.templateId === 'stop')).toMatchObject({ state: 'filled', triggeredAt: { phase: 'range' } });
    expect(await f.run()).toEqual(result);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it.each(['eachFill', 'fullFill'] as const)('整笔日线冻结回放，建仓成交后保护 %s', async activation => {
  const root = await mkdtemp(join(tmpdir(), 'daily-whole-order-'));
  try {
    const strategy = await dailyOrderStrategy(true);
    if (strategy.execution.timing !== 'dailyBarOrders') throw new Error('fixture');
    for (const order of strategy.execution.orders)
      if (order.parent) order.parent.activation = activation;
    const snapshot = await tradePlanSnapshot(root, strategy, {
      dates: ['2026-05-18', '2026-05-19', '2026-05-20'],
      opens: [10, 9.2, 8.5], closes: [10, 10, 10], intrabarRange: 0.1,
      dailyOrderMatching: { ...dailyPolicy, liquidity: { kind: 'wholeOrder' } },
    });
    const result = await snapshot.run();
    const fills = result.simulationFills;
    expect(fills.map(f => [f.side, f.occurredAt.slice(0, 10)])).toEqual([
      ['buy', '2026-05-19'], ['sell', '2026-05-20'],
    ]);
    expect(fills[0]!.quantity).toBe(fills[1]!.quantity);
    expect(result.dailyOrders!.orders.find(o => o.templateId === 'buy')?.state).toBe('filled');
    expect(await snapshot.run()).toEqual(result);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
