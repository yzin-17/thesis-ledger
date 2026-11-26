import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { DecimalValue as D, type SimulationFillRecord } from '@thesis-ledger/domain';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { tradePlanSnapshot } from './trade-plan-snapshot.fixture.js';
import { fixedVolatilityPlan, volatilityScenario } from './volatility-target.fixture.js';

function verifyBudget(
  fills: readonly SimulationFillRecord[],
  initial: string,
  opens: Map<string, number>,
  fraction: string,
  position: boolean,
) {
  let cash = D.from(initial),
    held = D.from('0');
  for (const fill of fills) {
    const price = D.from(String(opens.get(fill.occurredAt.slice(0, 10))!));
    const equity = cash.plus(held.times(price));
    const fees = fill.charges.reduce((sum, fee) => sum.plus(fee.amount), D.from('0'));
    const amount = D.from(fill.quantity).times(fill.price);
    if (fill.side === 'buy') {
      const spent = amount.plus(fees);
      expect(
        spent.plus(position ? held.times(price) : '0').compareTo(equity.times(fraction)),
      ).toBeLessThanOrEqual(0);
      cash = cash.minus(spent);
      held = held.plus(fill.quantity);
    } else {
      cash = cash.plus(amount).minus(fees);
      held = held.minus(fill.quantity);
    }
  }
}

it('归一化冻结 Runner：高开含滑点和费用不超50%；保护与阶段退出不改变普通入场', async () => {
  const root = await mkdtemp(join(tmpdir(), 'investment-protection-'));
  try {
    const { input } = await completeSnapshotFixture();
    const base = input.strategy;
    base.entry = { type: 'not', expression: { type: 'positionState', field: 'isOpen' } };
    base.exit = {
      type: 'compare',
      operator: 'eq',
      left: { type: 'constant', value: '0' },
      right: { type: 'constant', value: '1' },
    };
    base.risk = [];
    base.sizing = { type: 'percentOfEquity', percent: '0.5' };
    base.cost = {
      commissionRate: '0.001',
      slippageRate: '0.01',
      minimumCommission: { amount: '100', currency: 'CNY' },
    };
    delete base.tradePlan;
    const scenario = {
      dates: ['2026-05-18', '2026-05-19', '2026-05-20'],
      closes: [10, 11, 11],
      opens: [10, 11, 11],
    };
    const plans = [
      undefined,
      {
        version: 1 as const,
        evaluation: 'barClose' as const,
        stages: [],
        initialStop: { kind: 'percent' as const, percent: '0.03' },
      },
      {
        version: 1 as const,
        evaluation: 'barClose' as const,
        stages: [],
        trailing: { drawdownPercent: '0.05' },
        cooldown: { bars: 2, stopBars: 3 },
      },
      {
        version: 1 as const,
        evaluation: 'barClose' as const,
        stages: [
          {
            id: 'half',
            trigger: { kind: 'gainPercent' as const, value: '0.5' },
            action: { kind: 'reduce' as const, basis: 'initialQuantity' as const, fraction: '0.5' },
          },
        ],
      },
    ];
    const first = [];
    for (const [i, plan] of plans.entries()) {
      const strategy = structuredClone(base);
      if (plan) strategy.tradePlan = plan;
      const snapshot = await tradePlanSnapshot(join(root, String(i)), strategy, scenario);
      const result = await snapshot.run();
      expect(result.simulationFills[0]!.side).toBe('buy');
      verifyBudget(
        result.simulationFills,
        input.runConfig.initialCash.CNY!,
        new Map(scenario.dates.map((d, j) => [d, scenario.opens[j]!])),
        '0.5',
        false,
      );
      expect(await snapshot.run()).toEqual(result);
      first.push(result.simulationFills[0]!.quantity);
    }
    expect(new Set(first).size).toBe(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('风险预算高开封顶、低开不放大；加仓计入已有持仓占用', async () => {
  const root = await mkdtemp(join(tmpdir(), 'investment-plans-'));
  try {
    const { input } = await completeSnapshotFixture();
    const strategy = fixedVolatilityPlan(false);
    strategy.cost = { commissionRate: '0.001', slippageRate: '0.01' };
    strategy.tradePlan = {
      version: 1,
      evaluation: 'barClose',
      stages: [],
      initialStop: { kind: 'percent', percent: '0.03' },
      riskBudget: { equityFraction: '0.1', maxEquityFraction: '0.5' },
    };
    for (const open of [5, 11, 30]) {
      const scenario = {
        dates: ['2026-05-18', '2026-05-19', '2026-05-20'],
        closes: [10, 10, 10],
        opens: [10, open, open],
      };
      const snapshot = await tradePlanSnapshot(join(root, String(open)), strategy, scenario);
      const result = await snapshot.run();
      expect(result.simulationFills[0]!.side).toBe('buy');
      verifyBudget(
        result.simulationFills,
        input.runConfig.initialCash.CNY!,
        new Map(scenario.dates.map((d, j) => [d, scenario.opens[j]!])),
        '0.5',
        true,
      );
      if (open === 5)
        expect(result.simulationFills[0]!.quantity).toBe(
          D.from(input.runConfig.initialCash.CNY!).times('0.5').dividedBy('10').toString(),
        );
    }
    strategy.sizing = { type: 'percentOfEquity', percent: '0.1' };
    strategy.tradePlan = {
      version: 1,
      evaluation: 'barClose',
      stages: [
        {
          id: 'add',
          trigger: { kind: 'gainPercent', value: '0.01' },
          action: { kind: 'add', initialFraction: '1', maxEquityFraction: '0.15' },
        },
      ],
    };
    const scenario = {
      dates: ['2026-05-18', '2026-05-19', '2026-05-20', '2026-05-21'],
      closes: [10, 11, 12, 12],
      opens: [10, 10, 12, 12],
    };
    const sample = await tradePlanSnapshot(join(root, 'add'), strategy, scenario);
    const result = await sample.run();
    expect(result.simulationFills.filter((f) => f.side === 'buy').length).toBeGreaterThan(1);
    verifyBudget(
      result.simulationFills,
      input.runConfig.initialCash.CNY!,
      new Map(scenario.dates.map((d, j) => [d, scenario.opens[j]!])),
      '0.15',
      true,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('每日波动率目标在冻结收盘决策，所有买入含费用与滑点后总投入不超上限', async () => {
  const root = await mkdtemp(join(tmpdir(), 'investment-volatility-'));
  try {
    const strategy = fixedVolatilityPlan(true);
    strategy.cost = { commissionRate: '0.001', slippageRate: '0.01' };
    const scenario = {
      ...volatilityScenario,
      opens: volatilityScenario.closes.map(
        (_, i) => (volatilityScenario.closes[Math.max(0, i - 1)] ?? 10) * 1.03,
      ),
    };
    const snapshot = await tradePlanSnapshot(root, strategy, scenario);
    const result = await snapshot.run();
    expect(result.simulationFills.some((f) => f.side === 'sell')).toBe(true);
    expect(result.simulationFills.filter((f) => f.side === 'buy').length).toBeGreaterThan(1);
    verifyBudget(
      result.simulationFills,
      snapshot.fixture.input.runConfig.initialCash.CNY!,
      new Map(scenario.dates.map((d, i) => [d, scenario.opens[i]!])),
      '0.5',
      true,
    );
    expect(await snapshot.run()).toEqual(result);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
