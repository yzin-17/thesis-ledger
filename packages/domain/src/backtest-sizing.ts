import { DecimalValue } from './decimal.js';
import {
  availabilityForDecision,
  isAvailableForDecisionAt,
  type BacktestAvailability,
} from './backtest-observation-clock.js';
import type { FrozenNormalizedExecutionAssumptions } from './backtest-execution-model.js';
import type { BacktestCurrency, BacktestStrategy } from './backtest-contract.js';

export interface SizingPriceFact extends BacktestAvailability {
  value: string;
  occurredAt: string;
  status?: 'available' | 'unavailable';
  reason?: string;
}

export interface SizingEquityFact {
  amount: string;
  currency: BacktestCurrency;
  occurredAt: string;
  availableAt: string;
  status?: 'available' | 'unavailable';
  reason?: string;
}

export interface SizingFxFact {
  fromCurrency: BacktestCurrency;
  toCurrency: BacktestCurrency;
  rate: string;
  occurredAt: string;
  availableAt: string;
  status?: 'available' | 'unavailable' | 'stale';
  reason?: string;
}

export interface SizingInput {
  rule: BacktestStrategy['sizing'];
  /** Defaults to the existing actual-share / lot-constrained behavior. */
  accountingBasis?: 'raw-events' | 'normalized-series';
  /** Required when accountingBasis is normalized-series. */
  normalizedExecution?: FrozenNormalizedExecutionAssumptions;
  executionCurrency: BacktestCurrency;
  /** Required by raw-events sizing; ignored for normalized-series sizing. */
  lotSize?: string;
  currentQuantity: string;
  evaluationAt: string;
  price?: SizingPriceFact;
  equity?: SizingEquityFact;
  fx?: SizingFxFact;
}

export interface SizingAvailable {
  status: 'available';
  accountingBasis?: 'normalized-series';
  side: 'buy' | 'sell' | 'none';
  requestedQuantity: string;
  normalizedQuantity: string;
  targetQuantity?: string;
  cashConstraint?: {
    requestedQuantity: string;
    availableCash: string;
    requiredCash: string;
  };
  occurredAt: string;
  availableAt: string;
  inputFacts: readonly string[];
}

export interface SizingUnavailable {
  status: 'unavailable';
  reasonCode:
    | 'FACT_UNAVAILABLE'
    | 'FACT_STALE'
    | 'FX_STALE'
    | 'FUTURE_DATA'
    | 'PRICE_UNAVAILABLE'
    | 'EQUITY_UNAVAILABLE'
    | 'FX_UNAVAILABLE';
  reason: string;
  inputFacts: readonly string[];
}

export interface SizingRejected {
  status: 'rejected';
  reasonCode:
    | 'INVALID_TIME'
    | 'INVALID_DECIMAL'
    | 'INVALID_PARAMETER'
    | 'CURRENCY_MISMATCH'
    | 'QUANTITY_BELOW_LOT'
    | 'EXECUTION_MODEL_UNAVAILABLE'
    | 'UNSUPPORTED_UNIT';
  reason: string;
  inputFacts: readonly string[];
}

export type SizingResult = SizingAvailable | SizingUnavailable | SizingRejected;

const instant = (value: string) => Date.parse(value);

const facts = (...values: string[]) => [...new Set(values)].sort();

const reject = (
  reasonCode: SizingRejected['reasonCode'],
  reason: string,
  inputFacts: readonly string[],
): SizingRejected => ({ status: 'rejected', reasonCode, reason, inputFacts: facts(...inputFacts) });

const unavailable = (
  reasonCode: SizingUnavailable['reasonCode'],
  reason: string,
  inputFacts: readonly string[],
): SizingUnavailable => ({
  status: 'unavailable',
  reasonCode,
  reason,
  inputFacts: facts(...inputFacts),
});

const parse = (value: string, label: string): DecimalValue | SizingRejected => {
  try {
    return DecimalValue.from(value);
  } catch {
    return reject('INVALID_DECIMAL', `${label} 不是规范十进制值`, [`${label}=${value}`]);
  }
};

const asDecimal = (value: DecimalValue | SizingRejected): value is DecimalValue =>
  value instanceof DecimalValue;

