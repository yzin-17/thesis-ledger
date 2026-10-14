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
import {
  benchmarkExecutionModelCostVersionV3,
  wholeShareWindowBenchmarkCostVersionV3,
  researchLotShareWindowBenchmarkCostVersionV3,
  publicFeesArtifactKeyV3,
  type BacktestSnapshotManifestV3,
} from '@thesis-ledger/schemas';
import type { ArtifactRow } from './backtest-artifact-store.js';
import { readSnapshotPublicFeesV3 } from './backtest-public-fees-snapshot-v3.js';
import { resolveLegacyBenchmarkCostAssumptionV3 } from './backtest-v3-benchmark-cost-legacy.js';
import { calculateWholeShareBenchmarkReturnV3 } from './backtest-whole-share-benchmark-cost-v3.js';

type BenchmarkCostReport = BacktestBenchmarkCostAssumption | { kind: 'unavailable' };

/** 基准身份仍校验原 RunConfig；收费计算消费同一份独立冻结规则。 */
export const resolveFrozenBenchmarkCostV3 = (
  input: Parameters<typeof resolveBacktestV3BenchmarkCost>[0] & {
    manifest: BacktestSnapshotManifestV3;
    rows: ReadonlyMap<string, readonly ArtifactRow[]>;
  },
) => {
  const fees = readSnapshotPublicFeesV3(
    input.manifest,
    input.runConfig,
    input.rows.get(`${input.manifest.runId}/${publicFeesArtifactKeyV3}`) ?? [],
  );
  return resolveBacktestV3BenchmarkCost({
    ...input,
    runConfig: fees?.runConfig ?? input.runConfig,
    costVersion: input.manifest.benchmarkCostVersion,
  });
};

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
  costVersion?: BacktestSnapshotManifestV3['benchmarkCostVersion'];
}): BacktestV3BenchmarkCostResolution => {
  if (
    input.costVersion !== undefined &&
    input.costVersion !== benchmarkExecutionModelCostVersionV3 && input.costVersion !== wholeShareWindowBenchmarkCostVersionV3 &&
    input.costVersion !== researchLotShareWindowBenchmarkCostVersionV3
  ) {
    return unavailable('BENCHMARK_COST_VERSION_UNSUPPORTED');
  }
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

  let assumption: BenchmarkCostReport;
  let identityAssumption: BacktestBenchmarkCostAssumption | undefined;
  if (input.costVersion === benchmarkExecutionModelCostVersionV3 || input.costVersion === wholeShareWindowBenchmarkCostVersionV3 ||
    input.costVersion === researchLotShareWindowBenchmarkCostVersionV3) {
    assumption = {
      kind: 'execution-model',
      version: input.costVersion,
      fingerprint: deterministicResultChecksum({
        scope: model.scope,
        accountingBasis: input.runConfig.executionPriceProtocol.accountingBasis,
        slippageRate: input.strategy.cost.slippageRate,
        ...(input.costVersion === researchLotShareWindowBenchmarkCostVersionV3 ? { researchLotSize: modelInput.researchLotSize } : {}),
        segments: model.segments.map((segment) => ({
          range: segment.range,
          mode: segment.execution.mode,
          fees: segment.fees,
        })),
      }),
    };
    identityAssumption = assumption;
    const slippage = DecimalValue.from(input.strategy.cost.slippageRate);
    if (slippage.isNegative() || slippage.compareTo('1') >= 0) {
      return unavailable('INVALID_BENCHMARK_COST_ASSUMPTION', assumption, assumption);
    }
  } else {
    const legacy = resolveLegacyBenchmarkCostAssumptionV3({
      model,
      initialCash,
      currency,
      slippageRate: input.strategy.cost.slippageRate,
      buySegment,
      sellSegment,
    });
    if (legacy.unavailableReason) {
      return unavailable(legacy.unavailableReason, legacy.assumption, legacy.identityAssumption);
    }
    assumption = legacy.assumption;
    identityAssumption = legacy.identityAssumption;
  }
  if (!buySegment.fees || !sellSegment.fees) {
    return unavailable('BENCHMARK_COST_ASSUMPTION_UNAVAILABLE', assumption, identityAssumption);
  }
  if (initialCash === undefined) {
    return unavailable('BENCHMARK_INITIAL_CASH_UNAVAILABLE', assumption, identityAssumption);
  }
  if (!DecimalValue.from(initialCash).isPositive()) {
    return unavailable('ZERO_INITIAL_BENCHMARK', assumption, identityAssumption);
  }

  let calculate = calculateBacktestV3BenchmarkReturn;
  if (input.costVersion === wholeShareWindowBenchmarkCostVersionV3) calculate = calculateWholeShareBenchmarkReturnV3;
  if (input.costVersion === researchLotShareWindowBenchmarkCostVersionV3) {
    const lot = modelInput.researchLotSize;
    if (!lot || currency !== 'HKD') return unavailable('BENCHMARK_LOT_RESEARCH_PRESET_UNAVAILABLE', assumption, identityAssumption);
    calculate = values => calculateWholeShareBenchmarkReturnV3(values,
      { sharesPerLot: lot.sharesPerLot, currency: 'HKD', priceScale: '1000' });
  }
  const result = calculate({
    initialCash,
    firstClose: input.firstClose,
    lastClose: input.lastClose,
    slippageRate: input.strategy.cost.slippageRate,
    currency,
    buyFees: buySegment.fees,
    sellFees: sellSegment.fees,
  });
  if (result.status === 'unavailable') {
    return unavailable(result.reason, assumption, identityAssumption);
  }
  return {
    assumption,
    ...(identityAssumption === undefined ? {} : { identityAssumption }),
    result,
  };
};
