import { DecimalValue as D } from './decimal.js';
import {
  calculateExecutionModelFees,
  type FrozenExecutionModelFees,
} from './backtest-execution-model.js';
import { roundExecutionFeeAmount } from './backtest-public-fee-calculation.js';
import type { ExchangeCostModel } from './backtest-exchange.js';
import type { BacktestCurrency } from './backtest-contract.js';

export interface BacktestOrderChargeMemory {
  turnover: string;
  quantity: string;
  commission: string;
  platformFee: string;
}
export const emptyBacktestOrderCharges = (): BacktestOrderChargeMemory => ({
  turnover: '0',
  quantity: '0',
  commission: '0',
  platformFee: '0',
});

/** 只报价，调用方在账本接受后提交 memory；拒单不推进累计费用。 */
export function quoteBacktestOrderCharges(input: {
  previous: BacktestOrderChargeMemory;
  side: 'buy' | 'sell';
  quantity: string;
  price: string;
  currency: BacktestCurrency;
  quantityBasis: 'actual-units' | 'normalized-units';
  costs: ExchangeCostModel;
  fees?: FrozenExecutionModelFees | undefined;
}) {
  const turnover = D.from(input.quantity).times(input.price);
  const cumulative = D.from(input.previous.turnover).plus(turnover);
  const quantity = D.from(input.previous.quantity).plus(input.quantity);
  let charges: Array<{ code: string; amount: string; currency: BacktestCurrency }>;
  const memory = {
    ...input.previous,
    turnover: cumulative.toString(),
    quantity: quantity.toString(),
  };
  if (input.fees) {
    const facts = {
      side: input.side,
      currency: input.currency,
      price: input.price,
      quantityBasis: input.quantityBasis,
    };
    const current = calculateExecutionModelFees(input.fees, {
      ...facts,
      turnover: turnover.toString(),
      quantity: input.quantity,
    }).charges;
    const total = calculateExecutionModelFees(input.fees, {
      ...facts,
      turnover: cumulative.toString(),
      quantity: quantity.toString(),
    }).charges;
    charges = current.map((charge) => {
      if (charge.code !== 'commission' && charge.code !== 'platformFee') return charge;
      const key = charge.code;
      const due = D.from(total.find((item) => item.code === key)!.amount);
      const paid = D.from(input.previous[key]);
      const delta = due.minus(paid);
      memory[key] = due.compareTo(paid) > 0 ? due.toString() : paid.toString();
      return { ...charge, amount: delta.isPositive() ? delta.toString() : '0' };
    });
  } else {
    if (input.costs.minimumCommission && input.costs.minimumCommission.currency !== input.currency)
      throw new Error('最低佣金币种必须与成交币种一致');
    let due = cumulative.times(input.costs.commissionRate);
    const minimum = D.from(input.costs.minimumCommission?.amount ?? '0');
    if (due.compareTo(minimum) < 0) due = minimum;
    const rounding = input.costs.feeRounding;
    if (rounding?.mode === 'halfUp')
      due = D.from(roundExecutionFeeAmount(due, rounding.decimalPlaces));
    const delta = due.minus(input.previous.commission);
    memory.commission = due.toString();
    charges = [
      {
        code: 'commission',
        amount: delta.isPositive() ? delta.toString() : '0',
        currency: input.currency,
      },
    ];
  }
  return {
    memory,
    charges,
    total: charges.reduce((sum, charge) => sum.plus(charge.amount), D.from('0')).toString(),
  };
}