const floorToLot = (quantity: DecimalValue, lotSize: DecimalValue) => {
  if (!quantity.isPositive()) return DecimalValue.from('0');
  const units = BigInt(floorLotUnits(quantity.toString(), lotSize.toString()));
  return DecimalValue.from(units.toString()).times(lotSize);
};

const partsOf = (value: string) => {
  const [integer, fraction = ''] = value.split('.');
  return { coefficient: BigInt(`${integer}${fraction}`), scale: fraction.length };
};

const powerOfTen = (scale: number) => 10n ** BigInt(scale);

/** Exact positive quantity-to-lot floor; it never rounds a near-lot value up. */
export const floorLotUnits = (quantity: string, lotSize: string) => {
  const quantityValue = DecimalValue.from(quantity);
  const lotValue = DecimalValue.from(lotSize);
  if (!lotValue.isPositive()) throw new Error('lotSize 必须为正数');
  if (!quantityValue.isPositive()) return '0';

  const quantityParts = partsOf(quantityValue.toString());
  const lotParts = partsOf(lotValue.toString());
  const numerator = quantityParts.coefficient * powerOfTen(lotParts.scale);
  const denominator = lotParts.coefficient * powerOfTen(quantityParts.scale);
  return (numerator / denominator).toString();
};

const absolute = (value: DecimalValue) => (value.isNegative() ? value.times('-1') : value);

const validateTime = (value: string, label: string): SizingRejected | undefined =>
  Number.isFinite(instant(value))
    ? undefined
    : reject('INVALID_TIME', `${label} 时间无效`, [`${label}=${value}`]);

const validateFactTime = (
  fact: BacktestAvailability & { occurredAt: string; status?: string; reason?: string },
  label: string,
  evaluationAt: string,
  unavailableCode: SizingUnavailable['reasonCode'],
): SizingRejected | SizingUnavailable | undefined => {
  const invalidEvaluation = validateTime(evaluationAt, 'evaluationAt');
  if (invalidEvaluation) return invalidEvaluation;
  const invalidOccurred = validateTime(fact.occurredAt, `${label}.occurredAt`);
  if (invalidOccurred) return invalidOccurred;
  const invalidAvailable = validateTime(fact.availableAt, `${label}.availableAt`);
  if (invalidAvailable) return invalidAvailable;
  if (fact.status === 'unavailable') {
    return unavailable(unavailableCode, fact.reason ?? `${label} unavailable`, [
      `${label}.status=unavailable`,
    ]);
  }
  if (
    instant(fact.occurredAt) > instant(evaluationAt) ||
    !isAvailableForDecisionAt(fact, evaluationAt)
  ) {
    return unavailable('FUTURE_DATA', `${label} 在 evaluationAt 后才可用`, [
      `${label}.occurredAt=${fact.occurredAt}`,
      `${label}.availableAt=${fact.availableAt}`,
      `evaluationAt=${evaluationAt}`,
    ]);
  }
  if (instant(fact.availableAt) < instant(fact.occurredAt)) {
    return reject('INVALID_TIME', `${label}.availableAt 不能早于 occurredAt`, [
      `${label}.occurredAt=${fact.occurredAt}`,
      `${label}.availableAt=${fact.availableAt}`,
    ]);
  }
  return undefined;
};

const requirePrice = (input: SizingInput): SizingPriceFact | SizingUnavailable | SizingRejected => {
  if (!input.price) return unavailable('PRICE_UNAVAILABLE', '缺少执行价格事实', ['price=missing']);
  const timing = validateFactTime(input.price, 'price', input.evaluationAt, 'PRICE_UNAVAILABLE');
  if (timing) return timing;
  const value = parse(input.price.value, 'price');
  if (!asDecimal(value)) return value;
  if (!value.isPositive()) return reject('INVALID_PARAMETER', '执行价格必须为正数', ['price']);
  return input.price;
};

