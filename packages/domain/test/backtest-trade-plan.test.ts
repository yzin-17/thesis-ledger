import { describe, expect, it } from 'vitest';
import {
  BacktestTradePlanRuntime,
  tradePlanSizing,
  runExchangeSimulation,
  type BacktestTradePlan,
  type SimulationExpressionContext,
  type SimulationFillRecord,
} from '../src/index.js';
import {
  exchangeRunInput,
  exchangeBar,
  sourceSeries,
  compare,
  frozenExchangeExecutionModel,
} from './backtest-simulation.fixtures.js';
import { tradePlanIndicatorExpressions } from '../src/backtest-trade-plan-runtime.js';
import { numericExpressionKey } from '../src/backtest-simulation-evaluator.js';
const at = (n: number) => new Date(Date.UTC(2026, 8, 8, 1, 35 + n * 10)).toISOString();
const plan = (patch: Partial<BacktestTradePlan> = {}): BacktestTradePlan => ({
  version: 1,
  evaluation: 'barClose',
  initialStop: { kind: 'percent', percent: '0.05' },
  stages: [],
  ...patch,
});
const prices = (values: string[]) => ({
  ...sourceSeries(
    values.map((value, n) => ({
      occurredAt: at(n),
      availableAt: at(n),
      value,
      status: 'available' as const,
    })),
  ),
  timeframe: '5m' as const,
});
const ctx = (n: number, quantity = '0'): SimulationExpressionContext => ({
  tick: { occurredAt: at(n) },
  sourceSeries: {},
  positionState: {
    isOpen: quantity !== '0',
    quantity,
    averageCost: '100',
    holdingPeriods: n,
    availableAt: at(n),
  },
});
const selection = (n: number) => ({
  state: {},
  entry: { status: 'available' as const, value: true, occurredAt: at(n), availableAt: at(n) },
  exit: { status: 'available' as const, value: false, occurredAt: at(n), availableAt: at(n) },
});
function accept(
  runtime: BacktestTradePlanRuntime,
  signal: NonNullable<ReturnType<BacktestTradePlanRuntime['select']>>,
  quantity: string,
  remaining: string,
  price: string,
  n: number,
) {
  const orderId = signal.signalId + ':order';
  runtime.registerOrder(orderId, signal.signalId);
  const fill: SimulationFillRecord = {
    fillId: orderId + ':' + quantity,
    orderId,
    executionSymbol: '600519.SH',
    side: signal.kind === 'entry' ? 'buy' : 'sell',
    quantity,
    price,
    charges: [],
    occurredAt: at(n),
    availableAt: at(n),
    reason: signal.kind === 'risk' ? 'risk' : 'signal',
  };
  runtime.accept(fill, remaining);
  return fill;
}

