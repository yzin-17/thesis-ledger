import { Prisma } from '@prisma/client';
import {
  RESEARCH_OBSERVATION_METHOD,
  researchObservationStatisticsSchema,
  type ResearchObservationEvaluation,
} from '@thesis-ledger/schemas';

export interface ObservationSample {
  observationId: string;
  lineageId: string;
  runId: string;
  claimId: string;
  instrumentId: string | null;
  direction: 'up' | 'down' | null;
  tradingDays: 5 | 20 | null;
  methodVersion: string;
  artifactCreatedAt: string;
  versionId: string;
  visibleAt: string;
  recordedAt: string;
  evaluation: ResearchObservationEvaluation;
}
const compare = (a: ObservationSample, b: ObservationSample) =>
  Date.parse(a.visibleAt) - Date.parse(b.visibleAt) ||
  Date.parse(a.recordedAt) - Date.parse(b.recordedAt) ||
  a.versionId.localeCompare(b.versionId);

/** 先选逻辑观察版本，再按重试谱系、标的及窗口去重；重试报告不能扩大分母。 */
export function selectObservationSamples(rows: readonly ObservationSample[], asOf: string) {
  const logical = new Map<string, ObservationSample>();
  for (const row of rows) {
    if (
      row.methodVersion !== RESEARCH_OBSERVATION_METHOD ||
      Date.parse(row.visibleAt) > Date.parse(asOf)
    )
      continue;
    const old = logical.get(row.observationId);
    if (!old || compare(row, old) > 0) logical.set(row.observationId, row);
  }
  const lineage = new Map<string, ObservationSample[]>();
  for (const row of logical.values()) {
    const key = JSON.stringify([
      row.lineageId,
      row.methodVersion,
      row.instrumentId ?? row.claimId,
      row.tradingDays,
    ]);
    const old = lineage.get(key);
    if (!old) {
      lineage.set(key, [row]);
      continue;
    }
    const prior = old[0]!;
    const reportOrder =
      Date.parse(row.artifactCreatedAt) - Date.parse(prior.artifactCreatedAt) ||
      row.runId.localeCompare(prior.runId);
    if (reportOrder > 0) lineage.set(key, [row]);
    else if (reportOrder === 0) old.push(row);
  }
  return [...lineage.values()].map((group) => {
    const selected = [...group].sort((a, b) => compare(b, a))[0]!;
    if (
      new Set(group.map((row) => row.direction).filter((direction) => direction !== null)).size < 2
    )
      return selected;
    const evaluation = structuredClone(selected.evaluation);
    evaluation.status = 'insufficient_data';
    evaluation.reasons = ['ambiguous_claims'];
    evaluation.economic.returnRate = null;
    evaluation.economic.directionMatched = null;
    return { ...selected, evaluation };
  });
}
export function observationStatistics(
  rows: readonly ObservationSample[],
  asOf: string,
  truncated = false,
) {
  const samples = selectObservationSamples(rows, asOf);
  let dueSamples = 0,
    dueUnknownSamples = 0,
    calculatedSamples = 0,
    notDueSamples = 0,
    notApplicableSamples = 0,
    matchedSamples = 0;
  const exclusions = new Map<ResearchObservationEvaluation['reasons'][number], number>();
  for (const sample of samples) {
    const result = sample.evaluation;
    if (result.status === 'not_applicable') notApplicableSamples++;
    else if (result.window.endCloseAt === null) dueUnknownSamples++;
    else if (Date.parse(result.window.endCloseAt) <= Date.parse(asOf)) dueSamples++;
    else notDueSamples++;
    if (
      result.status === 'completed' &&
      result.window.endCloseAt !== null &&
      Date.parse(result.window.endCloseAt) <= Date.parse(asOf)
    ) {
      calculatedSamples++;
      if (result.economic.directionMatched) matchedSamples++;
    }
    for (const reason of new Set(result.reasons))
      exclusions.set(reason, (exclusions.get(reason) ?? 0) + 1);
  }
  let sampleStatus: 'insufficient' | 'incomplete' | 'descriptive_only' = 'insufficient';
  let directionMatchRate: string | null = null;
  if (truncated) sampleStatus = 'incomplete';
  else if (calculatedSamples >= 20) {
    sampleStatus = 'descriptive_only';
    directionMatchRate = new Prisma.Decimal(matchedSamples).div(calculatedSamples).toFixed();
  }
  return researchObservationStatisticsSchema.parse({
    methodVersion: RESEARCH_OBSERVATION_METHOD,
    coverage: truncated ? 'truncated' : 'complete',
    samples: samples.length,
    dueSamples,
    dueUnknownSamples,
    calculatedSamples,
    notDueSamples,
    notApplicableSamples,
    matchedSamples,
    exclusions: [...exclusions]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => a.reason.localeCompare(b.reason)),
    sampleStatus,
    directionMatchRate,
    returnBasis: 'economic-close',
  });
}
