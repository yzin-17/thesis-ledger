import { BadRequestException, HttpException, Inject, Injectable } from '@nestjs/common';
import {
  researchComparisonIdentity,
  researchObservationReadQuerySchema,
  researchReportLocatorSchema,
  researchReportIdSchema,
  researchReportObservationsSchema,
  researchObservationEvaluationSchema,
  researchObservationHistorySchema,
  type ResearchReportDetail,
  type ResearchReportLocator,
} from '@thesis-ledger/schemas';
import { ResearchObservationStore } from './research-observation.store.js';
import { ResearchObservationAccess } from './research-observation-access.js';
import { researchObservationDigest } from './research-observation-identity.js';
import {
  observationStatistics,
  type ObservationSample,
} from './research-observation-statistics.js';

@Injectable()
export class ResearchObservationQueries {
  constructor(
    @Inject(ResearchObservationAccess) private readonly access: ResearchObservationAccess,
    @Inject(ResearchObservationStore) private readonly store: ResearchObservationStore,
  ) {}
  async read(ownerId: string, rawId: unknown, raw: unknown) {
    const id = researchReportIdSchema.parse(rawId);
    const { asOf: requested, ...locator } = researchObservationReadQuerySchema.parse(raw);
    const asOf = new Date(requested ?? Date.now());
    if (asOf.getTime() > Date.now())
      throw new BadRequestException('复核读取截止时点不能晚于当前时间');
    const report = await this.access.report(ownerId, id, locator);
    const available =
      report.availability === 'available' &&
      report.result?.version === 2 &&
      report.historicalScope.status === 'known';
    if (!available)
      return researchReportObservationsSchema.parse({
        version: 'research-observations-v1',
        historicalScope: report.historicalScope,
        reportId: id,
        asOf: asOf.toISOString(),
        availability: report.resultVersion === 1 ? 'not_applicable' : 'unavailable',
        issues: ['这份报告缺少可自动复核的可信 V2 字段，保留原报告供人工查看。'],
        items: [],
        statistics: observationStatistics([], asOf.toISOString()),
      });
    const result = report.result;
    if (result?.version !== 2) throw new BadRequestException('研究产物版本不可复核');
    const observations = await this.store.readRun(ownerId, id, asOf);
    const expected = researchObservationDigest(result);
    if (observations.some((entry) => entry.artifactFingerprint !== expected))
      throw new BadRequestException('观察绑定的原产物摘要不一致');
    const cohort = await this.cohort(ownerId, report, locator, asOf);
    return researchReportObservationsSchema.parse({
      version: 'research-observations-v1',
      historicalScope: report.historicalScope,
      reportId: id,
      asOf: asOf.toISOString(),
      availability: 'available',
      issues: [],
      items: result.inference.claims.map((claim) => {
        const saved = observations.find((entry) => entry.claimId === claim.id);
        let instrumentId: string | null = null,
          direction: 'up' | 'down' | null = null,
          tradingDays: 5 | 20 | null = null;
        if (claim.kind === 'price-direction') {
          instrumentId = claim.instrumentId;
          direction = claim.direction;
          tradingDays = claim.tradingDays;
        }
        return {
          id: saved?.id ?? null,
          claimId: claim.id,
          instrumentId,
          direction,
          tradingDays,
          current: saved?.current ?? null,
        };
      }),
      statistics: observationStatistics(cohort.samples, asOf.toISOString(), cohort.truncated),
    });
  }
  async history(ownerId: string, rawId: unknown, rawObservation: unknown, raw: unknown) {
    const id = researchReportIdSchema.parse(rawId),
      observationId = researchReportIdSchema.parse(rawObservation);
    const locator = researchReportLocatorSchema.parse(raw);
    const report = await this.access.report(ownerId, id, locator);
    return researchObservationHistorySchema.parse({
      reportId: id,
      observationId,
      historicalScope: report.historicalScope,
      ...(await this.store.history(ownerId, id, observationId)),
    });
  }
  private async cohort(
    ownerId: string,
    current: ResearchReportDetail,
    locator: ResearchReportLocator,
    asOf: Date,
  ) {
    const candidates = await this.store.sampleRunIds(ownerId, asOf);
    const expected = researchObservationDigest(researchComparisonIdentity(current));
    const reports = new Map<string, { report: ResearchReportDetail; lineageId: string }>();
    let truncated = candidates.truncated;
    for (const id of candidates.runIds) {
      try {
        const report = await this.access.report(ownerId, id, locator);
        if (
          report.availability !== 'available' ||
          report.result?.version !== 2 ||
          researchObservationDigest(researchComparisonIdentity(report)) !== expected
        )
          continue;
        const lineageId = await this.access.lineage(ownerId, report, locator);
        reports.set(id, { report, lineageId });
      } catch (error) {
        if (error instanceof HttpException && [403, 404].includes(error.getStatus())) continue;
        throw error;
      }
    }
    const selected = await this.store.sampleProjections(ownerId, [...reports.keys()], asOf);
    truncated ||= selected.truncated;
    const samples: ObservationSample[] = [];
    for (const row of selected.rows) {
      const source = reports.get(row.runId)!;
      const result = source.report.result;
      if (
        result?.version !== 2 ||
        row.artifactFingerprint !== researchObservationDigest(result) ||
        row.lineageId !== source.lineageId
      )
        throw new BadRequestException('观察绑定的原产物或研究谱系不一致');
      const claim = result.inference.claims.find((entry) => entry.id === row.claimId);
      if (!claim) throw new BadRequestException('观察引用了原产物之外的断言');
      let instrumentId: string | null = null,
        direction: 'up' | 'down' | null = null,
        tradingDays: 5 | 20 | null = null;
      if (claim.kind === 'price-direction') {
        instrumentId = claim.instrumentId;
        direction = claim.direction;
        tradingDays = claim.tradingDays;
      }
      samples.push({
        ...row,
        instrumentId,
        direction,
        tradingDays,
        artifactCreatedAt: result.createdAt,
        visibleAt: row.visibleAt.toISOString(),
        recordedAt: row.recordedAt.toISOString(),
        evaluation: researchObservationEvaluationSchema.parse(row.evaluation),
      });
    }
    return { samples, truncated };
  }
}
