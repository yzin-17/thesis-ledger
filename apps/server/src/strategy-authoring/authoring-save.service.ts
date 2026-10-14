import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { isEqual } from 'es-toolkit';
import { type AuthoringContent } from '@thesis-ledger/schemas';
import type { PrismaService } from '../platform/prisma.service.js';
import type { StrategyCreationService } from '../backtest/strategy-creation.service.js';
import type { InstrumentService } from '../market/instrument.service.js';
import type { AuthoringProvenanceRepository } from './authoring-provenance.repository.js';
import {
  lockOwnedAuthoringDraft,
  authoringConflict,
  requireAuthoringOwner,
} from './authoring-store.js';
import { validateAuthoringGeneration } from './authoring-semantics.js';

export class AuthoringSaveService {
  constructor(
    private readonly database: PrismaService,
    private readonly creation: StrategyCreationService,
    private readonly sources: AuthoringProvenanceRepository,
    private readonly instruments: InstrumentService,
  ) {}
  private validated(content: AuthoringContent) {
    let definition: unknown;
    try {
      definition = JSON.parse(content.definitionText);
    } catch {
      throw new BadRequestException({
        code: 'AUTHORING_SCHEMA_INVALID',
        message: '请先修正当前定义',
      });
    }
    return validateAuthoringGeneration(content, {
      definition,
      coverage: content.requirements
        .filter((item) => item.state === 'understood')
        .map((item) => ({ requirementId: item.id, definitionPaths: item.definitionPaths })),
    });
  }
  async review(owner: string, id: string) {
    const ownerId = requireAuthoringOwner(owner);
    z.uuid().parse(id);
    return this.database.$transaction(async (tx) => {
      const draft = await lockOwnedAuthoringDraft(tx, ownerId, id);
      const rows = await tx.$queryRaw<{ content: AuthoringContent }[]>(
        Prisma.sql`SELECT content FROM "StrategyAuthoringRevision" WHERE "draftId"=${id}::uuid AND "ownerId"=${ownerId} AND revision=${draft.revision}`,
      );
      const { definition } = this.validated(rows[0]!.content);
      return {
        revision: draft.revision,
        definition,
        definitionHash: this.creation.definitionFingerprint(definition),
      };
    });
  }
  save(owner: string, id: string, raw: unknown) {
    const ownerId = requireAuthoringOwner(owner);
    z.uuid().parse(id);
    const request = z
      .object({
        expectedRevision: z.number().int().positive(),
        name: z.string().trim().min(1).max(200),
        reviewedDefinitionHash: z.string().regex(/^[a-f0-9]{64}$/u),
      })
      .strict()
      .parse(raw);
    return this.database.$transaction(async (tx) => {
      const draft = await lockOwnedAuthoringDraft(tx, ownerId, id);
      if (draft.revision !== request.expectedRevision)
        return authoringConflict(
          'AUTHORING_REVISION_CONFLICT',
          '保存确认修订已过期',
          draft.revision,
        );
      if (draft.state === 'saved') {
        const version = await tx.strategyVersion.findUniqueOrThrow({
          where: { id: draft.savedVersionId! },
          include: { strategy: true },
        });
        if (
          version.strategy.name !== request.name ||
          this.creation.definitionFingerprint(version.schema) !== request.reviewedDefinitionHash
        )
          return authoringConflict('AUTHORING_IDEMPOTENCY_CONFLICT', '重复保存不能更换审核输入');
        return { strategyId: version.strategyId, versionId: version.id, version: version.version };
      }
      if (draft.state !== 'editing') return authoringConflict('AUTHORING_CLOSED', '草稿已结束');
      const rows = await tx.$queryRaw<{ content: AuthoringContent }[]>(
        Prisma.sql`SELECT content FROM "StrategyAuthoringRevision" WHERE "draftId"=${id}::uuid AND "ownerId"=${ownerId} AND revision=${draft.revision}`,
      );
      const content = rows[0]!.content;
      const { definition } = this.validated(content);
      if (this.creation.definitionFingerprint(definition) !== request.reviewedDefinitionHash)
        return authoringConflict('AUTHORING_REVISION_CONFLICT', '当前定义与已审核定义不同');
      const instrument = await this.instruments.resolveTradableInstrument(
        content.confirmation!.instrumentId,
      );
      if (!isEqual(instrument, definition.executionInstrument))
        throw new BadRequestException({
          code: 'AUTHORING_INSTRUMENT_MISMATCH',
          message: '请重新确认目录标的',
        });
      const pending = await tx.$queryRaw<
        { count: bigint }[]
      >(Prisma.sql`SELECT count(*) AS count FROM "StrategyAuthoringOperation"
        WHERE "draftId"=${id}::uuid AND "ownerId"=${ownerId} AND (status IN ('queued','running') OR (revision=${draft.revision} AND status='succeeded' AND disposition='unapplied'))`);
      const proposals = await tx.$queryRaw<
        { count: bigint }[]
      >(Prisma.sql`SELECT count(*) AS count FROM "StrategyAuthoringProposal"
        WHERE "draftId"=${id}::uuid AND "ownerId"=${ownerId} AND revision=${draft.revision} AND status='pending'`);
      if (pending[0]!.count > 0n || proposals[0]!.count > 0n)
        return authoringConflict('AUTHORING_OPERATION_ACTIVE', '请先处理活动操作或未应用建议');
      const created = await this.creation.createInTransaction(tx, {
        ownerId,
        name: request.name,
        definition,
        source: { kind: 'ai_assisted', referenceId: id },
      });
      const version = created.versions[0]!;
      await tx.$executeRaw(Prisma.sql`UPDATE "StrategyAuthoringDraft" SET state='saved', "savedVersionId"=${version.id}::uuid, "updatedAt"=clock_timestamp()
        WHERE id=${id}::uuid AND "ownerId"=${ownerId} AND revision=${draft.revision} AND state='editing'`);
      await this.sources.recordSource(tx, ownerId, id, version.id, draft.revision);
      return { strategyId: created.id, versionId: version.id, version: version.version };
    });
  }
}
