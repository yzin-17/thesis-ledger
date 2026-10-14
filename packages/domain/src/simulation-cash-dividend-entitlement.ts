import { DecimalValue } from './decimal.js';

/** 可选资格来自研究执行投影；原调用仍按当前已结算数量计算。 */
export function simulationCashDividendAmount(
  input: { amountPerShare: string; eligibleQuantity?: string },
  settledQuantity: string,
): { valid: true; amount: DecimalValue } | { valid: false; reason: string } {
  try {
    const amount = DecimalValue.from(input.amountPerShare);
    if (amount.isNegative()) return { valid: false, reason: '每股分红不能为负数' };
    const quantity = DecimalValue.from(input.eligibleQuantity ?? settledQuantity);
    if (quantity.isNegative()) return { valid: false, reason: '登记资格数量不能为负数' };
    return { valid: true, amount: amount.times(quantity) };
  } catch {
    return { valid: false, reason: '分红金额或资格数量不是规范十进制值' };
  }
}
