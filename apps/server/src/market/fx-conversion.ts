import type { CurrencyV1, FxRateV1, FxRatesResponseV1 } from '@thesis-ledger/schemas';

export type FxConversionMode = 'current-rate' | 'historical-rate';

export type FxConversionOptions = {
  fxMerge?: boolean;
  baseCurrency?: CurrencyV1;
};

export type FxConversionMeta = {
  version: number;
  evidenceVersion: string;
  enabled: boolean;
  status: 'disabled' | 'not_needed' | 'ready' | 'stale' | 'blocked';
  baseCurrency?: CurrencyV1;
  asOf?: string;
  fxAsOf?: string;
  estimated?: boolean;
  conversionMode?: FxConversionMode;
  stale?: boolean;
  fxStale?: boolean;
  missingCurrencies: CurrencyV1[];
  rates: FxRateV1[];
};

export type ResolvedFx = {
  meta: FxConversionMeta;
  rates: Map<CurrencyV1, number>;
};

type FxMarketClient = {
  getFxRates(input: {
    baseCurrency: CurrencyV1;
    currencies: readonly CurrencyV1[];
    asOf?: string;
  }): Promise<FxRatesResponseV1>;
};

export type CurrencyAmount = {
  currency: CurrencyV1;
  amount: number;
};

export type CurrencyAggregate = {
  value: number | null;
  knownValue: number;
  complete: boolean;
  missingCurrencies: CurrencyV1[];
};

const fxVersion = 1;

export const supportedCurrency = (value: unknown): CurrencyV1 | undefined =>
  value === 'CNY' || value === 'HKD' || value === 'USD' ? value : undefined;

const dateOnly = (value: Date) => value.toISOString().slice(0, 10);

const evidenceVersion = (
  response: Pick<FxRatesResponseV1, 'version' | 'baseCurrency' | 'asOf' | 'rates'>,
) =>
  [
    `fx-v${response.version}`,
    response.baseCurrency,
    response.asOf,
    ...[...response.rates]
      .sort((left, right) =>
        `${left.fromCurrency}:${left.toCurrency}`.localeCompare(
          `${right.fromCurrency}:${right.toCurrency}`,
        ),
      )
      .map((rate) =>
        [
          rate.fromCurrency,
          rate.toCurrency,
          rate.rate ?? 'unavailable',
          rate.rateDate ?? '',
          rate.provider ?? '',
          rate.freshness,
          rate.available ? 'available' : 'unavailable',
        ].join(':'),
      ),
  ].join('|');

const unavailableEvidenceVersion = (baseCurrency: CurrencyV1, asOf: Date) =>
  `fx-v${fxVersion}:unavailable:${baseCurrency}:${dateOnly(asOf)}`;

const statusFor = (missingCurrencies: readonly CurrencyV1[], stale: boolean) => {
  if (missingCurrencies.length > 0) return 'blocked' as const;
  if (stale) return 'stale' as const;
  return 'ready' as const;
};

const disabledMeta = (
  currencies: readonly CurrencyV1[],
  baseCurrency: CurrencyV1,
  conversionMode: FxConversionMode,
): FxConversionMeta => ({
  version: fxVersion,
  evidenceVersion: `fx-v${fxVersion}:disabled:${baseCurrency}:${[...new Set(currencies)]
    .sort()
    .join(',')}`,
  enabled: false,
  status:
    currencies.length > 0 && currencies.every((currency) => currency === baseCurrency)
      ? 'not_needed'
      : 'disabled',
  baseCurrency,
  conversionMode,
  missingCurrencies: [],
  rates: [],
});

