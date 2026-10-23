import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  RESEARCH_OBSERVATION_METHOD,
  researchObservationSubmissionSchema,
  researchReportLocatorSchema,
  researchReportIdSchema,
  researchObservationSubmissionResultSchema,
} from '@thesis-ledger/schemas';
import { ResearchObservationStore } from './research-observation.store.js';
import { ResearchObservationAccess } from './research-observation-access.js';
import { ResearchObservationMaterials } from './research-observation-materials.js';
import { researchObservationDigest } from './research-observation-identity.js';
import {
  selectObservationWindow,
  evaluateObservationPrices,
  observationEvidenceVisibleAt,
} from './research-observation-method.js';

@Injectable()
export class ResearchObservationService {
  constructor(
    @Inject(ResearchObservationAccess) private readonly access: ResearchObservationAccess,
    @Inject(ResearchObservationStore) private readonly store: ResearchObservationStore,
    @Inject(ResearchObservationMaterials) private readonly materials: ResearchObservationMaterials,
  ) {}
  async submit(ownerId: string, rawId: unknown, rawLocator: unknown, raw: unknown) {
    const id = researchReportIdSchema.parse(rawId),
      locator = researchReportLocatorSchema.parse(rawLocator);
    const input = researchObservationSubmissionSchema.parse(raw);
    const report = await this.access.report(ownerId, id, locator);
    if (
      report.availability !== 'available' ||
      report.result?.version !== 2 ||
      report.historicalScope.status !== 'known'
    )
      throw new BadRequestException('这份报告缺少可自动复核的可信 V2 字段');
    const result = report.result,
      snapshot = report.historicalScope.snapshot;
    if (
      !observationEvidenceVisibleAt(input.asOf, new Date().toISOString()) ||
      !observationEvidenceVisibleAt(result.createdAt, input.asOf)
    )
      throw new BadRequestException('复核截止时点必须介于报告生成与当前时间之间');
    const claim = result.inference.claims.find((entry) => entry.id === input.claimId);
    if (!claim) throw new NotFoundException('研究断言不存在或不可访问');
    let instrument;
    let windowTradingDays: 5 | 20 | null = null;
    if (claim.kind === 'price-direction') {
      instrument = this.materials.instrument(snapshot, claim.instrumentId);
      windowTradingDays = claim.tradingDays;
      if (!instrument) throw new BadRequestException('研究断言超出原冻结标的范围');
    }
    const started = await this.store.begin({
      ownerId,
      runId: id,
      submissionId: input.submissionId,
      lineageId: await this.access.lineage(ownerId, report, locator),
      artifactFingerprint: researchObservationDigest(result),
      claimId: claim.id,
      windowTradingDays,
      methodVersion: RESEARCH_OBSERVATION_METHOD,
      visibleAt: input.asOf,
    });
    const response = (attempt: typeof started.attempt) =>
      researchObservationSubmissionResultSchema.parse({
        reportId: id,
        historicalScope: report.historicalScope,
        claimId: claim.id,
        attempt,
      });
    if (!started.acquired) return response(started.attempt);
    try {
      let calendar: Awaited<ReturnType<ResearchObservationMaterials['calendar']>> = {
        material: { status: 'unavailable', reason: 'unsupported_claim' },
        audit: { status: 'not_requested', reason: 'unsupported_claim' },
      };
      if (instrument)
        calendar = await this.materials.calendar(instrument, result.createdAt, input.asOf);
      const window = selectObservationWindow({
        claim,
        createdAt: result.createdAt,
        asOf: input.asOf,
        market: instrument?.market ?? 'CN',
        calendar: calendar.material,
      });
      let prices: Awaited<ReturnType<ResearchObservationMaterials['prices']>> = {
        material: { status: 'unavailable', reason: 'price_unavailable' },
        audit: { status: 'not_requested' },
      };
      if (
        instrument &&
        window.status === 'insufficient_data' &&
        window.reasons[0] === 'price_unavailable'
      )
        prices = await this.materials.prices(
          instrument,
          window.window,
          calendar.material,
          input.asOf,
        );
      const evaluation = evaluateObservationPrices(window, claim, input.asOf, prices.material);
      const checked = await this.access.report(ownerId, id, locator);
      if (researchObservationDigest(checked.result) !== researchObservationDigest(result))
        throw new BadRequestException('复核读取期间原产物摘要发生变化');
      const inputs: unknown = JSON.parse(
        JSON.stringify({ visibleAt: input.asOf, calendar: calendar.audit, prices: prices.audit }),
      );
      return response(await this.store.finish(ownerId, input.submissionId, inputs, evaluation));
    } catch (error) {
      const failed = await this.store.fail(ownerId, input.submissionId);
      if (error instanceof HttpException) throw error;
      return response(failed);
    }
  }
}
