import { DecimalValue } from './decimal.js';

export type ExecutionModelCurrency = 'CNY' | 'HKD' | 'USD';
export type ExecutionModelRange = { start: string; end: string };
export type FrozenExecutionModelChargedFee = {
  treatment: 'charged';
  side: 'buy' | 'sell' | 'both';
  basis: string;
  currency: ExecutionModelCurrency;
  rate: string;
  minimum: { kind: 'none' } | { kind: 'amount'; amount: string };
};
export type FrozenExecutionModelFee =
  | FrozenExecutionModelChargedFee
  | { treatment: 'includedInCommission'; reason: string }
  | { treatment: 'notApplicable'; reason: string };
type FrozenNavExecutionModelFeeBase = {
  side: 'buy' | 'sell';
  basis: 'subscriptionApplicationAmount' | 'redemptionGrossProceeds';
  currency: 'CNY';
  collection: 'perApplication';
  collectedAt: 'confirmation';
};
export type FrozenNavExecutionModelChargedFee = FrozenNavExecutionModelFeeBase & {
  treatment: 'charged';
  rate: string;
  minimum: { kind: 'none' } | { kind: 'amount'; amount: string };
  rounding: { mode: 'halfUp'; decimalPlaces: 2 };
};
export type FrozenNavExecutionModelFee =
  | FrozenNavExecutionModelChargedFee
  | (FrozenNavExecutionModelFeeBase & { treatment: 'notApplicable'; reason: string });

/** The transport schema validates structure before this domain boundary. */
export interface FrozenExecutionModelFees {
  currency: ExecutionModelCurrency;
  rounding: { mode: 'halfUp'; decimalPlaces: 2 };
  collection: 'perFillPerCharge';
  commission: FrozenExecutionModelChargedFee;
  stampDuty: FrozenExecutionModelFee;
  transferFee: FrozenExecutionModelFee;
  regulatoryFee: FrozenExecutionModelFee;
  handlingFee: FrozenExecutionModelFee;
}

export interface FrozenExecutionModelSegmentBase {
  id: string;
  range: ExecutionModelRange;
  source:
    | { kind: 'historicalFact'; knownAt: string }
    | { kind: 'researchPreset' | 'userConfiguration'; configuredAt: string };
  assumptions: readonly string[];
}

export interface FrozenExchangeExecutionModelSegment extends FrozenExecutionModelSegmentBase {
  fees: FrozenExecutionModelFees;
  execution: {
    mode: 'exchange';
    calendarMarket: string;
    reserveCashAt: 'orderAccepted';
    buyDebitAt: 'fill';
    sellableAfterTradingDays: number;
    saleReinvestableAfterTradingDays: number;
    price:
      | {
          kind: 'dailyLimit';
          reference: 'previousRawClose';
          maxUpRatio: string;
          maxDownRatio: string;
          rounding: 'halfUpToTick';
          minimumDistanceTicks: number;
          minimumPriceTicks: number;
        }
      | { kind: 'noDailyLimit'; reason: string };
  };
}

export interface FrozenNavExecutionModelSegment extends FrozenExecutionModelSegmentBase {
  fees: null;
  execution: {
    mode: 'nav';
    calendarMarket: 'CN';
    cutoffLocalTime: string;
    cutoffBoundary: 'atOrAfterNextTradingDay';
    navDate: 'acceptedApplicationTradingDate';
    navAvailability: 'providerAvailableAt';
    reserveCashAt: 'orderAccepted';
    subscriptionDebitAt: 'confirmation';
    confirmationAfterTradingDays: number;
    sellableAfterConfirmationTradingDays: number;
    redemptionReinvestableAfterConfirmationTradingDays: number;
    subscriptionFee: FrozenNavExecutionModelFee & {
      side: 'buy';
      basis: 'subscriptionApplicationAmount';
    };
    redemptionFee: FrozenNavExecutionModelFee & {
      side: 'sell';
      basis: 'redemptionGrossProceeds';
    };
  };
}

export type FrozenExecutionModelSegment =
  FrozenExchangeExecutionModelSegment | FrozenNavExecutionModelSegment;

export interface FrozenExecutionModel {
  schemaVersion: 'execution-model-v1';
  id: string;
  version: string;
  scope: {
    symbol: string;
    market: string;
    instrumentType: string;
    currency: ExecutionModelCurrency;
    timezone: string;
    range: ExecutionModelRange;
  };
  segments: readonly FrozenExecutionModelSegment[];
}

export class ExecutionModelUnavailableError extends Error {
  readonly code = 'MARKET_RULES_UNAVAILABLE';
}

const fail = (reason: string): never => {
  throw new ExecutionModelUnavailableError(reason);
};
const instant = (value: string) => {
  const result = Date.parse(value);
  if (!Number.isFinite(result)) return fail(`模型时间无效: ${value}`);
  return result;
};

