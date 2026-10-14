import { DecimalValue } from './decimal.js';
import type {
  JournalAnalysisCandidate,
  JournalBehaviorEvidence,
  JournalDecimalMetric,
} from './journal-analysis-contract.js';
import {
  journalAnalysisScope,
  journalCounterfactual,
  journalMetric,
  journalMetricDifference,
  journalPlannedActualMetrics,
} from './journal-analysis-metrics.js';

export const JOURNAL_ANALYSIS_VERSION = 'journal-decimal-1';

function deviation(
  code: JournalBehaviorEvidence['code'],
  key: string,
  metric: JournalDecimalMetric,
): JournalBehaviorEvidence {
  if (metric.value === null)
    return {
      code,
      status: 'INSUFFICIENT_EVIDENCE',
      metricKeys: [key],
      missingEvidence: metric.missingEvidence,
    };
  let detected = !DecimalValue.from(metric.value).isZero();
  if (code === 'STOP_EXIT_DEVIATION') detected = DecimalValue.from(metric.value).isNegative();
  return {
    code,
    status: detected ? 'DEVIATION' : 'NO_DEVIATION',
    metricKeys: [key],
    missingEvidence: [],
  };
}

function journalEffectivePlan(candidate: JournalAnalysisCandidate) {
  const original = candidate.input;
  const draft = original.analysisDraft;
  const input = {
    ...original,
    plan: {
      symbol: original.trade.symbol,
      plannedEntry:
        draft?.plannedEntry !== undefined
          ? draft.plannedEntry
          : (original.plan?.plannedEntry ?? null),
      plannedExit:
        draft?.plannedExit !== undefined ? draft.plannedExit : (original.plan?.plannedExit ?? null),
      stopLoss: draft?.stopLoss !== undefined ? draft.stopLoss : (original.plan?.stopLoss ?? null),
      expectedHoldingDays:
        draft?.expectedHoldingDays !== undefined
          ? draft.expectedHoldingDays
          : (original.plan?.expectedHoldingDays ?? null),
    },
  };
  if (original.plan !== null && original.plan.symbol !== input.trade.symbol)
    throw new Error('计划与交易标的不一致');
  return input;
}

export function journalAnalyze(candidate: JournalAnalysisCandidate) {
  const input = journalEffectivePlan(candidate);
  const scope = journalAnalysisScope(input);
  const isCycle = input.reference.reviewObjectType === 'TRADE_CYCLE';
  const source = isCycle ? input.trade : scope.slices[0]!;
  const currencyReasons = candidate.statisticsEligibility.reasons.filter((row) =>
    ['FX_MISSING', 'COST_CONFLICT'].includes(row),
  );
  if (scope.currency === null && scope.slices.length > 0 && !currencyReasons.includes('FX_MISSING'))
    currencyReasons.push('FX_MISSING');
  let netRealizedPnl = journalMetric(source.netRealizedPnl, 'AMOUNT', scope.currency, [
    'REALIZED_PNL_MISSING',
  ]);
  let realizedNetReturnRate = journalMetric(source.realizedNetReturnRate, 'RATIO', null, [
    'RETURN_RATE_MISSING',
  ]);
  if (scope.slices.length === 0) {
    netRealizedPnl = {
      status: 'NOT_APPLICABLE',
      value: null,
      unit: 'AMOUNT',
      currency: null,
      missingEvidence: [],
    };
    realizedNetReturnRate = {
      status: 'NOT_APPLICABLE',
      value: null,
      unit: 'RATIO',
      currency: null,
      missingEvidence: [],
    };
  } else if (currencyReasons.length > 0) {
    netRealizedPnl = journalMetric(null, 'AMOUNT', scope.currency, currencyReasons);
    realizedNetReturnRate = journalMetric(null, 'RATIO', null, currencyReasons);
  }
  const planned = journalPlannedActualMetrics(input, scope);
  const counterfactualNetPnl = journalCounterfactual(
    input,
    scope.slices,
    netRealizedPnl,
    scope.currency,
    scope.corporate,
  );
  const quantity = scope.slices.reduce(
    (sum, row) => sum.plus(row.quantity),
    DecimalValue.from('0'),
  );
  let executedQuantity: JournalDecimalMetric = {
    status: 'AVAILABLE',
    value: quantity.toString(),
    unit: 'QUANTITY',
    currency: null,
    missingEvidence: [],
  };
  if (isCycle && scope.corporate)
    executedQuantity = journalMetric(null, 'QUANTITY', null, ['CORPORATE_ACTION_QUANTITY_BASIS']);
  const metrics = {
    ...planned,
    netRealizedPnl,
    realizedNetReturnRate,
    executedQuantity,
    counterfactualNetPnl,
    counterfactualDifference: journalMetricDifference(counterfactualNetPnl, netRealizedPnl),
  };
  return {
    reviewObjectId: input.reference.reviewObjectId,
    algorithmVersion: JOURNAL_ANALYSIS_VERSION,
    statisticsEligibility: candidate.statisticsEligibility,
    metrics: Object.fromEntries(
      Object.entries(metrics).map(([key, metric]) => {
        if (metric.value === null || metric.unit === 'QUANTITY') return [key, metric];
        return [
          key,
          { ...metric, value: DecimalValue.from(metric.value).dividedBy('1', 8).toString() },
        ];
      }),
    ),
    behaviors: [
      deviation('ENTRY_PRICE_DEVIATION', 'entryPriceDeviation', planned.entryPriceDeviation),
      deviation('EXIT_PRICE_DEVIATION', 'exitPriceDeviation', planned.exitPriceDeviation),
      deviation('HOLDING_PERIOD_DEVIATION', 'holdingDayDeviation', planned.holdingDayDeviation),
      deviation('STOP_EXIT_DEVIATION', 'stopExitDeviation', planned.stopExitDeviation),
    ],
    behaviorNotes: ['已实现收益采用交易投影，不计分红与未实现损益；完整周期和减仓片段分别统计。'],
    assumptions: [
      '止损反事实仅替换已发生 SELL 的退出价，使用实际数量并保留原成本与费用；假设同价成交，未计滑点和流动性，也不推断触发时间。',
    ],
    rounding: { mode: 'HALF_UP' as const, amountFractionDigits: 8, ratioFractionDigits: 8 },
  };
}
