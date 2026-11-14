import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type JournalPeriodReviewSnapshot } from '@prisma/client';
import {
  journalPeriodSnapshotSaveRequestSchema,
  journalPeriodSnapshotListQuerySchema,
  journalStoredPeriodSnapshotSchema,
  journalSnapshotDetailQuerySchema,
  journalSnapshotIdSchema,
  type IdentityPrincipal,
  type JournalPeriodAiExplanation,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { JournalReviewAnalysis } from './journal-review-analysis.js';
import { JournalPeriodReviewAi } from './journal-period-review-ai.js';

const fingerprints = (
  rows: {
    input: { reference: { reviewObjectId: string }; projection: { evidenceFingerprint: string } };
  }[],
) =>
  Object.fromEntries(
    rows.map((row) => [
      row.input.reference.reviewObjectId,
      row.input.projection.evidenceFingerprint,
    ]),
  );

const sameFingerprints = (actual: Record<string, string>, expected: Record<string, string>) =>
  Object.keys(actual).length === Object.keys(expected).length &&
  Object.entries(actual).every(([id, value]) => expected[id] === value);

function view(row: JournalPeriodReviewSnapshot) {
  return journalStoredPeriodSnapshotSchema.parse({
    id: row.id,
    accountId: row.accountId,
    mode: row.mode,
    symbol: row.symbol,
    start: row.start,
    end: row.end,
    ledgerRevision: row.ledgerRevision.toString(),
    projectionGeneration: row.projectionGeneration.toString(),
    algorithmVersion: row.algorithmVersion,
    analysis: row.analysisSnapshot,
    aiExplanation: row.aiExplanation,
    createdAt: row.createdAt.toISOString(),
  });
}

@Injectable()
export class JournalPeriodReviewSnapshots {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analysis: JournalReviewAnalysis,
    private readonly ai: JournalPeriodReviewAi,
  ) {}

  async save(raw: unknown, principal: IdentityPrincipal) {
    const request = journalPeriodSnapshotSaveRequestSchema.parse(raw);
    const {
      aiRunId,
      expectedLedgerRevision,
      expectedProjectionGeneration,
      expectedAlgorithmVersion,
      objectFingerprints,
      ...scope
    } = request;
    let savedAi: JournalPeriodAiExplanation | null = null;
    if (aiRunId) {
      const ai = await this.ai.get(
        aiRunId,
        { accountId: request.accountId, mode: request.mode },
        principal,
      );
      if (
        ai.status !== 'succeeded' ||
        !ai.result ||
        ai.accountId !== scope.accountId ||
        ai.mode !== scope.mode ||
        ai.symbol !== (scope.symbol ?? null) ||
        ai.start !== scope.start ||
        ai.end !== scope.end ||
        ai.ledgerRevision !== expectedLedgerRevision ||
        ai.projectionGeneration !== expectedProjectionGeneration ||
        ai.algorithmVersion !== expectedAlgorithmVersion ||
        !sameFingerprints(ai.objectFingerprints, objectFingerprints)
      )
        throw new ConflictException({
          errorCode: 'JOURNAL_PERIOD_AI_MISMATCH',
          message: '本次 AI 解读未完成或与周期统计不一致，请重新分析后保存',
        });
      savedAi = ai;
    }
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT "accountId" FROM "AccountLedgerState" WHERE "accountId" = ${request.accountId}::uuid FOR SHARE`;
          const analyzed = await this.analysis.period(scope, tx);
          const actualFingerprints = fingerprints(analyzed.candidates);
          if (
            analyzed.ledgerRevision !== expectedLedgerRevision ||
            analyzed.projectionGeneration !== expectedProjectionGeneration ||
            !sameFingerprints(actualFingerprints, objectFingerprints)
          )
            throw new ConflictException({
              errorCode: 'JOURNAL_EVIDENCE_CHANGED',
              message: '周期复盘证据已变化，请重新分析后保存快照',
            });
          if (analyzed.result.algorithmVersion !== expectedAlgorithmVersion)
            throw new ConflictException({
              errorCode: 'JOURNAL_ALGORITHM_CHANGED',
              message: '周期复盘算法版本已变化，请重新分析后保存',
            });
          const row = await tx.journalPeriodReviewSnapshot.create({
            data: {
              accountId: request.accountId,
              mode: request.mode,
              symbol: request.symbol ?? null,
              start: request.start,
              end: request.end,
              ledgerRevision: BigInt(expectedLedgerRevision),
              projectionGeneration: BigInt(expectedProjectionGeneration),
              algorithmVersion: expectedAlgorithmVersion,
              objectFingerprints,
              analysisSnapshot: JSON.parse(JSON.stringify(analyzed)) as Prisma.InputJsonValue,
              ...(savedAi
                ? {
                    aiExplanation: JSON.parse(JSON.stringify(savedAi)) as Prisma.InputJsonValue,
                  }
                : {}),
            },
          });
          return view(row);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
        throw new ConflictException({
          errorCode: 'JOURNAL_SAVE_CONFLICT',
          message: '保存期间复盘证据发生竞争，请刷新后重试',
        });
      throw error;
    }
  }

  async list(raw: unknown) {
    const query = journalPeriodSnapshotListQuerySchema.parse(raw);
    const where = { accountId: query.accountId, mode: query.mode };
    if (
      query.cursor &&
      !(await this.prisma.journalPeriodReviewSnapshot.findFirst({
        where: { ...where, id: query.cursor },
        select: { id: true },
      }))
    )
      throw new BadRequestException({
        errorCode: 'JOURNAL_SNAPSHOT_CURSOR_INVALID',
        message: '周期快照游标不存在或不属于当前账户',
      });
    const rows = await this.prisma.journalPeriodReviewSnapshot.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, query.limit);
    return {
      items: page.map(view),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async get(id: string, raw: unknown) {
    const scope = journalSnapshotDetailQuerySchema.parse(raw);
    const snapshotId = journalSnapshotIdSchema.parse(id);
    const row = await this.prisma.journalPeriodReviewSnapshot.findFirst({
      where: { id: snapshotId, accountId: scope.accountId, mode: scope.mode },
    });
    if (!row)
      throw new NotFoundException({
        errorCode: 'JOURNAL_SNAPSHOT_NOT_FOUND',
        message: '周期快照不存在或不属于当前账户',
      });
    return view(row);
  }
}
