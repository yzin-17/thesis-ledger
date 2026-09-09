import { DecimalValue } from './decimal.js';
import type {
  BacktestAssetType,
  BacktestCurrency,
  PortfolioValuationPolicy,
  V2BacktestMarket,
} from './backtest-v2.js';
import type { SimulationLedgerState } from './simulation-ledger.js';

export type SimulationValuationStatus = 'available' | 'partial' | 'unavailable';

export interface SimulationValuationPrice {
  symbol: string;
  market: V2BacktestMarket;
  assetType: BacktestAssetType;
  currency: BacktestCurrency;
  price: string;
  occurredAt: string;
  availableAt: string;
}

export interface SimulationFxRate {
  fromCurrency: BacktestCurrency;
  toCurrency: BacktestCurrency;
  rate: string;
  occurredAt: string;
  availableAt: string;
  provider: string;
  providerRevision: string;
  stale?: boolean;
  completeness?: 'complete' | 'partial' | 'unavailable';
}

export interface SimulationCurrencyValuation {
  currency: BacktestCurrency;
  cash: string;
  position?: string;
  total?: string;
  status: SimulationValuationStatus;
  reason?: string;
}

export interface SimulationFxValuation {
  fromCurrency: BacktestCurrency;
  toCurrency: BacktestCurrency;
  status: 'used' | 'unavailable';
  rate?: string;
  availableAt?: string;
  provider?: string;
  providerRevision?: string;
  reason?: string;
}

export interface SimulationValuationResult {
  valuationAt: string;
  baseCurrency: BacktestCurrency;
  status: SimulationValuationStatus;
  originalCurrency: Readonly<Record<BacktestCurrency, SimulationCurrencyValuation>>;
  baseCurrencyValue?: string;
  fx: readonly SimulationFxValuation[];
  unavailableReasons: readonly string[];
  policy: PortfolioValuationPolicy;
}

export interface SimulationValuationInput {
  valuationAt: string;
  policy: PortfolioValuationPolicy;
  prices: readonly SimulationValuationPrice[];
  fxRates: readonly SimulationFxRate[];
}

const currencies = ['CNY', 'HKD', 'USD'] as const;

const isBeforeOrAt = (value: string, at: string) => {
  const valueTime = Date.parse(value);
  const atTime = Date.parse(at);
  return Number.isFinite(valueTime) && Number.isFinite(atTime) && valueTime <= atTime;
};

const newest = <T extends { occurredAt: string; availableAt: string }>(values: readonly T[]) =>
  [...values].sort((left, right) => {
    const occurred = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
    if (occurred !== 0) return occurred;
    return Date.parse(right.availableAt) - Date.parse(left.availableAt);
  })[0];

const currencyCash = (state: SimulationLedgerState, currency: BacktestCurrency) =>
  DecimalValue.from(state.cash[currency].settled).plus(state.cash[currency].unsettled);

const valuePosition = (
  state: SimulationLedgerState,
  currency: BacktestCurrency,
  prices: readonly SimulationValuationPrice[],
  valuationAt: string,
) => {
  if (currency !== state.position.currency || DecimalValue.from(state.position.quantity).isZero()) {
    return { value: '0', available: true };
  }
  const matchingPrices = prices.filter(
    (price) =>
      price.symbol === state.position.symbol &&
      price.market === state.position.market &&
      price.assetType === state.position.assetType &&
      price.currency === currency,
  );
  const invalidPrice = matchingPrices.some(
    (price) =>
      !Number.isFinite(Date.parse(price.occurredAt)) ||
      !Number.isFinite(Date.parse(price.availableAt)) ||
      (() => {
        try {
          DecimalValue.from(price.price);
          return false;
        } catch {
          return true;
        }
      })(),
  );
  if (invalidPrice) return { available: false, reason: 'PRICE_INVALID' };
  const candidates = matchingPrices.filter(
    (price) =>
      isBeforeOrAt(price.occurredAt, valuationAt) && isBeforeOrAt(price.availableAt, valuationAt),
  );
  const price = newest(candidates);
  if (!price) return { available: false, reason: 'PRICE_UNAVAILABLE' };
  try {
    const value = DecimalValue.from(state.position.quantity).times(price.price);
    return { value: value.toString(), available: true };
  } catch {
    return { available: false, reason: 'PRICE_INVALID' };
  }
};

const priceValuation = (
  state: SimulationLedgerState,
  currency: BacktestCurrency,
  prices: readonly SimulationValuationPrice[],
  valuationAt: string,
): SimulationCurrencyValuation => {
  const cash = currencyCash(state, currency).toString();
  const position = valuePosition(state, currency, prices, valuationAt);
  if (!position.available) {
    return {
      currency,
      cash,
      status: 'partial',
      ...(position.reason === undefined ? {} : { reason: position.reason }),
    };
  }
  const total = DecimalValue.from(cash)
    .plus(position.value ?? '0')
    .toString();
  return {
    currency,
    cash,
    ...(position.value === undefined ? {} : { position: position.value }),
    total,
    status: 'available',
  };
};

const validFxRate = (rate: SimulationFxRate) => {
  if (
    !Number.isFinite(Date.parse(rate.occurredAt)) ||
    !Number.isFinite(Date.parse(rate.availableAt))
  ) {
    return false;
  }
  try {
    return DecimalValue.from(rate.rate).isPositive();
  } catch {
    return false;
  }
};

