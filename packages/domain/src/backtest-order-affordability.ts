import { DecimalValue as D } from './decimal.js';
import { floorLotUnits } from './backtest-sizing.js';

/** 有限资金预算内按原有手数／连续精度缩量，目标量不随权益重新放大。 */
export function affordableBacktestOrderQuantity(input: {
  requested: string;
  budget: string;
  step: string;
  debit: (quantity: string) => string;
}) {
  const budget = D.from(input.budget);
  if (!budget.isPositive()) return '0';
  const units = BigInt(floorLotUnits(input.requested, input.step));
  const quantity = (n: bigint) => D.from(n.toString()).times(input.step).toString();
  if (units === 0n) return '0';
  if (D.from(input.debit(quantity(units))).compareTo(budget) <= 0) return quantity(units);
  let low = 0n,
    high = units;
  while (low < high) {
    const mid = (low + high + 1n) / 2n;
    if (D.from(input.debit(quantity(mid))).compareTo(budget) <= 0) low = mid;
    else high = mid - 1n;
  }
  return quantity(low);
}
