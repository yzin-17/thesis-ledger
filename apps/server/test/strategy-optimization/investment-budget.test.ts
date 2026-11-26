import 'reflect-metadata';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { DecimalValue as D, type SimulationFillRecord } from '@thesis-ledger/domain';
import type { BacktestStrategy, BacktestResultV3 } from '@thesis-ledger/schemas';
import { StrategyOptimizationRunService } from '../../src/strategy-optimization/strategy-optimization-run.service.js';
import { tradePlanSnapshot } from '../backtest/trade-plan-snapshot.fixture.js';
import { fixedVolatilityPlan } from '../backtest/volatility-target.fixture.js';

const scenario = {
  dates: [
    '2026-05-18',
    '2026-05-19',
    '2026-05-20',
    '2026-05-21',
    '2026-05-22',
    '2026-05-25',
    '2026-05-26',
    '2026-05-27',
  ],
  closes: [10, 11, 10, 13, 12, 11, 12, 12],
  opens: [10, 11, 12, 11, 14, 13, 12, 13],
};

function strategyFor(kind: string): BacktestStrategy {
  const strategy = fixedVolatilityPlan(false);
  strategy.cost.slippageRate = '0.01';
  if (kind === 'ordinary') delete strategy.tradePlan;
  if (kind === 'add') {
    strategy.sizing = { type: 'percentOfEquity', percent: '0.1' };
    strategy.tradePlan!.stages = [
      {
        id: 'add',
        trigger: { kind: 'gainPercent', value: '0.01' },
        action: { kind: 'add', initialFraction: '1', maxEquityFraction: '0.15' },
      },
    ];
  }
  if (kind === 'risk') {
    strategy.tradePlan!.initialStop = { kind: 'percent', percent: '0.03' };
    strategy.tradePlan!.riskBudget = { equityFraction: '0.1', maxEquityFraction: '0.5' };
  }
  if (kind === 'volatility') {
    strategy.tradePlan!.volatilityTarget = {
      returnPeriods: 2,
      targetAnnualVolatility: '0.1',
      maxEquityFraction: '0.5',
      annualizationPeriods: 252,
      returnKind: 'simple',
      variance: 'sample',
      update: 'dailyClose',
    };
  }
  return strategy;
}

// 独立从信号前完整收盘计算动态目标，不读取引擎预算函数或其诊断字段。
function targetAt(index: number) {
  // fixture 的区间前预热收盘固定为 10。
  const closes = [10, 10, 10, ...scenario.closes].slice(index, index + 3).map(String);
  expect(closes).toHaveLength(3);
  const returns = closes
    .slice(1)
    .map((p, i) => Number(D.from(p).dividedBy(closes[i]!, 40).minus('1').toString()));
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const annual = Math.sqrt(returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) * 252);
  const weight = D.from('0.1').dividedBy(D.fromNumber(annual), 40);
  return weight.compareTo('0.5') < 0 ? weight : D.from('0.5');
}

function verify(fills: readonly SimulationFillRecord[], initial: string, kind: string) {
  let cash = D.from(initial),
    held = D.from('0'),
    buys = 0,
    dynamicBuys = 0;
  for (const fill of fills) {
    const index = scenario.dates.indexOf(fill.occurredAt.slice(0, 10));
    expect(index).toBeGreaterThanOrEqual(0);
    const raw = D.from(String(scenario.opens[index]!));
    const occupied = held.times(raw),
      equity = cash.plus(occupied);
    const fees = fill.charges.reduce((sum, fee) => sum.plus(fee.amount), D.from('0'));
    const amount = D.from(fill.quantity).times(fill.price);
    if (fill.side === 'buy') {
      buys++;
      expect(fees.isPositive()).toBe(true);
      expect(D.from(fill.price).compareTo(raw)).toBeGreaterThan(0);
      let fraction = D.from('0.5');
      if (kind === 'add') fraction = D.from(buys === 1 ? '0.1' : '0.15');
      if (kind === 'volatility') {
        fraction = targetAt(index);
        if (fraction.compareTo('0.5') < 0) dynamicBuys++;
      }
      const spent = amount.plus(fees);
      const total = kind === 'ordinary' ? spent : occupied.plus(spent);
      expect(total.compareTo(equity.times(fraction))).toBeLessThanOrEqual(0);
      cash = cash.minus(spent);
      held = held.plus(fill.quantity);
    } else {
      cash = cash.plus(amount).minus(fees);
      held = held.minus(fill.quantity);
    }
  }
  expect(buys).toBeGreaterThan(0);
  if (kind === 'add' || kind === 'volatility') expect(buys).toBeGreaterThan(1);
  if (kind === 'volatility') {
    expect(fills.some((f) => f.side === 'sell')).toBe(true);
    expect(dynamicBuys).toBeGreaterThan(0);
  }
}

it.each(['ordinary', 'add', 'risk', 'volatility'])(
  '普通回测与实验三段执行共用冻结 Runner，%s 买入逐笔遵守含费用及滑点上限',
  async (kind) => {
    const root = await mkdtemp(join(tmpdir(), 'optimization-investment-'));
    try {
      const snapshot = await tradePlanSnapshot(root, strategyFor(kind), scenario);
      const config = snapshot.fixture.input.runConfig;
      const normal = await snapshot.run();
      verify(normal.simulationFills, config.initialCash.CNY!, kind);

      // 仅持久化、预检和队列用受控替身；真实实验 executeRun 调用冻结 Runner。
      let result: BacktestResultV3 | undefined;
      const job = { id: snapshot.fixture.input.runId, status: 'queued' as string };
      const backtests = {
        createRun: vi.fn(async () => ({ ...job, status: 'queued' })),
        runCurrentRunForRead: vi.fn(async () => {
          result = await snapshot.run();
          job.status = 'succeeded';
        }),
        status: vi.fn(async () => ({ ...job, result })),
      };
      const configured = {
        resolve: vi.fn(async (strategyVersionId, runConfig, idempotencyKey) => ({
          kind: 'prepared',
          input: { strategyVersionId, runConfig, idempotencyKey },
        })),
      };
      const service = new StrategyOptimizationRunService(
        { $executeRaw: vi.fn() } as never,
        backtests as never,
        configured as never,
      );
      vi.spyOn(service, 'reserveBudget').mockResolvedValue(undefined);
      const range = { start: config.startDate, end: config.endDate };
      const experiment = {
        id: 'controlled-investment',
        runConfig: config,
        split: { development: range, validation: range, test: range },
        createdAt: new Date(),
        budget: { maxDurationSeconds: 600 },
        pausedDurationMs: 0,
      };
      for (const split of ['development', 'validation', 'test'] as const) {
        const run = await service.executeRun(
          experiment as never,
          snapshot.fixture.input.strategyVersionId,
          split,
          'candidate:controlled',
        );
        expect(run.result).toEqual(normal);
        verify(
          (run.result as unknown as BacktestResultV3).simulationFills,
          config.initialCash.CNY!,
          kind,
        );
        expect(configured.resolve).toHaveBeenLastCalledWith(
          snapshot.fixture.input.strategyVersionId,
          config,
          `optimization:controlled-investment:candidate:controlled:${split}`,
          { rebindStrategyInputs: true },
        );
        expect(backtests.createRun).toHaveBeenLastCalledWith({
          strategyVersionId: snapshot.fixture.input.strategyVersionId,
          runConfig: config,
          idempotencyKey: `optimization:controlled-investment:candidate:controlled:${split}`,
        });
      }
      expect(backtests.runCurrentRunForRead).toHaveBeenCalledTimes(3);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  60000,
);
