import {
  DecimalValue,
  calculateExecutionModelFees,
  deterministicResultChecksum,
  fitNormalizedQuantityToAvailableCash,
  resolveExecutionModelSegment,
  resolveNormalizedExecutionModelSegment,
  type BacktestBenchmarkCostAssumption,
  type BacktestBenchmarkReturn,
  type FrozenExecutionModel,
  type FrozenExecutionModelFees,
} from '@thesis-ledger/domain';
import type { RunConfigV3, BacktestStrategy } from '@thesis-ledger/schemas';

type BenchmarkCostReport = BacktestBenchmarkCostAssumption | { kind: 'unavailable' };

export interface BenchmarkCostCalculation {
  status: 'available';
  value: string;
  quantity: string;
  initialCash: string;
  buyGross: string;
  buyFees: string;
  buyDebit: string;
  residualCash: string;
  sellGross: string;
  sellFees: string;
  finalCash: string;
}

export type BenchmarkCostReturn =
  BenchmarkCostCalculation | Extract<BacktestBenchmarkReturn, { status: 'unavailable' }>;

export interface BacktestV3BenchmarkCostResolution {
  assumption: BenchmarkCostReport;
  identityAssumption?: BacktestBenchmarkCostAssumption;
  unavailableReason?: string;
  result: BenchmarkCostReturn;
}

interface FeeRate {
  status: 'supported';
  rate: DecimalValue;
}

interface UnsupportedFeeRate {
  status: 'unsupported';
  reason: string;
}

const COST_MODEL_VERSION =
  'v3-normalized-buy-first-close-liquidate-last-close-per-charge-half-up-2-v1';

const instrumentCurrency = (market: BacktestStrategy['executionInstrument']['market']) => {
  if (market === 'CN') return 'CNY' as const;
  if (market === 'HK') return 'HKD' as const;
  return 'USD' as const;
};

const instrumentRouteType = (assetType: BacktestStrategy['executionInstrument']['assetType']) => {
  if (assetType === 'stock') return 'STOCK';
  if (assetType === 'etf') return 'ETF';
  return 'NAV_FUND';
};

const chargedFeeRate = (
  segment: FrozenExecutionModel['segments'][number],
  currency: string,
): FeeRate | UnsupportedFeeRate => {
  if (segment.execution.mode !== 'exchange' || !segment.fees) {
    return { status: 'unsupported', reason: 'non-exchange execution fees' };
  }
  if (
    segment.fees.currency !== currency ||
    segment.fees.collection !== 'perFillPerCharge' ||
    segment.fees.rounding.mode !== 'halfUp' ||
    segment.fees.rounding.decimalPlaces !== 2
  ) {
    return {
      status: 'unsupported',
      reason: 'fee currency, collection, or rounding is unsupported',
    };
  }
  let total = DecimalValue.from('0');
  for (const key of [
    'commission',
    'stampDuty',
    'transferFee',
    'regulatoryFee',
    'handlingFee',
  ] as const) {
    const fee = segment.fees[key];
    if (fee.treatment !== 'charged') continue;
    if (fee.basis !== 'turnover' || fee.minimum.kind !== 'none') {
      return { status: 'unsupported', reason: `${key} has a non-proportional basis or minimum` };
    }
    if (fee.side !== 'both' && DecimalValue.from(fee.rate).isPositive()) {
      return { status: 'unsupported', reason: `${key} differs by transaction side` };
    }
    total = total.plus(fee.rate);
  }
  return { status: 'supported', rate: total };
};

const unavailable = (
  reason: string,
  assumption: BenchmarkCostReport = { kind: 'unavailable' },
  identityAssumption?: BacktestBenchmarkCostAssumption,
): BacktestV3BenchmarkCostResolution => ({
  assumption,
  ...(identityAssumption === undefined ? {} : { identityAssumption }),
  unavailableReason: reason,
  result: { status: 'unavailable', reason },
});

const costIdentity = (input: {
  model: FrozenExecutionModel;
  initialCash: string | undefined;
  currency: string;
  slippageRate: string;
  buySegment: FrozenExecutionModel['segments'][number];
  sellSegment: FrozenExecutionModel['segments'][number];
}) => ({
  version: COST_MODEL_VERSION,
  model: { id: input.model.id, version: input.model.version },
  capital: { currency: input.currency, initialCash: input.initialCash ?? null },
  slippageRate: input.slippageRate,
  buySegment: { id: input.buySegment.id, fees: input.buySegment.fees },
  sellSegment: { id: input.sellSegment.id, fees: input.sellSegment.fees },
});

