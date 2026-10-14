import { DecimalValue } from './decimal.js';
import {
  journalReviewFallsInWindow,
  journalReviewObjectTimes,
  journalReviewWindow,
} from './journal-review.js';
import type {
  JournalAnalysisCandidate,
  JournalDecimalMetric,
  JournalMetricUnit,
} from './journal-analysis-contract.js';
import { journalAnalysisScope, journalMetric } from './journal-analysis-metrics.js';
import { JOURNAL_ANALYSIS_VERSION } from './journal-analysis.js';

const unavailable = (unit: JournalMetricUnit): JournalDecimalMetric => ({
  status: 'NOT_APPLICABLE',
  value: null,
  unit,
  currency: null,
  missingEvidence: [],
});
const rounded = (metric: JournalDecimalMetric) => {
  if (metric.value === null) return metric;
  return { ...metric, value: DecimalValue.from(metric.value).dividedBy('1', 8).toString() };
};

function samplePnl(candidate: JournalAnalysisCandidate) {
  const { input } = candidate;
  if (input.reference.reviewObjectType === 'TRADE_CYCLE') return input.trade.netRealizedPnl;
  const sliceId = input.reference.closeSliceId;
  return input.trade.closeSlices.find((row) => row.id === sliceId)!.netRealizedPnl;
}
function holdingDays(candidate: JournalAnalysisCandidate) {
  const input = candidate.input;
  const times = journalReviewObjectTimes(input.trade, input.reference);
  const end =
    input.reference.reviewObjectType === 'TRADE_CYCLE' ? times.effectiveClosedAt : times.executedAt;
  if (times.openedAt === null || end === null) return null;
  const startValue = journalReviewWindow({ start: times.openedAt }).startEpochSeconds!;
  const endValue = journalReviewWindow({ start: end }).startEpochSeconds!;
  const duration = DecimalValue.from(endValue).minus(startValue);
  if (duration.isNegative()) return null;
  return duration.dividedBy('86400');
}

function periodMetrics(candidates: readonly JournalAnalysisCandidate[]) {
  const count = journalMetric(String(candidates.length), 'COUNT');
  if (candidates.length === 0)
    return {
      sampleCount: count,
      netRealizedPnl: unavailable('AMOUNT'),
      winRate: unavailable('RATIO'),
      profitLossRatio: unavailable('RATIO'),
      averageHoldingDays: unavailable('DAYS'),
    };
  const pnls = candidates.map(samplePnl);
  const currencyList = candidates.map((row) => journalAnalysisScope(row.input).currency);
  const currencies = new Set(currencyList);
  let currency: string | null = null;
  if (currencies.size === 1) currency = currencyList[0]!;
  const complete = pnls.every((value) => value !== null);
  let winRate = journalMetric(null, 'RATIO', null, ['REALIZED_PNL_MISSING']);
  let netRealizedPnl = journalMetric(null, 'AMOUNT', currency, ['REALIZED_PNL_MISSING']);
  let profitLossRatio = journalMetric(null, 'RATIO', null, ['REALIZED_PNL_MISSING']);
  if (complete) {
    const values = pnls.map((value) => DecimalValue.from(value));
    const wins = values.filter((value) => value.isPositive());
    const losses = values.filter((value) => value.isNegative());
    winRate = journalMetric(
      DecimalValue.from(String(wins.length)).dividedBy(String(values.length)),
      'RATIO',
    );
    if (currency === null) {
      netRealizedPnl = journalMetric(null, 'AMOUNT', null, ['FX_MISSING']);
      profitLossRatio = journalMetric(null, 'RATIO', null, ['FX_MISSING']);
    } else {
      netRealizedPnl = journalMetric(
        values.reduce((total, value) => total.plus(value), DecimalValue.from('0')),
        'AMOUNT',
        currency,
      );
      if (losses.length === 0)
        profitLossRatio = journalMetric(null, 'RATIO', null, ['LOSS_SAMPLE_MISSING']);
      else {
        const grossWin = wins.reduce((total, value) => total.plus(value), DecimalValue.from('0'));
        const grossLoss = losses.reduce(
          (total, value) => total.minus(value),
          DecimalValue.from('0'),
        );
        profitLossRatio = journalMetric(grossWin.dividedBy(grossLoss), 'RATIO');
      }
    }
  }
  const durations = candidates.map(holdingDays);
  let averageHoldingDays = journalMetric(null, 'DAYS', null, ['UNKNOWN_HOLDING_TIME']);
  if (durations.every((value) => value !== null))
    averageHoldingDays = journalMetric(
      durations
        .reduce<DecimalValue>((total, value) => total.plus(value), DecimalValue.from('0'))
        .dividedBy(String(durations.length)),
      'DAYS',
    );
  return {
    sampleCount: count,
    netRealizedPnl: rounded(netRealizedPnl),
    winRate: rounded(winRate),
    profitLossRatio: rounded(profitLossRatio),
    averageHoldingDays: rounded(averageHoldingDays),
  };
}

function periodGroup(candidates: readonly JournalAnalysisCandidate[]) {
  const eligible = candidates.filter((row) => row.statisticsEligibility.eligible);
  return {
    observedSampleCount: candidates.length,
    includedObjectIds: eligible.map((row) => row.input.reference.reviewObjectId),
    excluded: candidates
      .filter((row) => !row.statisticsEligibility.eligible)
      .map((row) => ({
        reviewObjectId: row.input.reference.reviewObjectId,
        reasons: row.statisticsEligibility.reasons,
      })),
    metrics: periodMetrics(eligible),
  };
}

export function journalAnalyzePeriod(
  candidates: readonly JournalAnalysisCandidate[],
  windowInput: { start: string; end: string },
) {
  const objectIds = candidates.map((row) => row.input.reference.reviewObjectId);
  if (new Set(objectIds).size !== objectIds.length) throw new Error('周期输入包含重复复盘对象');
  const window = journalReviewWindow(windowInput);
  const unknownTime: { reviewObjectId: string; reasons: string[] }[] = [];
  const selected = candidates.filter((candidate) => {
    const input = candidate.input;
    const times = journalReviewObjectTimes(input.trade, input.reference);
    const timestamp =
      input.reference.reviewObjectType === 'TRADE_CYCLE'
        ? times.effectiveClosedAt
        : times.executedAt;
    if (timestamp === null)
      unknownTime.push({
        reviewObjectId: input.reference.reviewObjectId,
        reasons: ['STATISTICS_TIME_UNKNOWN', ...candidate.statisticsEligibility.reasons],
      });
    return journalReviewFallsInWindow(timestamp, window);
  });
  return {
    algorithmVersion: JOURNAL_ANALYSIS_VERSION,
    window,
    tradeCycles: periodGroup(
      selected.filter((row) => row.input.reference.reviewObjectType === 'TRADE_CYCLE'),
    ),
    closeSlices: periodGroup(
      selected.filter((row) => row.input.reference.reviewObjectType === 'CLOSE_SLICE'),
    ),
    unknownTime,
    assumptions: ['完整周期与减仓片段分别计数；跨币种金额及盈亏比需要转换证据，不使用默认汇率。'],
    rounding: { mode: 'HALF_UP' as const, amountFractionDigits: 8, ratioFractionDigits: 8 },
  };
}
