import { describe, expect, it } from 'vitest';
import {
  BacktestTradePlanRuntime,
  backtestStrategyPlanReadback,
  type BacktestTradePlan,
  type BooleanExpression,
  type SimulationExpressionContext,
} from '../src/index.js';
import { sourceSeries } from './backtest-simulation.fixtures.js';

const at = (i: number) => new Date(Date.UTC(2026, 8, 8, 1, 35 + i * 10)).toISOString();
const condition: BooleanExpression = {
  type: 'compare',
  operator: 'gt',
  left: { type: 'series', sourceId: 'arm', field: 'close' },
  right: { type: 'constant', value: '0' },
};
const base = (patch: Partial<BacktestTradePlan>): BacktestTradePlan => ({
  version: 1,
  evaluation: 'barClose',
  stages: [],
  ...patch,
});
function setupPlan(
  plan: BacktestTradePlan,
  prices: string[],
  flags: string[],
  future = -1,
  missingClose = -1,
) {
  const series = (values: string[]) =>
    sourceSeries(
      values.map((value, i) => ({
        occurredAt: at(i),
        availableAt: i === future ? at(i + 1) : at(i),
        value,
        status: 'available' as const,
      })),
    );
  const r = new BacktestTradePlanRuntime(
    plan,
    {
      ...series(prices),
      points: prices.flatMap((value, i) =>
        i === missingClose
          ? []
          : [
              {
                occurredAt: at(i),
                availableAt: at(i),
                value,
                status: 'available' as const,
              },
            ],
      ),
    },
    prices.map((_, i) => at(i)),
  );
  const select = (i: number, held = '10') =>
    r.select(
      {
        tick: { occurredAt: at(i) },
        sourceSeries: new Map([['arm', series(flags)]]),
        positionState: {
          isOpen: held !== '0',
          quantity: held,
          averageCost: '100',
          holdingPeriods: i,
          availableAt: at(i),
        },
      } satisfies SimulationExpressionContext,
      {
        state: {},
        entry: { status: 'available', value: true, occurredAt: at(i), availableAt: at(i) },
        exit: { status: 'available', value: false, occurredAt: at(i), availableAt: at(i) },
      },
    );
  const accept = (signal: NonNullable<ReturnType<typeof select>>, i: number, held = '10') => {
    const orderId = signal.signalId + ':order';
    r.registerOrder(orderId, signal.signalId);
    const fill = {
      fillId: signal.signalId + ':fill',
      orderId,
      executionSymbol: '600519.SH',
      side: signal.kind === 'entry' ? ('buy' as const) : ('sell' as const),
      quantity: '10',
      price: '100',
      charges: [],
      occurredAt: at(i),
      availableAt: at(i),
      reason: 'signal' as const,
    };
    r.accept(fill, held);
    r.accept(fill, held);
  };
  accept(select(0, '0')!, 0);
  return { r, select, accept };
}

