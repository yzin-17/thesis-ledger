import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { AuthoringOperation } from './authoring-operation.repository.js';
import { authoringExpectedRevisionSchema } from './authoring-proposal.service.js';
import {
  type AuthoringDatabase,
  requireAuthoringOwner,
  lockOwnedAuthoringDraft,
  authoringNotFound,
  authoringConflict,
} from './authoring-store.js';

export class AuthoringOperationHistoryRepository {
  constructor(private readonly database: AuthoringDatabase) {}
  list(owner: string, draftId: string) {
    const ownerId = requireAuthoringOwner(owner);
    z.uuid().parse(draftId);
    return this.database.$transaction(async (tx) => {
      const drafts = await tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM "StrategyAuthoringDraft" WHERE id=${draftId}::uuid AND "ownerId"=${ownerId}`,
      );
      if (!drafts.length) return authoringNotFound();
      return tx.$queryRaw(Prisma.sql`SELECT o.id, o.revision, o.status, o.disposition, o."createdAt", o."updatedAt",
        o.input->'selection' AS selection, o.outcome->>'errorCode' AS "errorCode", p.id AS "proposalId", p.status AS "proposalStatus"
        FROM "StrategyAuthoringOperation" o LEFT JOIN "StrategyAuthoringProposal" p ON p."operationId"=o.id AND p."ownerId"=o."ownerId"
        WHERE o."draftId"=${draftId}::uuid AND o."ownerId"=${ownerId} ORDER BY o."createdAt" DESC, o.id DESC LIMIT 20`);
    });
  }
  discard(owner: string, id: string, raw: unknown) {
    const ownerId = requireAuthoringOwner(owner);
    z.uuid().parse(id);
    const { expectedRevision } = authoringExpectedRevisionSchema.parse(raw);
    return this.database.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<AuthoringOperation[]>(
        Prisma.sql`SELECT * FROM "StrategyAuthoringOperation" WHERE id=${id}::uuid AND "ownerId"=${ownerId}`,
      );
      const operation = rows[0] ?? authoringNotFound();
      const draft = await lockOwnedAuthoringDraft(tx, ownerId, operation.draftId);
      if (operation.revision !== expectedRevision || operation.status !== 'succeeded')
        return authoringConflict('AUTHORING_OPERATION_CONFLICT', '只有成功结果可以放弃');
      const latest = await tx.$queryRaw<AuthoringOperation[]>(
        Prisma.sql`SELECT * FROM "StrategyAuthoringOperation" WHERE id=${id}::uuid AND "ownerId"=${ownerId}`,
      );
      if (latest[0]!.disposition === 'stale') return { id, disposition: 'stale' };
      if (
        draft.state !== 'editing' ||
        draft.revision !== expectedRevision ||
        latest[0]!.disposition !== 'unapplied'
      )
        return authoringConflict('AUTHORING_REVISION_CONFLICT', '结果已应用或草稿修订改变');
      await tx.$executeRaw(
        Prisma.sql`UPDATE "StrategyAuthoringOperation" SET disposition='stale', "updatedAt"=clock_timestamp() WHERE id=${id}::uuid AND "ownerId"=${ownerId}`,
      );
      await tx.$executeRaw(
        Prisma.sql`UPDATE "StrategyAuthoringProposal" SET status='discarded', "updatedAt"=clock_timestamp() WHERE "operationId"=${id}::uuid AND "ownerId"=${ownerId} AND status='pending'`,
      );
      return { id, disposition: 'stale' };
    });
  }
}
