import { DecimalValue as D } from './decimal.js';
import type { BacktestCurrency } from './backtest-contract.js';

/** 成交扣款和余单占款一起校验，通过后才改变预留。 */
export function consumeSimulationCashReservation(input: {
  reservations: Map<string, { amount: D; currency: BacktestCurrency }>;
  id: string;
  currency: BacktestCurrency;
  debit: D;
  remaining?: string | undefined;
}):
  | { accepted: true }
  | {
      accepted: false;
      code:
        | 'SETTLEMENT_SOURCE_NOT_FOUND'
        | 'CURRENCY_MISMATCH'
        | 'INSUFFICIENT_CASH'
        | 'INVALID_AMOUNT';
      reason: string;
    } {
  const reservation = input.reservations.get(input.id);
  if (!reservation)
    return { accepted: false, code: 'SETTLEMENT_SOURCE_NOT_FOUND', reason: '成交缺少现金占款' };
  if (reservation.currency !== input.currency)
    return { accepted: false, code: 'CURRENCY_MISMATCH', reason: '现金占款币种与成交不一致' };
  let remaining: D;
  try {
    remaining = D.from(input.remaining ?? '0');
  } catch {
    return { accepted: false, code: 'INVALID_AMOUNT', reason: '余单占款必须为规范十进制值' };
  }
  if (remaining.isNegative())
    return { accepted: false, code: 'INVALID_AMOUNT', reason: '余单占款不能为负数' };
  if (reservation.amount.compareTo(input.debit.plus(remaining)) < 0)
    return {
      accepted: false,
      code: 'INSUFFICIENT_CASH',
      reason: remaining.isPositive()
        ? '现金占款不足以覆盖成交扣款与余单预留'
        : '现金占款不足以覆盖成交扣款',
    };
  if (remaining.isPositive())
    input.reservations.set(input.id, { ...reservation, amount: remaining });
  else input.reservations.delete(input.id);
  return { accepted: true };
}
