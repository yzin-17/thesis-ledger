import { DecimalValue } from '@thesis-ledger/domain';
import { executionModelFeesV3Schema, type BacktestStrategy } from '@thesis-ledger/schemas';

/** 策略成本的研究投影；公共费项初值并非历史收费事实。 */
export function strategyExecutionFees(
  cost: BacktestStrategy['cost'],
  currency: 'CNY' | 'HKD' | 'USD',
) {
  const minimum = cost.minimumCommission;
  if (minimum && minimum.currency !== currency)
    throw new Error('策略最低佣金的币种与回测资金不一致，请核对策略费用设置。');
  const publicCharge = (side: 'sell' | 'both') => ({
    treatment: 'charged',
    side,
    basis: 'turnover',
    currency,
    rate: '0',
    minimum: { kind: 'none' },
  });
  return executionModelFeesV3Schema.parse({
    currency,
    rounding: { mode: 'halfUp', decimalPlaces: 2 },
    collection: 'perFillPerCharge',
    commission: {
      treatment: 'charged',
      side: 'both',
      basis: 'turnover',
      currency,
      rate: cost.commissionRate,
      minimum:
        minimum && DecimalValue.from(minimum.amount).isPositive()
          ? { kind: 'amount', amount: minimum.amount }
          : { kind: 'none' },
    },
    stampDuty: publicCharge('sell'),
    transferFee: publicCharge('both'),
    regulatoryFee: publicCharge('both'),
    handlingFee: publicCharge('both'),
  });
}
