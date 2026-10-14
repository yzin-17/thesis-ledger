import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { type AuthoringContent } from '@thesis-ledger/schemas';
import type { AuthoringDraftRepository } from './authoring-draft.repository.js';
import type { AuthoringOperation } from './authoring-operation.repository.js';
import {
  type AuthoringDatabase,
  requireAuthoringOwner,
  lockOwnedAuthoringDraft,
  authoringNotFound,
  authoringConflict,
} from './authoring-store.js';
import { validateAuthoringGeneration } from './authoring-semantics.js';

export class AuthoringResultRepository {
  constructor(
    private readonly database: AuthoringDatabase,
    private readonly drafts: AuthoringDraftRepository,
  ) {}
  applyGeneration(owner: string, id: string, raw: unknown) {
    const ownerId = requireAuthoringOwner(owner);
    z.uuid().parse(id);
    const input = z.object({ expectedRevision: z.number().int().positive() }).strict().parse(raw);
    return this.database.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<AuthoringOperation[]>(
        Prisma.sql`SELECT * FROM "StrategyAuthoringOperation" WHERE id=${id}::uuid AND "ownerId"=${ownerId}`,
      );
      const operation = rows[0] ?? authoringNotFound();
      const draft = await lockOwnedAuthoringDraft(tx, ownerId, operation.draftId);
      const latest = await tx.$queryRaw<AuthoringOperation[]>(
        Prisma.sql`SELECT * FROM "StrategyAuthoringOperation" WHERE id=${id}::uuid AND "ownerId"=${ownerId}`,
      );
      if (
        operation.input.selection.kind !== 'generate' ||
        operation.status !== 'succeeded' ||
        operation.revision !== input.expectedRevision
      )
        return authoringConflict('AUTHORING_OPERATION_CONFLICT', '操作不对应可应用的生成结果');
      const reference = {
        operationId: id,
        draftId: draft.id,
        appliedRevision: operation.revision + 1,
      };
      if (latest[0]!.disposition === 'applied') return reference;
      if (
        draft.state !== 'editing' ||
        draft.revision !== input.expectedRevision ||
        latest[0]!.disposition !== 'unapplied'
      )
        return authoringConflict('AUTHORING_REVISION_CONFLICT', '生成结果已过期');
      if (!operation.outcome?.outputText)
        return authoringConflict('AUTHORING_OPERATION_CONFLICT', '生成结果缺失');
      const output = validateAuthoringGeneration(
        operation.input.content,
        JSON.parse(operation.outcome.outputText),
      );
      const content: AuthoringContent = {
        ...operation.input.content,
        definitionText: JSON.stringify(output.definition, null, 2),
        requirements: operation.input.content.requirements.map((requirement) => ({
          ...requirement,
          definitionPaths:
            output.coverage.find((item) => item.requirementId === requirement.id)
              ?.definitionPaths ?? requirement.definitionPaths,
        })),
      };
      await this.drafts.updateInTransaction(
        tx,
        ownerId,
        draft.id,
        { expectedRevision: input.expectedRevision, content },
        true,
      );
      await tx.$executeRaw(Prisma.sql`UPDATE "StrategyAuthoringOperation" SET disposition='applied', "updatedAt"=clock_timestamp()
        WHERE id=${id}::uuid AND "ownerId"=${ownerId} AND disposition='unapplied'`);
      return reference;
    });
  }
}