const requireEquity = (input: SizingInput): DecimalValue | SizingUnavailable | SizingRejected => {
  if (!input.equity) return unavailable('EQUITY_UNAVAILABLE', '缺少权益事实', ['equity=missing']);
  const timing = validateFactTime(input.equity, 'equity', input.evaluationAt, 'EQUITY_UNAVAILABLE');
  if (timing) return timing;
  const amount = parse(input.equity.amount, 'equity.amount');
  if (!asDecimal(amount)) return amount;
  if (amount.isNegative()) return reject('INVALID_PARAMETER', '权益不能为负数', ['equity.amount']);
  if (input.equity.currency === input.executionCurrency) return amount;
  if (!input.fx) return unavailable('FX_UNAVAILABLE', '缺少权益换算 FX 事实', ['fx=missing']);
  const fxTiming = validateFactTime(input.fx, 'fx', input.evaluationAt, 'FX_UNAVAILABLE');
  if (fxTiming) {
    if (fxTiming.status === 'unavailable' && fxTiming.reasonCode === 'FACT_UNAVAILABLE') {
      return { ...fxTiming, reasonCode: 'FX_UNAVAILABLE' };
    }
    return fxTiming;
  }
  if (input.fx.status === 'stale') {
    return unavailable('FX_STALE', input.fx.reason ?? 'FX fact stale', ['fx.status=stale']);
  }
  const direct =
    input.fx.fromCurrency === input.equity.currency &&
    input.fx.toCurrency === input.executionCurrency;
  const inverse =
    input.fx.fromCurrency === input.executionCurrency &&
    input.fx.toCurrency === input.equity.currency;
  if (!direct && !inverse) {
    return reject('CURRENCY_MISMATCH', 'FX 方向与权益/执行币种不匹配', [
      `fx.from=${input.fx.fromCurrency}`,
      `fx.to=${input.fx.toCurrency}`,
    ]);
  }
  const rate = parse(input.fx.rate, 'fx.rate');
  if (!asDecimal(rate)) return rate;
  if (!rate.isPositive()) return reject('INVALID_PARAMETER', 'FX rate 必须为正数', ['fx.rate']);
  return direct ? amount.times(rate) : amount.dividedBy(rate, 40);
};

const latestAvailableAt = (input: SizingInput, consumePrice: boolean, consumeEquity: boolean) => {
  const timestamps = [
    ...(consumePrice && input.price ? [availabilityForDecision(input.price)!] : []),
    ...(consumeEquity && input.equity ? [input.equity.availableAt] : []),
    ...(consumeEquity && input.equity?.currency !== input.executionCurrency && input.fx
      ? [input.fx.availableAt]
      : []),
  ];
  return timestamps.sort((left, right) => instant(right) - instant(left))[0] ?? input.evaluationAt;
};

const isSizingResult = (value: unknown): value is SizingUnavailable | SizingRejected =>
  Boolean(
    value &&
    typeof value === 'object' &&
    'status' in value &&
    ((value as { status?: unknown }).status === 'unavailable' ||
      (value as { status?: unknown }).status === 'rejected'),
  );

interface SizingCalculation {
  requested: DecimalValue;
  targetQuantity?: DecimalValue;
}

const calculateRequested = (
  input: SizingInput,
  lot: DecimalValue,
  current: DecimalValue,
  price: SizingPriceFact | undefined,
  equity: DecimalValue | undefined,
): SizingCalculation | SizingRejected => {
  if (input.rule.type === 'fixedQuantity') {
    const quantity = parse(input.rule.quantity, 'fixedQuantity.quantity');
    if (!asDecimal(quantity)) return quantity;
    if (!quantity.isPositive())
      return reject('INVALID_PARAMETER', 'fixedQuantity 必须为正数', ['fixedQuantity.quantity']);
    return { requested: quantity };
  }
  if (!price) return reject('INVALID_PARAMETER', '缺少 sizing price', ['price=missing']);
  const executionPrice = DecimalValue.from(price.value);
  if (input.rule.type === 'fixedAmount') {
    const amount = parse(input.rule.amount, 'fixedAmount.amount');
    if (!asDecimal(amount)) return amount;
    if (!amount.isPositive())
      return reject('INVALID_PARAMETER', 'fixedAmount 必须为正数', ['fixedAmount.amount']);
    return { requested: amount.dividedBy(executionPrice, 40) };
  }
  if (!equity) return reject('INVALID_PARAMETER', '缺少 sizing equity', ['equity=missing']);
  if (input.rule.type === 'percentOfEquity') {
    const percent = parse(input.rule.percent, 'percentOfEquity.percent');
    if (!asDecimal(percent)) return percent;
    if (!percent.isPositive() || percent.compareTo('1') > 0) {
      return reject('INVALID_PARAMETER', 'percentOfEquity 必须在 (0, 1] 内', [
        'percentOfEquity.percent',
      ]);
    }
    return { requested: equity.times(percent).dividedBy(executionPrice, 40) };
  }
  const weight = parse(input.rule.weight, 'targetWeight.weight');
  if (!asDecimal(weight)) return weight;
  if (!weight.isPositive() || weight.compareTo('1') > 0) {
    return reject('INVALID_PARAMETER', 'targetWeight 必须在 (0, 1] 内', ['targetWeight.weight']);
  }
  const targetQuantity = floorToLot(equity.times(weight).dividedBy(executionPrice, 40), lot);
  return { targetQuantity, requested: targetQuantity.minus(current) };
};