describe.each([false, true])('每条保护条件在持仓周期内永久启用，显式方式=%s', (explicit) => {
  const asFormat = (plan: BacktestTradePlan) => {
    const copy = structuredClone(plan);
    if (explicit)
      for (const key of ['initialStop', 'trailing'] as const) {
        const rule = copy[key];
        if (!rule) continue;
        rule.activation = rule.activateWhen
          ? { kind: 'condition', condition: rule.activateWhen }
          : { kind: 'immediate' };
        delete rule.activateWhen;
      }
    return copy;
  };
  const setup = (
    plan: BacktestTradePlan,
    prices: string[],
    flags: string[],
    future = -1,
    missingClose = -1,
  ) => setupPlan(asFormat(plan), prices, flags, future, missingClose);
  it('本期缺有效收盘时不能借旧价格启用保护或触发交易', () => {
    const { r, select } = setup(
      base({ initialStop: { kind: 'percent', percent: '0.05', activateWhen: condition } }),
      ['100', '90', '100'],
      ['0', '1', '0'],
      -1,
      1,
    );
    expect(select(1)).toBeUndefined();
    expect(r.snapshot().initialStopArmed).toBe(false);
    expect(r.diagnostics.join()).toContain('PRICE_UNAVAILABLE');
    select(2);
    expect(r.snapshot().initialStopArmed).toBe(false);
  });
  it('启用前不止损；启用锚定首次成交，转假后仍保护，全部平仓再重置', () => {
    const { r, select, accept } = setup(
      base({ initialStop: { kind: 'percent', percent: '0.05', activateWhen: condition } }),
      ['100', '94', '110', '96', '94', '100', '90'],
      ['0', '0', '1', '0', '0', '0', '0'],
    );
    expect(select(1)).toBeUndefined();
    expect(r.snapshot().stopLine).toBeUndefined();
    select(2);
    expect(r.snapshot()).toMatchObject({ initialStopArmed: true, stopLine: '95' });
    expect(select(3)).toBeUndefined();
    const stop = select(4)!;
    expect(stop.kind).toBe('risk');
    accept(stop, 4, '0');
    accept(select(5, '0')!, 5);
    expect(select(6)).toBeUndefined();
    expect(r.snapshot()).toMatchObject({ cycle: 2, initialStopArmed: false });
    expect(r.snapshot().stopLine).toBeUndefined();
  });
  it('条件不可见不启用追踪，也不阻断已有无条件初始保护', () => {
    const { r, select } = setup(
      base({
        initialStop: { kind: 'percent', percent: '0.05' },
        trailing: { drawdownPercent: '0.02', activateWhen: condition },
      }),
      ['100', '94'],
      ['0', '1'],
      1,
    );
    expect(select(1)?.kind).toBe('risk');
    expect(r.snapshot().trailingArmed).toBe(false);
    expect(r.snapshot().stopLine).toBe('95');
  });
  it('条件启用记忆与盈利门槛同时满足；持仓历史峰值不因启用而重置', () => {
    const { r, select } = setup(
      base({
        trailing: {
          drawdownPercent: '0.05',
          activateWhen: condition,
          activationGainPercent: '0.1',
        },
      }),
      ['100', '105', '120', '113'],
      ['0', '1', '0', '0'],
    );
    select(1);
    expect(r.snapshot().trailingArmed).toBe(true);
    expect(r.snapshot().stopLine).toBeUndefined();
    select(2);
    expect(r.snapshot().stopLine).toBe('114');
    expect(select(3)?.kind).toBe('risk');
  });
  it('加仓待成交期间仍记住条件与峰值；拒单不会撤销，部分退出也不重置', () => {
    const { r, select, accept } = setup(
      base({
        trailing: { drawdownPercent: '0.05', activateWhen: condition },
        stages: [
          {
            id: 'add',
            trigger: { kind: 'gainPercent', value: '0.01' },
            action: { kind: 'add', initialFraction: '1', maxEquityFraction: '1' },
          },
        ],
      }),
      ['100', '102', '120', '113', '112'],
      ['0', '0', '1', '0', '0'],
    );
    const pending = select(1)!;
    r.registerOrder('pending-add', pending.signalId);
    expect(select(2)).toBeUndefined();
    expect(r.snapshot()).toMatchObject({ trailingArmed: true, stopLine: '114' });
    r.reject('pending-add');
    const exit = select(3)!;
    expect(exit.kind).toBe('risk');
    accept(exit, 3, '6');
    expect(r.snapshot()).toMatchObject({ trailingArmed: true, initialQuantity: '10' });
    expect(select(4)?.kind).toBe('risk');
  });
  it('中文逐条回读条件、持仓内永久启用和无保护区间', () => {
    const plan = base({
      initialStop: { kind: 'percent', percent: '0.05', activateWhen: condition },
    });
    const text = backtestStrategyPlanReadback({
      entry: condition,
      exit: condition,
      sizing: { type: 'percentOfEquity', percent: '0.25' },
      risk: [],
      tradePlan: asFormat(plan),
    }).join('\n');
    expect(text).toContain('初始止损启用条件：收盘价高于0');
    expect(text).toContain('未启用前没有该条保护');
    expect(text).toContain('条件转假或不可用也不撤销');
  });
});
