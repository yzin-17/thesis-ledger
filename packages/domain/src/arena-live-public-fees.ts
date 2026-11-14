import { DecimalValue as D } from './decimal.js';
import { calculateActualSharesFee, roundExecutionFeeAmount, type ExecutionFeeAmountRounding } from './backtest-public-fee-calculation.js';

export interface ArenaPublicCharge {
  code: string; side: 'buy' | 'sell' | 'both'; basis: 'turnover' | 'actualShares';
  currency: 'CNY' | 'HKD' | 'USD'; rate: string;
  amountRounding?: ExecutionFeeAmountRounding | undefined;
  maximumAmount?: string | undefined;
  lowPriceExemption?: 'belowPerShareRate' | undefined;
}
/** 消费已核验来源的收费事实；来源准入、有效期及证券范围仍由 Market 核对。 */
export function arenaPublicFees(charges: readonly ArenaPublicCharge[], side: 'buy' | 'sell', currency: ArenaPublicCharge['currency'], quantity: string, price: string) {
  const shares = D.from(quantity), tradePrice = D.from(price), turnover = shares.times(tradePrice);
  if (!shares.isPositive() || !tradePrice.isPositive()) throw new Error('invalid_fee_execution');
  return charges.filter((c) => c.side === side || c.side === 'both').reduce((sum, c) => {
    if (c.currency !== currency || D.from(c.rate).isNegative()) throw new Error('fee_scope_mismatch');
    if (c.basis === 'actualShares') {
      if (c.code !== 'tradingActivityFee' || c.side !== 'sell' || currency !== 'USD' || !c.maximumAmount || !c.lowPriceExemption)
        throw new Error('unsupported_fee_basis');
      const fee = calculateActualSharesFee({ treatment: 'charged', side: 'sell', basis: 'actualShares', currency: 'USD',
        rate: c.rate, minimum: { kind: 'none' }, maximumAmount: c.maximumAmount, lowPriceExemption: c.lowPriceExemption },
      { side, currency, quantity, price, turnover: turnover.toString(), quantityBasis: 'actual-units', decimalPlaces: 2 });
      return sum.plus(fee.amount);
    }
    if (c.maximumAmount || c.lowPriceExemption) throw new Error('unsupported_fee_basis');
    return sum.plus(roundExecutionFeeAmount(turnover.times(c.rate), 2, c.amountRounding));
  }, D.from('0')).toString();
}