const buildInputFacts = (
  input: SizingInput,
  priceNeeded: boolean,
  equityNeeded: boolean,
  price: SizingPriceFact | undefined,
) => {
  const inputFacts = [`evaluationAt=${input.evaluationAt}`];
  if (priceNeeded && price) {
    inputFacts.push(
      `price.occurredAt=${price.occurredAt}`,
      `price.availableAt=${price.availableAt}`,
    );
  }
  if (equityNeeded && input.equity) {
    inputFacts.push(
      `equity.occurredAt=${input.equity.occurredAt}`,
      `equity.availableAt=${input.equity.availableAt}`,
    );
  }
  if (equityNeeded && input.equity?.currency !== input.executionCurrency && input.fx) {
    inputFacts.push(
      `fx.occurredAt=${input.fx.occurredAt}`,
      `fx.availableAt=${input.fx.availableAt}`,
    );
  }
  return inputFacts;
};

const finalizeSizing = (
  input: SizingInput,
  lot: DecimalValue,
  calculation: SizingCalculation,
  inputFacts: string[],
  priceNeeded: boolean,
  equityNeeded: boolean,
): SizingResult => {
  const { requested, targetQuantity } = calculation;
  if (requested.isNegative() && input.rule.type !== 'targetWeight') {
    return reject('INVALID_PARAMETER', '数量不能为负数', ['requestedQuantity']);
  }
  const normalized = floorToLot(absolute(requested), lot);
  if (!normalized.isPositive()) {
    if (requested.isZero()) {
      return {
        status: 'available',
        side: 'none',
        requestedQuantity: '0',
        normalizedQuantity: '0',
        ...(targetQuantity ? { targetQuantity: targetQuantity.toString() } : {}),
        occurredAt: input.evaluationAt,
        availableAt: latestAvailableAt(input, priceNeeded, equityNeeded),
        inputFacts: facts(...inputFacts),
      };
    }
    return reject('QUANTITY_BELOW_LOT', '数量不足最小交易单位', [
      ...inputFacts,
      `lotSize=${input.lotSize}`,
      `requestedQuantity=${requested.toString()}`,
    ]);
  }
  return {
    status: 'available',
    side: requested.isNegative() ? 'sell' : 'buy',
    requestedQuantity: absolute(requested).toString(),
    normalizedQuantity: normalized.toString(),
    ...(targetQuantity ? { targetQuantity: targetQuantity.toString() } : {}),
    occurredAt: input.evaluationAt,
    availableAt: latestAvailableAt(input, priceNeeded, equityNeeded),
    inputFacts: facts(...inputFacts),
  };
};

