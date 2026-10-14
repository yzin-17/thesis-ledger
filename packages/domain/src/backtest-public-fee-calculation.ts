import { DecimalValue } from './decimal.js';
import type { ExecutionModelCurrency, ExecutionModelQuantityBasis } from './backtest-execution-model.js';

export type ExecutionFeeAmountRounding = { mode: 'halfUp'; decimalPlaces: 2 } | { mode: 'ceil'; decimalPlaces: 0 };
export type FrozenActualSharesFee = {
  treatment: 'charged'; side: 'sell'; basis: 'actualShares'; currency: 'USD'; rate: string;
  minimum: { kind: 'none' }; maximumAmount: string; lowPriceExemption: 'belowPerShareRate';
};

/** 金额进位使用十进制整数，保留极大金额精度。 */
export function roundExecutionFeeAmount(amount: DecimalValue, decimalPlaces: number, rounding?: ExecutionFeeAmountRounding) {
  if (!rounding || rounding.mode === 'halfUp') return amount.dividedBy('1', rounding?.decimalPlaces ?? decimalPlaces).toString();
  if (rounding.mode !== 'ceil' || rounding.decimalPlaces !== 0 || amount.isNegative())
    throw new Error('未知费用进位模型');
  const [integer, fraction] = amount.toString().split('.');
  return fraction ? (BigInt(integer!) + 1n).toString() : integer!;
}

export function calculateActualSharesFee(fee: FrozenActualSharesFee, input: {
  side: 'buy' | 'sell'; currency: ExecutionModelCurrency; quantity?: string; price?: string;
  quantityBasis?: ExecutionModelQuantityBasis; decimalPlaces: number;
  turnover: string;
}) {
  if (fee.basis !== 'actualShares' || fee.currency !== input.currency || input.quantityBasis !== 'actual-units' ||
    input.quantity === undefined || input.price === undefined || fee.side !== 'sell' || fee.lowPriceExemption !== 'belowPerShareRate')
    throw new Error('TAF收费必须绑定实际股数、成交价和明确低价豁免');
  const quantity = DecimalValue.from(input.quantity), price = DecimalValue.from(input.price);
  const rate = DecimalValue.from(fee.rate), maximum = DecimalValue.from(fee.maximumAmount);
  if (!quantity.isPositive() || quantity.toString().includes('.') || !price.isPositive() || !rate.isPositive() || !maximum.isPositive() || fee.minimum.kind !== 'none')
    throw new Error('TAF股数、费率或上限无效');
  if (quantity.times(price).compareTo(input.turnover) !== 0) throw new Error('TAF实际股数与成交价/成交额不一致');
  let amount = DecimalValue.from('0');
  if (input.side === 'sell' && price.compareTo(rate) >= 0) {
    amount = quantity.times(rate);
    if (amount.compareTo(maximum) > 0) amount = maximum;
  }
  return { code: 'tradingActivityFee', amount: roundExecutionFeeAmount(amount, input.decimalPlaces), currency: input.currency };
}
