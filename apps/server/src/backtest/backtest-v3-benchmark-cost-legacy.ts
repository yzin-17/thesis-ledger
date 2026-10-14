import {
  DecimalValue,
  deterministicResultChecksum,
  type BacktestBenchmarkCostAssumption,
  type FrozenExecutionModel,
} from '@thesis-ledger/domain';

export interface BenchmarkCostAssumptionResolution {
  assumption: BacktestBenchmarkCostAssumption | { kind: 'unavailable' };
  identityAssumption?: BacktestBenchmarkCostAssumption;
  unavailableReason?: string;
}

const COST_MODEL_VERSION =
  'v3-normalized-buy-first-close-liquidate-last-close-per-charge-half-up-2-v1';

const chargedFeeRate = (
  segment: FrozenExecutionModel['segments'][number],
  currency: string,
): { status: 'supported'; rate: DecimalValue } | { status: 'unsupported'; reason: string } => {
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

/** 缺少冻结基准成本版本的历史快照继续使用原比例摘要及身份。 */
export const resolveLegacyBenchmarkCostAssumptionV3 = (input: {
  model: FrozenExecutionModel;
  initialCash: string | undefined;
  currency: string;
  slippageRate: string;
  buySegment: FrozenExecutionModel['segments'][number];
  sellSegment: FrozenExecutionModel['segments'][number];
}): BenchmarkCostAssumptionResolution => {
  const identity = {
    version: COST_MODEL_VERSION,
    model: { id: input.model.id, version: input.model.version },
    capital: { currency: input.currency, initialCash: input.initialCash ?? null },
    slippageRate: input.slippageRate,
    buySegment: { id: input.buySegment.id, fees: input.buySegment.fees },
    sellSegment: { id: input.sellSegment.id, fees: input.sellSegment.fees },
  };
  const unsupported = (reason: string): BenchmarkCostAssumptionResolution => {
    const version = `execution-model-v1:${identity.model.id}:${identity.model.version}:${deterministicResultChecksum(identity)}`;
    const assumption: BacktestBenchmarkCostAssumption = {
      kind: 'unsupported',
      version,
      fingerprint: deterministicResultChecksum({ identity, reason }),
    };
    return {
      assumption,
      identityAssumption: assumption,
      unavailableReason: 'BENCHMARK_COST_MODEL_UNSUPPORTED',
    };
  };
  if (!input.buySegment.fees || !input.sellSegment.fees) {
    return unsupported('non-exchange execution fees');
  }
  const slippage = DecimalValue.from(input.slippageRate);
  const buyFeeRate = chargedFeeRate(input.buySegment, input.currency);
  const sellFeeRate = chargedFeeRate(input.sellSegment, input.currency);
  if (buyFeeRate.status !== 'supported') return unsupported(buyFeeRate.reason);
  if (sellFeeRate.status !== 'supported') return unsupported(sellFeeRate.reason);
  if (buyFeeRate.rate.compareTo(sellFeeRate.rate) !== 0) {
    return unsupported('buy/sell fee rates differ');
  }
  if (
    slippage.isNegative() ||
    slippage.compareTo('1') >= 0 ||
    buyFeeRate.rate.isNegative() ||
    buyFeeRate.rate.compareTo('1') >= 0
  ) {
    return unsupported('invalid proportional rate');
  }
  if (input.initialCash === undefined) {
    return {
      assumption: { kind: 'unavailable' },
      unavailableReason: 'BENCHMARK_INITIAL_CASH_UNAVAILABLE',
    };
  }
  if (!DecimalValue.from(input.initialCash).isPositive()) {
    return { assumption: { kind: 'unavailable' }, unavailableReason: 'ZERO_INITIAL_BENCHMARK' };
  }
  const version = `execution-model-v2:${input.model.id}:${input.model.version}:${deterministicResultChecksum(identity)}`;
  const assumption: BacktestBenchmarkCostAssumption =
    buyFeeRate.rate.isZero() && slippage.isZero()
      ? { kind: 'zero-cost', version: `v3-explicit-zero-cost:${version}` }
      : {
          kind: 'proportional',
          version,
          commissionRate: buyFeeRate.rate.toString(),
          slippageRate: slippage.toString(),
        };
  return { assumption, identityAssumption: assumption };
};