const selectFx = (
  fromCurrency: BacktestCurrency,
  toCurrency: BacktestCurrency,
  rates: readonly SimulationFxRate[],
  valuationAt: string,
) => {
  const directCandidates = rates.filter(
    (rate) => rate.fromCurrency === fromCurrency && rate.toCurrency === toCurrency,
  );
  if (directCandidates.some((rate) => !validFxRate(rate))) {
    return { invalidReason: 'FX_INVALID' } as const;
  }
  const direct = newest(
    directCandidates.filter(
      (rate) =>
        isBeforeOrAt(rate.occurredAt, valuationAt) && isBeforeOrAt(rate.availableAt, valuationAt),
    ),
  );
  if (direct) return { rate: direct, inverted: false };
  const inverseCandidates = rates.filter(
    (rate) => rate.fromCurrency === toCurrency && rate.toCurrency === fromCurrency,
  );
  if (inverseCandidates.some((rate) => !validFxRate(rate))) {
    return { invalidReason: 'FX_INVALID' } as const;
  }
  const inverse = newest(
    inverseCandidates.filter(
      (rate) =>
        isBeforeOrAt(rate.occurredAt, valuationAt) && isBeforeOrAt(rate.availableAt, valuationAt),
    ),
  );
  return inverse ? { rate: inverse, inverted: true } : undefined;
};

const isStale = (rate: SimulationFxRate) =>
  rate.stale === true || rate.completeness === 'unavailable' || rate.completeness === 'partial';

const convert = (amount: string, rate: SimulationFxRate, inverted: boolean) => {
  const value = DecimalValue.from(amount);
  const fx = DecimalValue.from(rate.rate);
  if (fx.isZero() || fx.isNegative()) return undefined;
  return inverted ? value.dividedBy(fx).toString() : value.times(fx).toString();
};

const addTo = (left: DecimalValue, right: string) => left.plus(right);

export const valueSimulationLedger = (
  state: SimulationLedgerState,
  input: SimulationValuationInput,
): SimulationValuationResult => {
  const originalCurrency = {
    CNY: priceValuation(state, 'CNY', input.prices, input.valuationAt),
    HKD: priceValuation(state, 'HKD', input.prices, input.valuationAt),
    USD: priceValuation(state, 'USD', input.prices, input.valuationAt),
  } satisfies Record<BacktestCurrency, SimulationCurrencyValuation>;
  const unavailableReasons: string[] = [];
  const fx: SimulationFxValuation[] = [];
  let converted = DecimalValue.from('0');
  let hasConvertedValue = false;

  if (!Number.isFinite(Date.parse(input.valuationAt))) {
    return {
      valuationAt: input.valuationAt,
      baseCurrency: state.baseCurrency,
      status: 'unavailable',
      originalCurrency,
      fx: [],
      unavailableReasons: ['VALUATION_TIME_INVALID'],
      policy: input.policy,
    };
  }

  for (const currency of currencies) {
    const valuation = originalCurrency[currency];
    if (valuation.status !== 'available') {
      unavailableReasons.push(`${currency}:${valuation.reason ?? 'VALUE_UNAVAILABLE'}`);
    }
    const amount = valuation.total ?? valuation.cash;
    if (currency === state.baseCurrency) {
      converted = addTo(converted, amount);
      if (!DecimalValue.from(amount).isZero()) hasConvertedValue = true;
      continue;
    }
    if (DecimalValue.from(amount).isZero()) continue;
    const selected = selectFx(currency, state.baseCurrency, input.fxRates, input.valuationAt);
    if (selected?.invalidReason) {
      fx.push({
        fromCurrency: currency,
        toCurrency: state.baseCurrency,
        status: 'unavailable',
        reason: selected.invalidReason,
      });
      unavailableReasons.push(`${currency}:${selected.invalidReason}`);
      continue;
    }
    if (!selected) {
      fx.push({
        fromCurrency: currency,
        toCurrency: state.baseCurrency,
        status: 'unavailable',
        reason: 'FX_UNAVAILABLE',
      });
      unavailableReasons.push(`${currency}:FX_UNAVAILABLE`);
      continue;
    }
    if (isStale(selected.rate)) {
      fx.push({
        fromCurrency: currency,
        toCurrency: state.baseCurrency,
        status: 'unavailable',
        availableAt: selected.rate.availableAt,
        provider: selected.rate.provider,
        providerRevision: selected.rate.providerRevision,
        reason: 'FX_STALE',
      });
      unavailableReasons.push(`${currency}:FX_STALE`);
      continue;
    }
    const convertedValue = convert(amount, selected.rate, selected.inverted);
    if (convertedValue === undefined) {
      fx.push({
        fromCurrency: currency,
        toCurrency: state.baseCurrency,
        status: 'unavailable',
        availableAt: selected.rate.availableAt,
        provider: selected.rate.provider,
        providerRevision: selected.rate.providerRevision,
        reason: 'FX_INVALID',
      });
      unavailableReasons.push(`${currency}:FX_INVALID`);
      continue;
    }
    converted = addTo(converted, convertedValue);
    if (!DecimalValue.from(amount).isZero()) hasConvertedValue = true;
    fx.push({
      fromCurrency: currency,
      toCurrency: state.baseCurrency,
      status: 'used',
      rate: selected.rate.rate,
      availableAt: selected.rate.availableAt,
      provider: selected.rate.provider,
      providerRevision: selected.rate.providerRevision,
    });
  }

  const hasUnavailable = unavailableReasons.length > 0;
  let status: SimulationValuationStatus = 'available';
  if (hasUnavailable) status = hasConvertedValue ? 'partial' : 'unavailable';
  return {
    valuationAt: input.valuationAt,
    baseCurrency: state.baseCurrency,
    status,
    originalCurrency,
    ...(hasConvertedValue || status === 'available'
      ? { baseCurrencyValue: converted.toString() }
      : {}),
    fx,
    unavailableReasons,
    policy: input.policy,
  };
};