describe('策略交易计划：独立状态与实际成交', () => {
  it('即时固定保护使用首笔成交价，收盘恰好等于保护线触发退出', () => {
    const runtime = new BacktestTradePlanRuntime(plan({
      initialStop: { kind: 'percent', percent: '0.05', activation: { kind: 'immediate' } },
    }), prices(['103', '96.91', '96.9']), [0, 1, 2].map(at));
    accept(runtime, runtime.select(ctx(0), selection(0))!, '100', '100', '102', 0);
    expect(runtime.snapshot().stopLine).toBe('96.9');
    expect(runtime.select(ctx(1, '100'), selection(1))).toBeUndefined();
    expect(runtime.select(ctx(2, '100'), selection(2))?.kind).toBe('risk');
  });

  it('入场ATR按当时可见值冻结；缺失或未来输入不下单', () => {
    const p = plan({
      initialStop: { kind: 'entryAtr', sourceId: 'close', period: 2, multiple: '2' },
    });
    const r = new BacktestTradePlanRuntime(p, prices(['100', '105', '95']), [0, 1, 2].map(at));
    const key = numericExpressionKey(tradePlanIndicatorExpressions(p)[0]!);
    const indicators = new Map([[key, prices(['2', '20', '30'])]]);
    const enter = r.select({ ...ctx(0), indicatorSeries: indicators }, selection(0))!;
    accept(r, enter, '100', '100', '101', 0);
    expect(r.snapshot()).toMatchObject({ entryAtr: '2', stopLine: '97' });
    expect(
      r.select({ ...ctx(1, '100'), indicatorSeries: indicators }, selection(1)),
    ).toBeUndefined();
    expect(r.snapshot().stopLine).toBe('97');
    expect(r.select({ ...ctx(2, '100'), indicatorSeries: indicators }, selection(2))?.kind).toBe(
      'risk',
    );
    const missing = new BacktestTradePlanRuntime(p, prices(['100']), [at(0)]);
    expect(missing.select(ctx(0), selection(0))).toBeUndefined();
    expect(missing.diagnostics.join()).toContain('TRADE_PLAN_ATR_UNAVAILABLE');
    const future = new BacktestTradePlanRuntime(p, prices(['100']), [at(0)]);
    const delayed = {
      ...prices(['2']),
      points: [{ occurredAt: at(0), availableAt: at(1), value: '2', status: 'available' as const }],
    };
    expect(
      future.select({ ...ctx(0), indicatorSeries: new Map([[key, delayed]]) }, selection(0)),
    ).toBeUndefined();
  });
  it('峰值120的5%追踪线维持114；跳空成交110而非保证114', () => {
    const r = new BacktestTradePlanRuntime(
      plan({ trailing: { drawdownPercent: '0.05' } }),
      prices(['100', '120', '116', '110']),
      [0, 1, 2, 3].map(at),
    );
    accept(r, r.select(ctx(0), selection(0))!, '100', '100', '100', 0);
    expect(r.select(ctx(1, '100'), selection(1))).toBeUndefined();
    expect(r.snapshot().stopLine).toBe('114');
    expect(r.select(ctx(2, '100'), selection(2))).toBeUndefined();
    expect(r.snapshot().stopLine).toBe('114');
    const exit = r.select(ctx(3, '100'), selection(3))!;
    expect(exit.kind).toBe('risk');
    accept(r, exit, '100', '0', '110', 3);
    expect(r.snapshot()).toMatchObject({ initialQuantity: '0', lastCloseWasStop: true });
  });

  it('剩余数量阶段首次目标冻结；部分成交扣减，拒单不完成，不重复减半', () => {
    const p = plan({
      stages: [
        {
          id: 'half',
          trigger: { kind: 'gainPercent', value: '0.08' },
          action: { kind: 'reduce', basis: 'remainingQuantity', fraction: '0.5' },
        },
      ],
    });
    const r = new BacktestTradePlanRuntime(
      p,
      prices(['100', '110', '110', '110', '110']),
      [0, 1, 2, 3, 4].map(at),
    );
    accept(r, r.select(ctx(0), selection(0))!, '100', '100', '100', 0);
    const first = r.select(ctx(1, '100'), selection(1))!;
    expect(r.action({ ...first, intentId: 'i', side: 'sell', reason: 'signal' })).toMatchObject({
      quantity: '50',
    });
    const fill = accept(r, first, '20', '80', '110', 1);
    r.accept(fill, '80');
    const second = r.select(ctx(2, '80'), selection(2))!;
    expect(r.actions.get(second.signalId)?.quantity).toBe('30');
    r.registerOrder('rejected', second.signalId);
    r.reject('rejected');
    expect(r.snapshot().stageFilled.half).toBe('20');
    accept(r, r.select(ctx(3, '80'), selection(3))!, '30', '50', '110', 3);
    expect(r.select(ctx(4, '50'), selection(4))).toBeUndefined();
    expect(r.snapshot().stageFilled.half).toBe('50');
  });

  it('全部实际平仓后才冷却；不以止损意图或部分卖出启动', () => {
    const r = new BacktestTradePlanRuntime(
      plan({ cooldown: { bars: 1, stopBars: 2 } }),
      prices(['100', '94', '94', '100', '100', '100']),
      [0, 1, 2, 3, 4, 5].map(at),
    );
    accept(r, r.select(ctx(0), selection(0))!, '100', '100', '100', 0);
    const stop = r.select(ctx(1, '100'), selection(1))!;
    r.registerOrder('no-fill', stop.signalId);
    r.reject('no-fill');
    expect(r.snapshot().lastClosedIndex).toBeUndefined();
    const partial = r.select(ctx(2, '100'), selection(2))!;
    accept(r, partial, '40', '60', '94', 2);
    expect(r.snapshot().lastClosedIndex).toBeUndefined();
  });

});

