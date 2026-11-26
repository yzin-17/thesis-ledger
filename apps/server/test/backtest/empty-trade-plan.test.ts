import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { DecimalValue as D } from '@thesis-ledger/domain';
import { tradePlanSnapshot } from './trade-plan-snapshot.fixture.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';

it('开盘跳空的正式冻结 Runner：空计划与无计划数量、权益和完整结果一致', async () => {
  const root = await mkdtemp(join(tmpdir(), 'empty-trade-plan-'));
  try {
    const { input } = await completeSnapshotFixture();
    const strategy = input.strategy;
    strategy.entry = { type: 'not', expression: { type: 'positionState', field: 'isOpen' } };
    strategy.exit = {
      type: 'compare',
      operator: 'eq',
      left: { type: 'constant', value: '0' },
      right: { type: 'constant', value: '1' },
    };
    strategy.sizing = { type: 'percentOfEquity', percent: '0.5' };
    strategy.cost = { commissionRate: '0', slippageRate: '0' };
    strategy.risk = [];
    delete strategy.tradePlan;
    const scenario = {
      dates: ['2026-05-18', '2026-05-19', '2026-05-20'],
      closes: [10, 15, 16],
      opens: [10, 20, 15],
    };
    const absent = await tradePlanSnapshot(
      join(root, 'absent'),
      structuredClone(strategy),
      scenario,
    );
    const empty = await tradePlanSnapshot(
      join(root, 'empty'),
      {
        ...structuredClone(strategy),
        tradePlan: { version: 1, evaluation: 'barClose', stages: [] },
      },
      scenario,
    );
    const a = await absent.run(),
      b = await empty.run();
    expect(a.simulationFills).toHaveLength(1);
    expect(a.simulationFills[0]!.price).toBe('20');
    const fill = a.simulationFills[0]!;
    const spent = D.from(fill.quantity)
      .times(fill.price)
      .plus(fill.charges.reduce((sum, fee) => sum.plus(fee.amount), D.from('0')));
    expect(
      spent.compareTo(D.from(input.runConfig.initialCash.CNY!).times('0.5')),
    ).toBeLessThanOrEqual(0);
    for (const field of [
      'simulationFills',
      'equityCurve',
      'metrics',
      'drawdownCurve',
      'rejectedOrders',
      'warnings',
    ] as const)
      expect(b[field]).toEqual(a[field]);
    expect(await empty.run()).toEqual(b);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
