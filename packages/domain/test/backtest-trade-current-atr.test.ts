import { describe, expect, it } from 'vitest';
import {
  BacktestTradePlanRuntime,
  backtestTradePlanLines,
  strategyRequiredLookback,
  type BacktestTradePlan,
  type SimulationExpressionContext,
} from '../src/index.js';
import { sourceSeries } from './backtest-simulation.fixtures.js';
import { numericExpressionKey } from '../src/backtest-simulation-evaluator.js';
import { tradePlanIndicatorExpressions } from '../src/backtest-trade-protection.js';

const at = (i: number) => new Date(Date.UTC(2026, 8, 8, 1, 35 + i * 10)).toISOString();
const plan: BacktestTradePlan = {
  version: 1,
  evaluation: 'barClose',
  stages: [],
  trailing: { kind: 'currentAtr', sourceId: 'close', period: 2, multiple: '2' },
};
const series = (values: string[]) =>
  sourceSeries(
    values.map((value, i) => ({
      occurredAt: at(i),
      availableAt: at(i),
      value,
      status: 'available' as const,
    })),
  );
function setup(values: string[], atrs: string[], delayed = -1, selectedPlan = plan) {
  const r = new BacktestTradePlanRuntime(
    selectedPlan,
    series(values),
    values.map((_, i) => at(i)),
  );
  const key = numericExpressionKey(tradePlanIndicatorExpressions(selectedPlan)[0]!);
  const atr = series(atrs);
  if (delayed >= 0) atr.points[delayed]!.availableAt = at(delayed + 1);
  if (delayed === -2) atr.points[2]!.valueOccurredAt = at(1);
  const select = (i: number, held = '10') => {
    const context: SimulationExpressionContext = {
      tick: { occurredAt: at(i) },
      sourceSeries: {},
      indicatorSeries: new Map([[key, atr]]),
      positionState: {
        isOpen: held !== '0',
        quantity: held,
        averageCost: '100',
        holdingPeriods: i,
        availableAt: at(i),
      },
    };
    return r.select(context, {
      state: {},
      entry: { status: 'available', value: true, occurredAt: at(i), availableAt: at(i) },
      exit: { status: 'available', value: false, occurredAt: at(i), availableAt: at(i) },
    });
  };
  const first = select(0, '0')!;
  r.registerOrder('buy', first.signalId);
  r.accept(
    {
      fillId: 'buy',
      orderId: 'buy',
      executionSymbol: '600519.SH',
      side: 'buy',
      quantity: '10',
      price: '100',
      charges: [],
      occurredAt: at(0),
      availableAt: at(0),
      reason: 'signal',
    },
    '10',
  );
  return { r, select };
}

describe('逐期 ATR 追踪保护', () => {
  it.each([-1, 1, -2])('显式已持仓条件与无额外条件的逐期保护行为相同，ATR迟到标记%s', (delayed) => {
    const guarded: BacktestTradePlan = {
      ...plan,
      trailing: {
        kind: 'currentAtr',
        sourceId: 'close',
        period: 2,
        multiple: '2',
        activateWhen: { type: 'positionState', field: 'isOpen' },
      },
    };
    const normal = setup(['100', '120', '119', '90'], ['2', '5', '1'], delayed);
    const explicit = setup(['100', '120', '119', '90'], ['2', '5', '1'], delayed, guarded);
    expect(normal.r.snapshot().stopLine).toBeUndefined();
    expect(explicit.r.snapshot().stopLine).toBeUndefined();
    for (const tick of [1, 2, 3]) {
      expect(explicit.select(tick)).toEqual(normal.select(tick));
      expect(explicit.r.snapshot()).toEqual(normal.r.snapshot());
    }
    expect(explicit.r.diagnostics).toEqual(normal.r.diagnostics);
  });
  it('ATR收缩可在价格回落时抬高保护，ATR扩张不放宽；入场无需冻结当前ATR', () => {
    const { r, select } = setup(['100', '120', '119', '118', '117'], ['0', '5', '2', '10', '0']);
    expect(r.snapshot()).not.toHaveProperty('entryAtr');
    select(1);
    expect(r.snapshot().stopLine).toBe('110');
    select(2);
    expect(r.snapshot().stopLine).toBe('116');
    select(3);
    expect(r.snapshot().stopLine).toBe('116');
    expect(select(4)).toBeUndefined();
    expect(r.snapshot().stopLine).toBe('116');
    expect(r.diagnostics.join()).toContain('CURRENT_ATR_UNAVAILABLE');
  });
  it('缺失和未来ATR不沿用旧ATR更新；已有线仍可触发，重复观察不重复发单', () => {
    const { r, select } = setup(['100', '120', '125', '109'], ['2', '5', '1'], 2);
    select(1);
    select(2);
    expect(r.snapshot().stopLine).toBe('110');
    expect(select(3)?.kind).toBe('risk');
    expect(select(3)).toBeUndefined();
    expect(r.snapshot().stopLine).toBe('110');
  });
  it('非正候选线不建保护；拆股同比换算峰值与已建保护', () => {
    const { r, select } = setup(['100', '120', '119'], ['2', '100', '5']);
    select(1);
    expect(r.snapshot().stopLine).toBeUndefined();
    select(2);
    expect(r.snapshot().stopLine).toBe('110');
    r.applySplit('2');
    expect(r.snapshot()).toMatchObject({ highClose: '60', stopLine: '55' });
  });
  it('实际决策序列重标了时间时，仍按原始取值收盘拒绝旧ATR', () => {
    const { r, select } = setup(['100', '120', '130'], ['2', '5', '5'], -2);
    select(1);
    select(2);
    expect(r.snapshot().stopLine).toBe('110');
  });
  it('指标预热与中文明确逐期锚点、缺失保护和后续开盘', () => {
    const flat = { type: 'positionState' as const, field: 'isOpen' as const };
    expect(strategyRequiredLookback({ entry: flat, exit: flat, tradePlan: plan }).required).toBe(3);
    const text = backtestTradePlanLines(plan).join('\n');
    expect(text).toContain('最高有效收盘价减当前可见 ATR(2) 的 2 倍');
    expect(text).toContain('首次取得有效 ATR 前没有该条追踪保护');
    expect(text).toContain('下一可交易开盘');
  });
});