describe('策略交易计划：仓位、阶段与事件执行', () => {
  it('风险预算10万×1%÷2=500，投入封顶、缺权益和零距离分别处理', () => {
    const p = plan({ riskBudget: { equityFraction: '0.01', maxEquityFraction: '0.8' } });
    const input = {
      rule: { type: 'fixedQuantity' as const, quantity: '100' },
      executionCurrency: 'CNY' as const,
      currentQuantity: '0',
      lotSize: '100',
      evaluationAt: at(0),
      price: { value: '100', occurredAt: at(0), availableAt: at(0) },
      equity: { amount: '100000', currency: 'CNY' as const, occurredAt: at(0), availableAt: at(0) },
    };
    const unused = {
      status: 'rejected' as const,
      reasonCode: 'INVALID_PARAMETER' as const,
      reason: 'unused',
      inputFacts: [],
    };
    expect(tradePlanSizing(p, { kind: 'entry', distance: '2' }, input, unused)).toMatchObject({
      status: 'available',
      normalizedQuantity: '500',
    });
    expect(
      tradePlanSizing(
        plan({ riskBudget: { equityFraction: '0.01', maxEquityFraction: '0.2' } }),
        { kind: 'entry', distance: '2' },
        input,
        unused,
      ),
    ).toMatchObject({ normalizedQuantity: '200' });
    const missing = { ...input };
    delete (missing as Partial<typeof input>).equity;
    expect(tradePlanSizing(p, { kind: 'entry', distance: '2' }, missing, unused).status).toBe(
      'unavailable',
    );
    expect(tradePlanSizing(p, { kind: 'entry', distance: '0' }, input, unused).status).toBe(
      'unavailable',
    );
  });

  it('保本早于追踪启用，减仓优先于加仓，加仓不重置已完成阶段', () => {
    const p = plan({
      trailing: {
        drawdownPercent: '0.05',
        activationGainPercent: '0.15',
        breakEvenGainPercent: '0.08',
      },
      stages: [
        {
          id: 'add',
          trigger: { kind: 'gainPercent', value: '0.08' },
          action: { kind: 'add', initialFraction: '0.5', maxEquityFraction: '0.8' },
        },
        {
          id: 'reduce',
          trigger: { kind: 'gainPercent', value: '0.08' },
          action: { kind: 'reduce', basis: 'initialQuantity', fraction: '0.5' },
        },
      ],
    });
    const r = new BacktestTradePlanRuntime(
      p,
      prices(['100', '108', '110', '116', '112']),
      [0, 1, 2, 3, 4].map(at),
    );
    accept(r, r.select(ctx(0), selection(0))!, '100', '100', '100', 0);
    const reduce = r.select(ctx(1, '100'), selection(1))!;
    expect(r.actions.get(reduce.signalId)?.kind).toBe('reduce');
    expect(r.snapshot().stopLine).toBe('100');
    accept(r, reduce, '50', '50', '108', 1);
    const add = r.select(ctx(2, '50'), selection(2))!;
    expect(r.actions.get(add.signalId)?.kind).toBe('add');
    const order = add.signalId + ':order';
    r.registerOrder(order, add.signalId);
    r.accept(
      {
        fillId: 'add-fill',
        orderId: order,
        executionSymbol: '600519.SH',
        side: 'buy',
        quantity: '50',
        price: '110',
        charges: [],
        occurredAt: at(2),
        availableAt: at(2),
        reason: 'signal',
      },
      '100',
    );
    expect(r.snapshot()).toMatchObject({
      initialQuantity: '100',
      entryPrice: '100',
      stageFilled: { reduce: '50', add: '50' },
    });
    expect(r.select(ctx(3, '100'), selection(3))).toBeUndefined();
    expect(r.snapshot().stopLine).toBe('110.2');
    expect(r.select(ctx(4, '100'), selection(4))).toBeUndefined();
    expect(r.snapshot().stopLine).toBe('110.2');
  });

  it('实际平仓后跳过完整冷却根数，拆股同步数量与价格锚点', () => {
    const r = new BacktestTradePlanRuntime(
      plan({ cooldown: { bars: 0, stopBars: 2 } }),
      prices(['100', '94', '100', '100', '100']),
      [0, 1, 2, 3, 4].map(at),
    );
    accept(r, r.select(ctx(0), selection(0))!, '100', '100', '100', 0);
    r.applySplit('2');
    expect(r.snapshot()).toMatchObject({
      initialQuantity: '200',
      entryPrice: '50',
      stopLine: '47.5',
    });
    r.applySplit('0.5');
    accept(r, r.select(ctx(1, '100'), selection(1))!, '100', '0', '94', 1);
    expect(r.select(ctx(2), selection(2))).toBeUndefined();
    expect(r.select(ctx(3), selection(3))).toBeUndefined();
    expect(r.select(ctx(4), selection(4))?.kind).toBe('entry');
  });

  it('真实事件队列／账本：200买入→只减100一次→余100追踪退出，复跑逐笔一致', () => {
    function run() {
      const values = ['10', '10', '11', '12', '11', '8', '8'];
      const series = prices(values);
      const input = exchangeRunInput();
      return runExchangeSimulation({
        ...input,
        simulation: {
          ...input.simulation,
          strategy: {
            ...input.simulation.strategy,
            entry: compare('gt', '0'),
            tradePlan: plan({
              cooldown: { bars: 10, stopBars: 10 },
              trailing: { drawdownPercent: '0.05', activationGainPercent: '0.1' },
              stages: [
                {
                  id: 'half',
                  trigger: { kind: 'gainPercent', value: '0.08' },
                  action: { kind: 'reduce', basis: 'initialQuantity', fraction: '0.5' },
                },
              ],
            }),
          },
          ticks: values.map((_, n) => ({
            occurredAt: at(n),
            availableAt: at(n),
            timeframe: '5m' as const,
          })),
          sourceSeries: new Map([['close', series]]),
        },
        exchange: {
          ...input.exchange,
          tradePlanPrices: series,
          bars: values.map((v, n) =>
            exchangeBar(
              new Date(Date.parse(at(n)) - 300000).toISOString(),
              at(n),
              v,
              values[Math.max(0, n - 1)]!,
            ),
          ),
          executionModel: frozenExchangeExecutionModel(0),
          dataAsOf: '2026-09-09T00:00:00.000Z',
        },
      });
    }
    const result = run();
    expect(result.fills.map((f) => [f.side, f.quantity, f.price])).toEqual([
      ['buy', '200', '10'],
      ['sell', '100', '12'],
      ['sell', '100', '8'],
    ]);
    expect(result.rejects).toEqual([]);
    expect(result.ledger.position.quantity).toBe('0');
    expect(run().fills).toEqual(result.fills);
  });
});
