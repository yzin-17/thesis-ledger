import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { AuthoringDraftRepository } from './authoring-draft.repository.js';
import type { AuthoringOperation } from './authoring-operation.repository.js';
import {
  type AuthoringDatabase,
  requireAuthoringOwner,
  lockOwnedAuthoringDraft,
  authoringNotFound,
  authoringConflict,
} from './authoring-store.js';
import { mergeAuthoringAnalysis } from './authoring-analysis.js';

export const authoringApplyAnalysisSchema = z
  .object({ expectedRevision: z.number().int().positive() })
  .strict();

export class AuthoringAnalysisRepository {
  constructor(
    private readonly database: AuthoringDatabase,
    private readonly drafts: AuthoringDraftRepository,
  ) {}
  apply(owner: string, id: string, input: unknown) {
    const ownerId = requireAuthoringOwner(owner);
    z.uuid().parse(id);
    const request = authoringApplyAnalysisSchema.parse(input);
    return this.database.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<AuthoringOperation[]>(Prisma.sql`
        SELECT * FROM "StrategyAuthoringOperation" WHERE id=${id}::uuid AND "ownerId"=${ownerId}`);
      const operation = rows[0] ?? authoringNotFound();
      const draft = await lockOwnedAuthoringDraft(tx, ownerId, operation.draftId);
      if (
        operation.revision !== request.expectedRevision ||
        operation.status !== 'succeeded' ||
        operation.input.selection.kind !== 'analyze'
      )
        return authoringConflict('AUTHORING_OPERATION_CONFLICT', '操作不对应可应用的分析结果');
      const reference = {
        operationId: id,
        draftId: operation.draftId,
        appliedRevision: operation.revision + 1,
      };
      // The draft lock serializes application; re-read disposition after a concurrent waiter commits.
      const latest = await tx.$queryRaw<AuthoringOperation[]>(Prisma.sql`
        SELECT * FROM "StrategyAuthoringOperation" WHERE id=${id}::uuid AND "ownerId"=${ownerId}`);
      if (latest[0]!.disposition === 'applied') return reference;
      if (draft.state !== 'editing') return authoringConflict('AUTHORING_CLOSED', '草稿已结束');
      if (draft.revision !== operation.revision || latest[0]!.disposition !== 'unapplied')
        return authoringConflict(
          'AUTHORING_REVISION_CONFLICT',
          '分析输入修订已过期',
          draft.revision,
        );
      if (!operation.outcome?.outputText)
        return authoringConflict('AUTHORING_OPERATION_CONFLICT', '分析结果缺失');
      const content = mergeAuthoringAnalysis(
        operation.input.content,
        operation.revision,
        JSON.parse(operation.outcome.outputText),
      );
      await this.drafts.updateInTransaction(tx, ownerId, operation.draftId, {
        expectedRevision: operation.revision,
        content,
      });
      const changed = await tx.$executeRaw(Prisma.sql`
        UPDATE "StrategyAuthoringOperation" SET disposition='applied', "updatedAt"=clock_timestamp()
        WHERE id=${id}::uuid AND "ownerId"=${ownerId} AND status='succeeded' AND disposition='unapplied'`);
      if (changed !== 1)
        return authoringConflict('AUTHORING_OPERATION_CONFLICT', '分析已被其他请求处理');
      return reference;
    });
  }
}