const unsupported = (
  identity: ReturnType<typeof costIdentity>,
  reason: string,
): BacktestV3BenchmarkCostResolution => {
  const version = `execution-model-v1:${identity.model.id}:${identity.model.version}:${deterministicResultChecksum(identity)}`;
  const assumption: BacktestBenchmarkCostAssumption = {
    kind: 'unsupported',
    version,
    fingerprint: deterministicResultChecksum({ identity, reason }),
  };
  return unavailable('BENCHMARK_COST_MODEL_UNSUPPORTED', assumption, assumption);
};

export const calculateBacktestV3BenchmarkReturn = (input: {
  initialCash: string;
  firstClose: string;
  lastClose: string;
  slippageRate: string;
  currency: 'CNY' | 'HKD' | 'USD';
  buyFees: FrozenExecutionModelFees;
  sellFees: FrozenExecutionModelFees;
}): BenchmarkCostReturn => {
  const initialCash = DecimalValue.from(input.initialCash);
  if (!initialCash.isPositive()) {
    return { status: 'unavailable', reason: 'ZERO_INITIAL_BENCHMARK' };
  }
  const slippage = DecimalValue.from(input.slippageRate);
  const one = DecimalValue.from('1');
  const buyPrice = DecimalValue.from(input.firstClose).times(one.plus(slippage));
  const sellPrice = DecimalValue.from(input.lastClose).times(one.minus(slippage));
  if (!buyPrice.isPositive() || !sellPrice.isPositive()) {
    return { status: 'unavailable', reason: 'INVALID_BENCHMARK_COST_ASSUMPTION' };
  }

  const maximumQuantity = initialCash.dividedBy(buyPrice, 40).toString();
  const fitted = fitNormalizedQuantityToAvailableCash(maximumQuantity, (quantity) => {
    const buyGross = buyPrice.times(quantity);
    try {
      const buyFeeTotal = calculateExecutionModelFees(input.buyFees, {
        side: 'buy',
        turnover: buyGross.toString(),
        currency: input.currency,
      }).total;
      const buyDebit = buyGross.plus(buyFeeTotal);
      if (buyDebit.compareTo(initialCash) > 0) return { status: 'insufficient-cash' as const };
      return {
        status: 'affordable' as const,
        value: {
          buyGross: buyGross.toString(),
          buyFees: buyFeeTotal,
          buyDebit: buyDebit.toString(),
        },
      };
    } catch {
      return { status: 'unavailable' as const, reason: 'INVALID_BENCHMARK_COST_ASSUMPTION' };
    }
  });
  if (fitted.status !== 'available') return { status: 'unavailable', reason: fitted.reason };

  const sellGross = sellPrice.times(fitted.quantity);
  try {
    const sellFeeTotal = calculateExecutionModelFees(input.sellFees, {
      side: 'sell',
      turnover: sellGross.toString(),
      currency: input.currency,
    }).total;
    const sellProceeds = sellGross.minus(sellFeeTotal);
    const residualCash = initialCash.minus(fitted.value.buyDebit);
    const finalCash = residualCash.plus(sellProceeds);
    if (residualCash.isNegative() || finalCash.isNegative()) {
      return { status: 'unavailable', reason: 'INVALID_BENCHMARK_CASH_LEDGER' };
    }
    return {
      status: 'available',
      value: finalCash.dividedBy(initialCash, 20).minus('1').toString(),
      quantity: fitted.quantity,
      initialCash: initialCash.toString(),
      buyGross: fitted.value.buyGross,
      buyFees: fitted.value.buyFees,
      buyDebit: fitted.value.buyDebit,
      residualCash: residualCash.toString(),
      sellGross: sellGross.toString(),
      sellFees: sellFeeTotal,
      finalCash: finalCash.toString(),
    };
  } catch {
    return { status: 'unavailable', reason: 'INVALID_BENCHMARK_COST_ASSUMPTION' };
  }
};

