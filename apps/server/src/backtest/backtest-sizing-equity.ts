import {
  valueSimulationLedger,
  type BacktestCurrency,
  type PortfolioValuationPolicy,
  type SimulationFxRate,
  type SimulationLedgerState,
  type SimulationValuationPrice,
  type SizingEquityFact,
  type SizingFxFact,
} from '@thesis-ledger/domain';

interface BacktestSizingEquityInput {
  state: SimulationLedgerState;
  executionCurrency: BacktestCurrency;
  evaluationAt: string;
  policy: PortfolioValuationPolicy;
  price: SimulationValuationPrice;
  fxRates: readonly SimulationFxRate[];
}

const availableAt = (rate: SimulationFxRate, evaluationAt: string) =>
  Date.parse(rate.occurredAt) <= Date.parse(evaluationAt) &&
  Date.parse(rate.availableAt) <= Date.parse(evaluationAt);

const newest = (rates: readonly SimulationFxRate[]) =>
  [...rates].sort(
    (left, right) =>
      Date.parse(right.occurredAt) - Date.parse(left.occurredAt) ||
      Date.parse(right.availableAt) - Date.parse(left.availableAt),
  )[0];

const selectSizingFx = (
  equityCurrency: BacktestCurrency,
  executionCurrency: BacktestCurrency,
  rates: readonly SimulationFxRate[],
  evaluationAt: string,
): SimulationFxRate | undefined => {
  const candidates = rates.filter((rate) => availableAt(rate, evaluationAt));
  const direct = newest(
    candidates.filter(
      (rate) => rate.fromCurrency === equityCurrency && rate.toCurrency === executionCurrency,
    ),
  );
  if (direct) return direct;
  return newest(
    candidates.filter(
      (rate) => rate.fromCurrency === executionCurrency && rate.toCurrency === equityCurrency,
    ),
  );
};

const toSizingFx = (rate: SimulationFxRate): SizingFxFact => {
  const stale =
    rate.stale === true || rate.completeness === 'partial' || rate.completeness === 'unavailable';
  return {
    fromCurrency: rate.fromCurrency,
    toCurrency: rate.toCurrency,
    rate: rate.rate,
    occurredAt: rate.occurredAt,
    availableAt: rate.availableAt,
    ...(stale ? { status: 'stale' as const, reason: '估值 FX 不完整或已过期' } : {}),
  };
};

export const buildBacktestSizingEquity = (
  input: BacktestSizingEquityInput,
): { equity: SizingEquityFact; fx?: SizingFxFact } => {
  const valuation = valueSimulationLedger(input.state, {
    valuationAt: input.evaluationAt,
    policy: input.policy,
    prices: [input.price],
    fxRates: input.fxRates,
  });
  const unavailable = valuation.status !== 'available' || valuation.baseCurrencyValue === undefined;
  const equity: SizingEquityFact = {
    amount: valuation.baseCurrencyValue ?? '0',
    currency: valuation.baseCurrency,
    occurredAt: input.evaluationAt,
    availableAt: input.evaluationAt,
    ...(unavailable
      ? {
          status: 'unavailable' as const,
          reason: valuation.unavailableReasons.join(',') || '总权益估值不可用',
        }
      : {}),
  };
  if (equity.currency === input.executionCurrency) return { equity };
  const rate = selectSizingFx(
    equity.currency,
    input.executionCurrency,
    input.fxRates,
    input.evaluationAt,
  );
  return { equity, ...(rate ? { fx: toSizingFx(rate) } : {}) };
};
