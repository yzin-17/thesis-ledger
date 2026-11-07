import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  RESEARCH_OBSERVATION_METHOD,
  researchResultV2Schema,
  researchScopeInstrumentsV2,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { MarketBarReader } from '../market/market-bar-reader.js';
import { ResearchObservationService } from './research-observation.service.js';
import { ResearchObservationStore } from './research-observation.store.js';
import { researchObservationDigest } from './research-observation-identity.js';

const PAGE = 12;
const SLOT = 300_000;
const DAY = 86_400_000;
function submissionId(runId: string, claimId: string, asOf: string) {
  const h = researchObservationDigest([
    'scheduled',
    RESEARCH_OBSERVATION_METHOD,
    runId,
    claimId,
    asOf,
  ]);
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    '5' + h.slice(13, 16),
    '8' + h.slice(17, 20),
    h.slice(20, 32),
  ].join('-');
}

@Injectable()
export class ResearchObservationScheduler {
  private readonly logger = new Logger(ResearchObservationScheduler.name);
  private cursor: string | null = null;
  private active = false;
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ResearchObservationStore) private readonly store: ResearchObservationStore,
    @Inject(ResearchObservationService) private readonly observations: ResearchObservationService,
    @Inject(MarketBarReader) private readonly bars: MarketBarReader,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    const tick = () => void this.run().catch(() => this.logger.warn('读取待复核研究失败'));
    this.timer = setInterval(tick, 60_000);
    this.timer.unref();
    tick();
  }
  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async run(now = new Date()) {
    if (this.active) return;
    this.active = true;
    try {
      const cutoff = new Date(Math.floor(now.getTime() / SLOT) * SLOT);
      const rows = await this.db.aiRun.findMany({
        where: {
          status: 'succeeded',
          researchOwnerId: { not: null },
          researchSubmissionId: { not: null },
          modelMetadata: {
            path: ['scheduledObservationMethod'],
            equals: RESEARCH_OBSERVATION_METHOD,
          },
          ...(this.cursor ? { id: { gt: this.cursor } } : {}),
        },
        select: { id: true, researchOwnerId: true, result: true },
        orderBy: { id: 'asc' },
        take: PAGE,
      });
      for (const row of rows) {
        const result = researchResultV2Schema.safeParse(row.result);
        if (
          !row.researchOwnerId ||
          !result.success ||
          Date.parse(result.data.createdAt) > cutoff.getTime()
        )
          continue;
        let saved: Awaited<ReturnType<ResearchObservationStore['readRun']>>;
        try {
          saved = await this.store.readRun(row.researchOwnerId, row.id, now);
        } catch {
          this.logger.warn({
            operation: 'research.scheduled-observation.history',
            reportId: row.id,
          });
          continue;
        }
        const { inference, scopeSnapshot } = result.data;
        for (const claim of inference.claims) {
          if (claim.kind !== 'price-direction') continue;
          const instrument = researchScopeInstrumentsV2(scopeSnapshot).find(
            (i) => i.instrumentId === claim.instrumentId,
          );
          if (!instrument) continue;
          try {
            const current = saved.find(
              (o) => o.claimId === claim.id && o.methodVersion === RESEARCH_OBSERVATION_METHOD,
            )?.current;
            if (!(await this.needsCheck(current, instrument.symbol, cutoff))) continue;
            await this.submit(row.researchOwnerId, row.id, scopeSnapshot.mode, claim.id, cutoff);
          } catch {
            this.logger.warn({
              operation: 'research.scheduled-observation',
              reportId: row.id,
              claimId: claim.id,
              status: 'unavailable',
            });
          }
        }
      }
      this.cursor = rows.length === PAGE ? rows.at(-1)!.id : null;
    } finally {
      this.active = false;
    }
  }

  private async needsCheck(
    current:
      Awaited<ReturnType<ResearchObservationStore['readRun']>>[number]['current'] | undefined,
    symbol: string,
    cutoff: Date,
  ) {
    if (!current) return true;
    const evaluation = current.evaluation;
    const { startSession, endSession, endCloseAt } = evaluation.window;
    if (evaluation.status === 'completed' || evaluation.status === 'not_applicable') return false;
    if (evaluation.status === 'not_due')
      return endCloseAt !== null && Date.parse(endCloseAt) <= cutoff.getTime();
    const last = Date.parse(current.inputs.visibleAt);
    if (last >= cutoff.getTime()) return false;
    if (startSession && endSession) {
      const published = await this.bars.researchCertificatePublishedAt(
        symbol,
        startSession,
        endSession,
      );
      if (!published || published > cutoff) return false;
      if (published.getTime() > last) return true;
    }
    return cutoff.getTime() - last >= DAY;
  }

  private async submit(
    ownerId: string,
    runId: string,
    mode: 'actual' | 'shadow',
    claimId: string,
    cutoff: Date,
  ) {
    const locator = { view: 'scoped', mode, scope: 'all' };
    const last = await this.db.researchObservationSubmission.findFirst({
      where: {
        ownerId,
        observation: { runId, claimId, methodVersion: RESEARCH_OBSERVATION_METHOD },
      },
      select: { state: true, submissionId: true, visibleAt: true, expiresAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    if (last?.state === 'failed' && cutoff.getTime() - last.visibleAt.getTime() < DAY) return;
    if (last?.state === 'pending') {
      if (last.expiresAt > new Date()) return;
      const asOf = last.visibleAt.toISOString();
      if (last.submissionId === submissionId(runId, claimId, asOf)) {
        await this.observations.submit(
          ownerId,
          runId,
          locator,
          { submissionId: last.submissionId, claimId, asOf },
          true,
        );
        return;
      }
    }
    const asOf = cutoff.toISOString();
    await this.observations.submit(
      ownerId,
      runId,
      locator,
      { submissionId: submissionId(runId, claimId, asOf), claimId, asOf },
      true,
    );
  }
}