export const resolveBacktestV3BenchmarkCost = (input: {
  runConfig: RunConfigV3;
  strategy: BacktestStrategy;
  firstClose: string;
  firstOccurredAt: string;
  lastClose: string;
  lastOccurredAt: string;
}): BacktestV3BenchmarkCostResolution => {
  const modelInput = input.runConfig.executionModel;
  if (!modelInput) return unavailable('BENCHMARK_COST_ASSUMPTION_UNAVAILABLE');

  const model = modelInput as unknown as FrozenExecutionModel;
  const currency = instrumentCurrency(input.strategy.executionInstrument.market);
  const instrumentType = instrumentRouteType(input.strategy.executionInstrument.assetType);
  const initialCash = input.runConfig.initialCash[currency];
  const hasOtherCurrencyCash = Object.entries(input.runConfig.initialCash).some(
    ([cashCurrency, amount]) =>
      cashCurrency !== currency && amount !== undefined && DecimalValue.from(amount).isPositive(),
  );
  if (hasOtherCurrencyCash) {
    return unavailable('BENCHMARK_MULTICURRENCY_INITIAL_CASH_UNSUPPORTED');
  }
  let buySegment: FrozenExecutionModel['segments'][number];
  let sellSegment: FrozenExecutionModel['segments'][number];
  try {
    const resolve = (evaluatedAt: string) => {
      const coordinates = {
        expectedVersion: model.version,
        symbol: input.strategy.executionInstrument.symbol,
        market: input.strategy.executionInstrument.market,
        instrumentType,
        currency,
        evaluatedAt,
        dataAsOf: input.runConfig.dataAsOf,
      };
      return input.runConfig.executionPriceProtocol.accountingBasis === 'normalized-series'
        ? resolveNormalizedExecutionModelSegment(model, coordinates)
        : resolveExecutionModelSegment(model, coordinates);
    };
    buySegment = resolve(input.firstOccurredAt);
    sellSegment = resolve(input.lastOccurredAt);
  } catch {
    return unavailable('BENCHMARK_COST_ASSUMPTION_UNAVAILABLE');
  }

  const identity = costIdentity({
    model,
    initialCash,
    currency,
    slippageRate: input.strategy.cost.slippageRate,
    buySegment,
    sellSegment,
  });
  if (!buySegment.fees || !sellSegment.fees) {
    return unsupported(identity, 'non-exchange execution fees');
  }
  const slippage = DecimalValue.from(input.strategy.cost.slippageRate);
  const buyFeeRate = chargedFeeRate(buySegment, currency);
  const sellFeeRate = chargedFeeRate(sellSegment, currency);
  if (buyFeeRate.status !== 'supported') return unsupported(identity, buyFeeRate.reason);
  if (sellFeeRate.status !== 'supported') return unsupported(identity, sellFeeRate.reason);
  if (buyFeeRate.rate.compareTo(sellFeeRate.rate) !== 0) {
    return unsupported(identity, 'buy/sell fee rates differ');
  }
  if (
    slippage.isNegative() ||
    slippage.compareTo('1') >= 0 ||
    buyFeeRate.rate.isNegative() ||
    buyFeeRate.rate.compareTo('1') >= 0
  ) {
    return unsupported(identity, 'invalid proportional rate');
  }
  if (initialCash === undefined) {
    return unavailable('BENCHMARK_INITIAL_CASH_UNAVAILABLE');
  }
  if (!DecimalValue.from(initialCash).isPositive()) {
    return unavailable('ZERO_INITIAL_BENCHMARK');
  }

  const version = `execution-model-v2:${model.id}:${model.version}:${deterministicResultChecksum(identity)}`;
  const assumption: BacktestBenchmarkCostAssumption =
    buyFeeRate.rate.isZero() && slippage.isZero()
      ? { kind: 'zero-cost', version: `v3-explicit-zero-cost:${version}` }
      : {
          kind: 'proportional',
          version,
          commissionRate: buyFeeRate.rate.toString(),
          slippageRate: slippage.toString(),
        };
  const result = calculateBacktestV3BenchmarkReturn({
    initialCash,
    firstClose: input.firstClose,
    lastClose: input.lastClose,
    slippageRate: input.strategy.cost.slippageRate,
    currency,
    buyFees: buySegment.fees,
    sellFees: sellSegment.fees,
  });
  if (result.status === 'unavailable') {
    return unavailable(result.reason, assumption, assumption);
  }
  return { assumption, identityAssumption: assumption, result };
};