export const computeSizing = (input: SizingInput): SizingResult => {
  if (input.accountingBasis === 'normalized-series') return computeNormalizedSizing(input);
  if (input.normalizedExecution !== undefined) {
    return reject('EXECUTION_MODEL_UNAVAILABLE', '原始份额定仓不能携带归一化执行假设', [
      'accountingBasis=raw-events',
      'normalizedExecution=unexpected',
    ]);
  }

  const invalidEvaluation = validateTime(input.evaluationAt, 'evaluationAt');
  if (invalidEvaluation) return invalidEvaluation;
  if (input.lotSize === undefined) {
    return reject('INVALID_PARAMETER', '原始份额定仓缺少 lotSize', ['lotSize=missing']);
  }
  const lot = parse(input.lotSize, 'lotSize');
  const current = parse(input.currentQuantity, 'currentQuantity');
  if (!asDecimal(lot)) return lot;
  if (!asDecimal(current)) return current;
  if (!lot.isPositive() || current.isNegative()) {
    return reject('INVALID_PARAMETER', 'lotSize 必须为正数且 currentQuantity 不能为负数', [
      `lotSize=${input.lotSize}`,
      `currentQuantity=${input.currentQuantity}`,
    ]);
  }

  const priceNeeded = input.rule.type !== 'fixedQuantity';
  const price = priceNeeded ? requirePrice(input) : undefined;
  if (price && isSizingResult(price)) return price;
  const equityNeeded = input.rule.type === 'percentOfEquity' || input.rule.type === 'targetWeight';
  const equity = equityNeeded ? requireEquity(input) : undefined;
  if (equity && isSizingResult(equity)) return equity;
  const calculation = calculateRequested(
    input,
    lot,
    current,
    price && !isSizingResult(price) ? price : undefined,
    equity && !isSizingResult(equity) ? equity : undefined,
  );
  if ('status' in calculation) return calculation;
  return finalizeSizing(
    input,
    lot,
    calculation,
    buildInputFacts(
      input,
      priceNeeded,
      equityNeeded,
      price && !isSizingResult(price) ? price : undefined,
    ),
    priceNeeded,
    equityNeeded,
  );
};

const isFrozenNormalizedExecution = (
  value: FrozenNormalizedExecutionAssumptions | undefined,
): value is FrozenNormalizedExecutionAssumptions => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const expectedKeys = [
    'dailyPriceLimit',
    'feeBasis',
    'lotSizeConstraint',
    'priceCoordinate',
    'quantityUnits',
    'tickSizeConstraint',
  ];
  return (
    keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index]) &&
    value.priceCoordinate === 'continuous-decimal' &&
    value.quantityUnits === 'continuous-normalized-decimal' &&
    value.lotSizeConstraint === 'not-applied' &&
    value.tickSizeConstraint === 'not-applied' &&
    value.dailyPriceLimit === 'not-applied' &&
    value.feeBasis === 'simulatedTurnover'
  );
};

const calculateNormalizedRequested = (
  input: SizingInput,
  current: DecimalValue,
  price: SizingPriceFact | undefined,
  equity: DecimalValue | undefined,
): SizingCalculation | SizingRejected => {
  if (input.rule.type === 'fixedQuantity') {
    return reject('UNSUPPORTED_UNIT', '固定绝对数量不能解释为归一化单位', [
      'sizing.type=fixedQuantity',
      'accountingBasis=normalized-series',
    ]);
  }
  if (!price) return reject('INVALID_PARAMETER', '缺少 sizing price', ['price=missing']);
  const executionPrice = DecimalValue.from(price.value);
  if (input.rule.type === 'fixedAmount') {
    const amount = parse(input.rule.amount, 'fixedAmount.amount');
    if (!asDecimal(amount)) return amount;
    if (!amount.isPositive()) {
      return reject('INVALID_PARAMETER', 'fixedAmount 必须为正数', ['fixedAmount.amount']);
    }
    return { requested: amount.dividedBy(executionPrice, 40) };
  }
  if (!equity) return reject('INVALID_PARAMETER', '缺少 sizing equity', ['equity=missing']);
  if (input.rule.type === 'percentOfEquity') {
    const percent = parse(input.rule.percent, 'percentOfEquity.percent');
    if (!asDecimal(percent)) return percent;
    if (!percent.isPositive() || percent.compareTo('1') > 0) {
      return reject('INVALID_PARAMETER', 'percentOfEquity 必须在 (0, 1] 内', [
        'percentOfEquity.percent',
      ]);
    }
    return { requested: equity.times(percent).dividedBy(executionPrice, 40) };
  }
  const weight = parse(input.rule.weight, 'targetWeight.weight');
  if (!asDecimal(weight)) return weight;
  if (!weight.isPositive() || weight.compareTo('1') > 0) {
    return reject('INVALID_PARAMETER', 'targetWeight 必须在 (0, 1] 内', ['targetWeight.weight']);
  }
  const targetQuantity = equity.times(weight).dividedBy(executionPrice, 40);
  return { targetQuantity, requested: targetQuantity.minus(current) };
};

