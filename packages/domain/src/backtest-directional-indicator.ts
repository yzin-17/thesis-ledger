import { DecimalValue as D } from './decimal.js';
import { finishBacktestComputation, mapBacktestComputationItems } from './backtest-computation.js';
import type { BacktestSeriesPoint } from './backtest-series.js';
import {
  mergeBacktestAvailability,
  type BacktestAvailability,
} from './backtest-observation-clock.js';

const abs = (value: D) => (value.isNegative() ? value.times('-1') : value);
const max = (values: D[]) => values.reduce((a, b) => (a.compareTo(b) > 0 ? a : b));

/** Wilder 平滑；首根只建立前高／前低／前收，ADX 在第 2N 根初始化。 */
export function* directionalIndicatorSteps(
  points: readonly BacktestSeriesPoint[],
  period: number,
  output: 'adx' | 'plusDI' | 'minusDI',
): Generator<void, BacktestSeriesPoint[], void> {
  let previous: BacktestSeriesPoint | undefined;
  let count = 0;
  let tr = D.from('0'),
    plus = D.from('0'),
    minus = D.from('0');
  let adx: D | undefined;
  let dxSeed: D[] = [];
  let clock: BacktestAvailability | undefined;
  return yield* mapBacktestComputationItems(points, (point) => {
    const unavailable = (): BacktestSeriesPoint => ({
      occurredAt: point.occurredAt,
      availableAt: point.availableAt,
      status: 'unavailable',
      reason: 'ADX 输入缺失或 Wilder 预热不足',
    });
    if (
      point.status === 'unavailable' ||
      point.value === undefined ||
      point.high === undefined ||
      point.low === undefined ||
      point.close === undefined
    ) {
      previous = undefined;
      count = 0;
      tr = D.from('0');
      plus = D.from('0');
      minus = D.from('0');
      adx = undefined;
      dxSeed = [];
      clock = undefined;
      return unavailable();
    }
    clock = clock ? mergeBacktestAvailability([clock, point]) : point;
    if (!previous) {
      previous = point;
      return unavailable();
    }
    const upward = D.from(point.high).minus(previous.high!);
    const downward = D.from(previous.low!).minus(point.low);
    const currentTR = max([
      D.from(point.high).minus(point.low),
      abs(D.from(point.high).minus(previous.close!)),
      abs(D.from(point.low).minus(previous.close!)),
    ]);
    const currentPlus =
      upward.isPositive() && upward.compareTo(downward) > 0 ? upward : D.from('0');
    const currentMinus =
      downward.isPositive() && downward.compareTo(upward) > 0 ? downward : D.from('0');
    previous = point;
    count++;
    const smooth = (old: D, value: D) =>
      count <= period ? old.plus(value) : old.minus(old.dividedBy(String(period), 40)).plus(value);
    tr = smooth(tr, currentTR);
    plus = smooth(plus, currentPlus);
    minus = smooth(minus, currentMinus);
    if (count < period) return unavailable();
    const plusDI = tr.isZero() ? D.from('0') : plus.dividedBy(tr, 20).times('100');
    const minusDI = tr.isZero() ? D.from('0') : minus.dividedBy(tr, 20).times('100');
    const denominator = plusDI.plus(minusDI);
    const dx = denominator.isZero()
      ? D.from('0')
      : abs(plusDI.minus(minusDI)).dividedBy(denominator, 20).times('100');
    if (adx)
      adx = adx
        .times(String(period - 1))
        .plus(dx)
        .dividedBy(String(period), 20);
    else {
      dxSeed.push(dx);
      if (dxSeed.length === period)
        adx = dxSeed
          .reduce((total, value) => total.plus(value), D.from('0'))
          .dividedBy(String(period), 20);
    }
    let value = adx;
    if (output === 'plusDI') value = plusDI;
    if (output === 'minusDI') value = minusDI;
    return value
      ? { occurredAt: point.occurredAt, status: 'available', value: value.toString(), ...clock }
      : unavailable();
  });
}

export const directionalIndicator = (...input: Parameters<typeof directionalIndicatorSteps>) => finishBacktestComputation(directionalIndicatorSteps(...input));
