import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  journalReviewSnapshotRequestSchema,
  journalSnapshotHistoryQuerySchema,
  journalSnapshotIdSchema,
  journalSnapshotDetailQuerySchema,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { JournalReviewQuery } from './journal-review-query.js';
import { journalAnalyzeCandidate } from './journal-review-analysis.js';
import { journalSnapshotView } from './journal-snapshot-view.js';
import { journalReviewWithDraft } from './journal-review-draft.js';
import { JournalReviewAi } from './journal-review-ai.js';
import {
  journalSnapshotCursor,
  journalSnapshotWhere,
  readJournalSnapshotCursor,
} from './journal-snapshot-scope.js';

@Injectable()
export class JournalReviewSnapshots {
  constructor(
    private readonly prisma: PrismaService,
    private readonly candidates: JournalReviewQuery,
    @Optional() private readonly ai?: JournalReviewAi,
  ) {}

  async save(raw: unknown) {
    const request = journalReviewSnapshotRequestSchema.parse(raw);
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT "accountId" FROM "AccountLedgerState" WHERE "accountId" = ${request.accountId}::uuid FOR SHARE`;
          const candidate = journalReviewWithDraft(
            await this.candidates.get(request, tx),
            request.analysisDraft,
          );
          const input = candidate.input;
          if (request.evidenceFingerprint !== input.projection.evidenceFingerprint)
            throw new ConflictException({
              errorCode: 'JOURNAL_EVIDENCE_CHANGED',
              message: '复盘证据已变化，请刷新后重新分析并保存',
            });
          const output = journalAnalyzeCandidate(candidate);
          if (
            request.expectedAlgorithmVersion !== undefined &&
            request.expectedAlgorithmVersion !== output.algorithmVersion
          )
            throw new ConflictException({
              errorCode: 'JOURNAL_ALGORITHM_CHANGED',
              message: '复盘算法版本已变化，请重新分析后保存',
            });
          if (request.aiRunId !== undefined) {
            if (!this.ai) throw new BadRequestException('复盘 AI 解读当前不可用');
            output.aiExplanation = await this.ai.snapshotMetadata(
              request.aiRunId,
              input,
              output.algorithmVersion,
            );
          }
          const reference = input.reference;
          const row = await tx.journalReviewSnapshot.create({
            data: {
              accountId: request.accountId,
              mode: request.mode,
              reviewObjectType: reference.reviewObjectType,
              tradeId: reference.tradeId,
              closeSliceId:
                reference.reviewObjectType === 'CLOSE_SLICE' ? reference.closeSliceId : null,
              factIds: input.projection.factIds,
              eventIds: input.projection.eventIds,
              ledgerRevision: BigInt(input.projection.ledgerRevision),
              projectionGeneration: BigInt(input.projection.projectionGeneration),
              projectionFingerprint: input.projection.projectionFingerprint,
              fxEvidenceVersion: input.projection.fxEvidenceVersion,
              conversionFingerprint: input.projection.conversionFingerprint,
              inputSnapshot: JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue,
              outputSnapshot: JSON.parse(JSON.stringify(output)) as Prisma.InputJsonValue,
            },
          });
          return journalSnapshotView(
            row,
            new Map([[reference.reviewObjectId, input.projection.evidenceFingerprint]]),
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10000 },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
        throw new ConflictException({
          errorCode: 'JOURNAL_SAVE_CONFLICT',
          message: '保存期间证据发生竞争，请刷新后重试',
        });
      throw error;
    }
  }

  private async fingerprints(accountId: string, mode: 'actual' | 'shadow') {
    const current = await this.candidates.readObjects({ accountId, mode });
    return new Map(
      current.map((row) => [
        row.input.reference.reviewObjectId,
        row.input.projection.evidenceFingerprint,
      ]),
    );
  }

  async list(raw: unknown) {
    const query = journalSnapshotHistoryQuerySchema.parse(raw);
    const where = journalSnapshotWhere(query);
    const after = readJournalSnapshotCursor(query);
    if (
      after !== null &&
      !(await this.prisma.journalReviewSnapshot.findFirst({
        where: { ...where, id: after },
        select: { id: true },
      }))
    )
      throw new BadRequestException({
        errorCode: 'JOURNAL_SNAPSHOT_CURSOR_INVALID',
        message: '复盘快照游标来源已失效，请重新查询',
      });
    const rows = await this.prisma.journalReviewSnapshot.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(after === null ? {} : { cursor: { id: after }, skip: 1 }),
    });
    const fingerprints = await this.fingerprints(query.accountId, query.mode);
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => journalSnapshotView(row, fingerprints)),
      nextCursor: rows.length > query.limit && last ? journalSnapshotCursor(query, last.id) : null,
    };
  }

  async get(id: string, raw: unknown) {
    const query = journalSnapshotDetailQuerySchema.parse(raw);
    const snapshotId = journalSnapshotIdSchema.parse(id);
    const row = await this.prisma.journalReviewSnapshot.findFirst({
      where: { accountId: query.accountId, mode: query.mode, id: snapshotId },
    });
    if (!row)
      throw new NotFoundException({
        errorCode: 'JOURNAL_SNAPSHOT_NOT_FOUND',
        message: '复盘快照不存在或不属于当前查询范围',
      });
    return journalSnapshotView(row, await this.fingerprints(query.accountId, query.mode));
  }
}