export const resolveFx = async (
  market: FxMarketClient,
  currencies: readonly CurrencyV1[],
  options: FxConversionOptions,
  asOf: Date,
  conversionMode: FxConversionMode = 'current-rate',
): Promise<ResolvedFx> => {
  const baseCurrency = options.baseCurrency ?? 'CNY';
  const uniqueCurrencies = [...new Set(currencies)];
  if (options.fxMerge !== true) {
    return { meta: disabledMeta(uniqueCurrencies, baseCurrency, conversionMode), rates: new Map() };
  }

  const requestedCurrencies = [...new Set([...uniqueCurrencies, baseCurrency])];
  if (requestedCurrencies.every((currency) => currency === baseCurrency)) {
    return {
      meta: {
        version: fxVersion,
        evidenceVersion: `fx-v${fxVersion}:identity:${baseCurrency}:${dateOnly(asOf)}`,
        enabled: false,
        status: 'not_needed',
        baseCurrency,
        asOf: dateOnly(asOf),
        fxAsOf: dateOnly(asOf),
        conversionMode,
        missingCurrencies: [],
        rates: [],
      },
      rates: new Map([[baseCurrency, 1]]),
    };
  }

  let response: FxRatesResponseV1;
  try {
    response = await market.getFxRates({
      baseCurrency,
      currencies: requestedCurrencies,
      asOf: dateOnly(asOf),
    });
  } catch {
    return {
      meta: {
        version: fxVersion,
        evidenceVersion: unavailableEvidenceVersion(baseCurrency, asOf),
        enabled: true,
        status: 'blocked',
        baseCurrency,
        asOf: dateOnly(asOf),
        fxAsOf: dateOnly(asOf),
        estimated: true,
        conversionMode,
        missingCurrencies: uniqueCurrencies.filter((currency) => currency !== baseCurrency),
        rates: [],
      },
      rates: new Map([[baseCurrency, 1]]),
    };
  }

  const available = response.rates.filter(
    (rate) => rate.available && rate.rate !== undefined && rate.rate > 0,
  );
  const rates = new Map<CurrencyV1, number>(
    available.map((rate) => [rate.fromCurrency, rate.rate!]),
  );
  rates.set(baseCurrency, 1);
  const missingCurrencies = uniqueCurrencies.filter(
    (currency) => currency !== baseCurrency && !rates.has(currency),
  );
  const stale = available.some((rate) => rate.stale);
  return {
    meta: {
      version: response.version,
      evidenceVersion: evidenceVersion(response),
      enabled: true,
      status: statusFor(missingCurrencies, stale),
      baseCurrency,
      asOf: response.asOf,
      fxAsOf: response.asOf,
      estimated: true,
      conversionMode,
      stale,
      fxStale: stale,
      missingCurrencies,
      rates: response.rates,
    },
    rates,
  };
};

export const convertAmount = (amount: number, currency: CurrencyV1, fx: ResolvedFx) => {
  if (!fx.meta.enabled || fx.meta.status === 'disabled' || fx.meta.status === 'not_needed')
    return amount;
  const rate = fx.rates.get(currency);
  return rate === undefined ? null : amount * rate;
};

export const aggregateCurrencyAmounts = (
  amounts: readonly CurrencyAmount[],
  fx: ResolvedFx,
): CurrencyAggregate => {
  const currencies = [...new Set(amounts.map((item) => item.currency))];
  if (amounts.length === 0)
    return { value: 0, knownValue: 0, complete: true, missingCurrencies: [] };

  if (!fx.meta.enabled || fx.meta.status === 'disabled') {
    if (currencies.length === 1) {
      const value = amounts.reduce((total, item) => total + item.amount, 0);
      return { value, knownValue: value, complete: true, missingCurrencies: [] };
    }
    return {
      value: null,
      knownValue: 0,
      complete: false,
      missingCurrencies: currencies,
    };
  }

  let knownValue = 0;
  const missingCurrencies = new Set<CurrencyV1>();
  for (const item of amounts) {
    const converted = convertAmount(item.amount, item.currency, fx);
    if (converted === null) missingCurrencies.add(item.currency);
    else knownValue += converted;
  }
  const missing = [...missingCurrencies].sort();
  return {
    value: missing.length === 0 ? knownValue : null,
    knownValue,
    complete: missing.length === 0,
    missingCurrencies: missing,
  };
};
