import { DecimalValue } from './decimal.js';

export type SimulationAccountingBasis = 'raw-events' | 'normalized-series';

/**
 * Raw-event simulations book corporate actions into holdings and cash.
 * Normalized-series simulations already express the action in their price
 * coordinate, so applying it to the ledger would count it a second time.
 */
export const shouldApplySimulationCorporateAction = (accountingBasis: SimulationAccountingBasis) =>
  accountingBasis === 'raw-events';

/** Values normalized units against a price in the same frozen price coordinate. */
export const normalizedSeriesPositionValue = (quantity: string, price: string) => {
  const normalizedQuantity = DecimalValue.from(quantity);
  const valuationPrice = DecimalValue.from(price);
  if (normalizedQuantity.isNegative()) throw new Error('归一化持仓数量不能为负数');
  if (!valuationPrice.isPositive()) throw new Error('归一化估值价格必须为正数');
  return normalizedQuantity.times(valuationPrice).toString();
};

/**
 * `cash` is the ledger's complete cash balance for the execution currency:
 * settled plus unsettled, counted once. Reservations are already deducted
 * only from spendable cash and must not be added to this valuation input.
 */
export const normalizedSeriesEquity = (cash: string, quantity: string, price: string) => {
  const cashBalance = DecimalValue.from(cash);
  if (cashBalance.isNegative()) throw new Error('模拟现金不能为负数');
  return cashBalance.plus(normalizedSeriesPositionValue(quantity, price)).toString();
};