const finalizeNormalizedSizing = (
  input: SizingInput,
  calculation: SizingCalculation,
  inputFacts: string[],
  priceNeeded: boolean,
  equityNeeded: boolean,
): SizingResult => {
  const { requested, targetQuantity } = calculation;
  if (requested.isNegative() && input.rule.type !== 'targetWeight') {
    return reject('INVALID_PARAMETER', '数量不能为负数', ['requestedQuantity']);
  }
  const normalized = absolute(requested);
  if (normalized.isZero()) {
    return {
      status: 'available',
      accountingBasis: 'normalized-series',
      side: 'none',
      requestedQuantity: '0',
      normalizedQuantity: '0',
      ...(targetQuantity ? { targetQuantity: targetQuantity.toString() } : {}),
      occurredAt: input.evaluationAt,
      availableAt: latestAvailableAt(input, priceNeeded, equityNeeded),
      inputFacts: facts(...inputFacts),
    };
  }
  return {
    status: 'available',
    accountingBasis: 'normalized-series',
    side: requested.isNegative() ? 'sell' : 'buy',
    requestedQuantity: normalized.toString(),
    normalizedQuantity: normalized.toString(),
    ...(targetQuantity ? { targetQuantity: targetQuantity.toString() } : {}),
    occurredAt: input.evaluationAt,
    availableAt: latestAvailableAt(input, priceNeeded, equityNeeded),
    inputFacts: facts(...inputFacts),
  };
};

/**
 * Sizes continuous units in a frozen adjusted-price coordinate. The explicit
 * execution assumptions are mandatory and real market lot size is never read.
 */
export const computeNormalizedSizing = (input: SizingInput): SizingResult => {
  const invalidEvaluation = validateTime(input.evaluationAt, 'evaluationAt');
  if (invalidEvaluation) return invalidEvaluation;
  if (!isFrozenNormalizedExecution(input.normalizedExecution)) {
    return reject('EXECUTION_MODEL_UNAVAILABLE', '缺少有效的归一化执行研究假设', [
      'normalizedExecution=missing-or-incompatible',
    ]);
  }
  const current = parse(input.currentQuantity, 'currentQuantity');
  if (!asDecimal(current)) return current;
  if (current.isNegative()) {
    return reject('INVALID_PARAMETER', '归一化 currentQuantity 不能为负数', [
      `currentQuantity=${input.currentQuantity}`,
    ]);
  }

  // The execution adapter expresses liquidation as a zero target weight. Its
  // quantity comes from the normalized ledger, not an absolute-share strategy rule.
  if (input.rule.type === 'targetWeight') {
    const weight = parse(input.rule.weight, 'targetWeight.weight');
    if (!asDecimal(weight)) return weight;
    if (weight.isZero()) {
      return finalizeNormalizedSizing(
        input,
        { targetQuantity: weight, requested: current.times('-1') },
        buildInputFacts(input, false, false, undefined),
        false,
        false,
      );
    }
  }

  const priceNeeded = input.rule.type !== 'fixedQuantity';
  const price = priceNeeded ? requirePrice(input) : undefined;
  if (price && isSizingResult(price)) return price;
  const equityNeeded = input.rule.type === 'percentOfEquity' || input.rule.type === 'targetWeight';
  const equity = equityNeeded ? requireEquity(input) : undefined;
  if (equity && isSizingResult(equity)) return equity;
  const calculation = calculateNormalizedRequested(
    input,
    current,
    price && !isSizingResult(price) ? price : undefined,
    equity && !isSizingResult(equity) ? equity : undefined,
  );
  if ('status' in calculation) return calculation;
  return finalizeNormalizedSizing(
    input,
    calculation,
    buildInputFacts(
      input,
      priceNeeded,
      equityNeeded,
      price && !isSizingResult(price) ? price : undefined,
    ),
    priceNeeded,
    equityNeeded,
  );
};
