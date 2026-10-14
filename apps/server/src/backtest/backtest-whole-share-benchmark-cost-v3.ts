import { DecimalValue, calculateExecutionModelFees, floorLotUnits } from '@thesis-ledger/domain';
import type { BenchmarkCostReturn, calculateBacktestV3BenchmarkReturn } from './backtest-v3-benchmark-cost.js';

/** 同一每股价格的整数股持有基准；买侧费用纳入预算，余款继续持有。 */
export function calculateWholeShareBenchmarkReturnV3(
  input: Parameters<typeof calculateBacktestV3BenchmarkReturn>[0],
  coordinates = { sharesPerLot: '1', currency: 'USD' as 'USD' | 'HKD', priceScale: '100' },
): BenchmarkCostReturn {
  try {
    if (input.currency !== coordinates.currency || !/^[1-9]\d*$/.test(coordinates.sharesPerLot) ||
      !DecimalValue.from(input.slippageRate).isZero())
      return { status: 'unavailable', reason: 'SHARE_BENCHMARK_MODEL_UNSUPPORTED' };
    const cash = DecimalValue.from(input.initialCash);
    const buyPrice = DecimalValue.from(input.firstClose), sellPrice = DecimalValue.from(input.lastClose);
    if (!cash.isPositive()) return { status: 'unavailable', reason: 'ZERO_INITIAL_BENCHMARK' };
    for (const price of [buyPrice, sellPrice]) {
      if (!price.isPositive() || price.times(coordinates.priceScale).toString().includes('.'))
        return { status: 'unavailable', reason: 'SHARE_BENCHMARK_PRICE_GRID_INVALID' };
    }
    const fees = (side: 'buy' | 'sell', quantity: bigint, price: DecimalValue) =>
      DecimalValue.from(calculateExecutionModelFees(side === 'buy' ? input.buyFees : input.sellFees, {
        side, turnover: price.times(quantity.toString()).toString(), currency: coordinates.currency,
        quantity: quantity.toString(), price: price.toString(), quantityBasis: 'actual-units',
      }).total);
    const step = BigInt(coordinates.sharesPerLot);
    let low = 0n, high = BigInt(floorLotUnits(cash.dividedBy(buyPrice, 40).toString(), coordinates.sharesPerLot));
    while (low < high) {
      const middle = (low + high + 1n) / 2n;
      const quantity = middle * step;
      const debit = buyPrice.times(quantity.toString()).plus(fees('buy', quantity, buyPrice));
      if (debit.compareTo(cash) <= 0) low = middle;
      else high = middle - 1n;
    }
    if (low === 0n) return { status: 'unavailable', reason: 'BENCHMARK_INSUFFICIENT_CASH' };
    const shares = low * step;
    const quantity = shares.toString(), buyGross = buyPrice.times(quantity), sellGross = sellPrice.times(quantity);
    const buyFees = fees('buy', shares, buyPrice), sellFees = fees('sell', shares, sellPrice);
    const buyDebit = buyGross.plus(buyFees), residualCash = cash.minus(buyDebit);
    const finalCash = residualCash.plus(sellGross).minus(sellFees);
    if (residualCash.isNegative() || finalCash.isNegative())
      return { status: 'unavailable', reason: 'INVALID_BENCHMARK_CASH_LEDGER' };
    return { status: 'available', value: finalCash.dividedBy(cash, 20).minus('1').toString(),
      quantity, initialCash: cash.toString(), buyGross: buyGross.toString(), buyFees: buyFees.toString(),
      buyDebit: buyDebit.toString(), residualCash: residualCash.toString(), sellGross: sellGross.toString(),
      sellFees: sellFees.toString(), finalCash: finalCash.toString() };
  } catch {
    return { status: 'unavailable', reason: 'INVALID_BENCHMARK_COST_ASSUMPTION' };
  }
}
