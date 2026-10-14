import { DecimalValue } from './decimal.js';

type VariableCharge = { rate: string; minimumAmount: string; maximumTurnoverRatio: string | null };
export type FrozenBrokerCommission = {
  broker: 'futu-hk';
  plan: 'standard-fixed-platform';
  sourceUrl: string;
  checkedDate: string;
  applicability: 'current-schedule-research';
  userModified: boolean;
  collection: 'single-fill-order-v1';
  basis: { kind: 'turnover' } | { kind: 'actualShares' } | { kind: 'referencePrice'; price: string };
  commission: VariableCharge;
  platformFee: { kind: 'fixed'; amount: string } | ({ kind: 'perShare' } & VariableCharge);
};
const nonNegative = (value: string) => {
  const amount = DecimalValue.from(value);
  if (amount.isNegative()) throw new Error('券商费用参数不能为负数');
  return amount;
};
const variableAmount = (fee: VariableCharge, basis: DecimalValue, turnover: DecimalValue) => {
  let amount = basis.times(nonNegative(fee.rate));
  const minimum = nonNegative(fee.minimumAmount);
  if (fee.maximumTurnoverRatio !== null) {
    const ratio = nonNegative(fee.maximumTurnoverRatio);
    if (!ratio.isPositive() || ratio.compareTo('1') > 0) throw new Error('券商收费上限比例必须在0至1之间');
    const maximum = turnover.times(ratio);
    if (amount.compareTo(maximum) > 0) amount = maximum;
  }
  if (amount.compareTo(minimum) < 0) amount = minimum;
  return amount.dividedBy('1', 2).toString();
};

/** 日线执行器一单一次成交；参考股数仅是成本研究坐标。 */
export const calculateBrokerCommission = (profile: FrozenBrokerCommission, input: {
  turnover: string; currency: 'CNY' | 'HKD' | 'USD';
  quantity?: string; price?: string; quantityBasis?: 'actual-units' | 'normalized-units';
}) => {
  if (profile.collection !== 'single-fill-order-v1') throw new Error('未知券商扣收模型');
  const turnover = nonNegative(input.turnover);
  if (!turnover.isPositive()) throw new Error('券商成本只对正成交额计费');
  const hk = profile.basis.kind === 'turnover';
  if (input.currency !== (hk ? 'HKD' : 'USD') || hk !== (profile.platformFee.kind === 'fixed'))
    throw new Error('券商收费币种、基数或平台费不匹配');
  let basis = turnover;
  if (profile.basis.kind === 'referencePrice') {
    const reference = nonNegative(profile.basis.price);
    if (!reference.isPositive()) throw new Error('参考股价必须大于0');
    basis = turnover.dividedBy(reference);
  } else if (profile.basis.kind === 'actualShares') {
    if (input.quantityBasis !== 'actual-units' || !input.quantity || !input.price)
      throw new Error('券商按股佣金需要实际股数和原价');
    basis = nonNegative(input.quantity);
    if (!basis.isPositive() || basis.toString().includes('.') || basis.times(input.price).compareTo(turnover) !== 0)
      throw new Error('实际股数与成交金额不一致');
  }
  const commission = variableAmount(profile.commission, basis, turnover);
  const platformFee = profile.platformFee.kind === 'fixed'
    ? nonNegative(profile.platformFee.amount).dividedBy('1', 2).toString()
    : variableAmount(profile.platformFee, basis, turnover);
  return [
    { code: 'commission', amount: commission, currency: input.currency },
    { code: 'platformFee', amount: platformFee, currency: input.currency },
  ];
};