/** Configuration can be selected retrospectively; knowledge of facts cannot. */
export const resolveExecutionModelSegment = <T extends FrozenExecutionModelSegment>(
  model: FrozenExecutionModel & { segments: readonly T[] },
  input: {
    expectedVersion: string;
    symbol: string;
    market: string;
    instrumentType: string;
    currency: ExecutionModelCurrency;
    evaluatedAt: string;
    dataAsOf: string;
  },
): T => {
  if (model.schemaVersion !== 'execution-model-v1' || model.version !== input.expectedVersion) {
    return fail('冻结模型版本不匹配');
  }
  for (const key of ['symbol', 'market', 'instrumentType', 'currency'] as const) {
    if (model.scope[key] !== input[key]) return fail(`模型适用性不匹配: ${key}`);
  }
  const at = instant(input.evaluatedAt);
  const asOf = instant(input.dataAsOf);
  if (at > asOf) return fail('执行事件晚于 dataAsOf');
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en', {
      timeZone: model.scope.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  if (date < model.scope.range.start || date > model.scope.range.end) {
    return fail(`模型未覆盖事件日期: ${date}`);
  }
  const matches = model.segments.filter(
    (segment) => segment.range.start <= date && segment.range.end >= date,
  );
  if (matches.length !== 1) return fail(`规则分段缺口或重叠: ${date}`);
  const selected = matches[0]!;
  if (selected.source.kind === 'historicalFact') {
    const knownAt = instant(selected.source.knownAt);
    if (knownAt > at || knownAt > asOf) return fail(`规则事实在事件时尚不可知: ${selected.id}`);
  }
  // Return an event-owned copy: a subsequent configuration edit cannot rewrite it.
  return structuredClone(selected) as T;
};

const calculateChargedFee = (
  fee: FrozenExecutionModelChargedFee,
  input: {
    code: string;
    side: 'buy' | 'sell';
    basis: string;
    gross: string;
    currency: ExecutionModelCurrency;
    decimalPlaces: number;
  },
) => {
  if (fee.minimum.kind !== 'none' && fee.minimum.kind !== 'amount') {
    return fail(`未知最低额模型: ${input.code}`);
  }
  if (fee.currency !== input.currency) return fail(`费用币种不一致: ${input.code}`);
  if (fee.basis !== input.basis) return fail(`费用基数不一致: ${input.code}`);
  if (fee.side !== 'both' && fee.side !== input.side) {
    return { code: input.code, amount: '0', currency: input.currency };
  }
  const gross = DecimalValue.from(input.gross);
  if (gross.isNegative()) return fail('成交金额不能为负数');
  const rate = DecimalValue.from(fee.rate);
  if (rate.isNegative()) return fail(`费用不能为负数: ${input.code}`);
  let amount = gross.times(rate);
  if (fee.minimum.kind === 'amount') {
    const minimum = DecimalValue.from(fee.minimum.amount);
    if (!minimum.isPositive()) return fail(`最低额必须为正数: ${input.code}`);
    if (amount.compareTo(minimum) < 0) amount = minimum;
  }
  return {
    code: input.code,
    amount: amount.dividedBy('1', input.decimalPlaces).toString(),
    currency: input.currency,
  };
};

export const calculateNavExecutionModelFee = (
  fee: FrozenNavExecutionModelFee,
  input: {
    code: string;
    side: 'buy' | 'sell';
    basis: 'subscriptionApplicationAmount' | 'redemptionGrossProceeds';
    gross: string;
    currency: ExecutionModelCurrency;
  },
) => {
  if (fee.side !== input.side) return fail(`NAV 费用侧不一致: ${input.code}`);
  if (fee.currency !== input.currency) return fail(`费用币种不一致: ${input.code}`);
  if (fee.basis !== input.basis) return fail(`费用基数不一致: ${input.code}`);
  if (fee.collection !== 'perApplication' || fee.collectedAt !== 'confirmation') {
    return fail(`未知 NAV 费用扣收模型: ${input.code}`);
  }
  if (fee.treatment === 'notApplicable') {
    if (!fee.reason.trim()) return fail(`NAV 不适用费用必须说明原因: ${input.code}`);
    return { code: input.code, amount: '0', currency: input.currency };
  }
  if (fee.treatment !== 'charged') return fail(`未知 NAV 费用处理方式: ${input.code}`);
  if (fee.rounding.mode !== 'halfUp' || fee.rounding.decimalPlaces !== 2) {
    return fail(`未知 NAV 费用舍入模型: ${input.code}`);
  }
  return calculateChargedFee(fee, { ...input, decimalPlaces: fee.rounding.decimalPlaces });
};

export const calculateExecutionModelFees = (
  fees: FrozenExecutionModelFees,
  input: { side: 'buy' | 'sell'; turnover: string; currency: ExecutionModelCurrency },
) => {
  if (fees.currency !== input.currency) return fail('费用币种与成交币种不一致');
  if (
    fees.collection !== 'perFillPerCharge' ||
    fees.rounding.mode !== 'halfUp' ||
    fees.rounding.decimalPlaces !== 2
  ) {
    return fail('未知费用舍入或扣收模型');
  }
  const turnover = DecimalValue.from(input.turnover);
  if (turnover.isNegative()) return fail('成交金额不能为负数');
  const charges: { code: string; amount: string; currency: ExecutionModelCurrency }[] = [];
  for (const key of [
    'commission',
    'stampDuty',
    'transferFee',
    'regulatoryFee',
    'handlingFee',
  ] as const) {
    const fee = fees[key];
    if (fee.treatment !== 'charged') continue;
    const charge = calculateChargedFee(fee, {
      code: key,
      side: input.side,
      basis: 'turnover',
      gross: turnover.toString(),
      currency: input.currency,
      decimalPlaces: fees.rounding.decimalPlaces,
    });
    if (charge.amount !== '0' || fee.side === 'both' || fee.side === input.side) {
      charges.push(charge);
    }
  }
  return {
    charges,
    total: charges
      .reduce((total, charge) => total.plus(charge.amount), DecimalValue.from('0'))
      .toString(),
    currency: input.currency,
  };
};
