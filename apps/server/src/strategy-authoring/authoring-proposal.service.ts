import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { AuthoringProposalInput } from '@thesis-ledger/schemas';
import type {
  AuthoringOperationRepository,
  AuthoringOperation,
} from './authoring-operation.repository.js';
import type { AuthoringProvenanceRepository } from './authoring-provenance.repository.js';
import type { AuthoringDraftRepository } from './authoring-draft.repository.js';
import { validateAuthoringModification } from './authoring-modification.js';
import {
  authoringConflict,
  authoringNotFound,
  lockOwnedAuthoringDraft,
  requireAuthoringOwner,
  type AuthoringDatabase,
} from './authoring-store.js';

export const authoringExpectedRevisionSchema = z
  .object({ expectedRevision: z.number().int().positive() })
  .strict();
type Proposal = {
  id: string;
  draftId: string;
  ownerId: string;
  revision: number;
  operationId: string;
  payload: AuthoringProposalInput;
  status: string;
};

export class AuthoringProposalService {
  constructor(
    private readonly database: AuthoringDatabase,
    private readonly operations: AuthoringOperationRepository,
    private readonly sources: AuthoringProvenanceRepository,
    private readonly drafts: AuthoringDraftRepository,
  ) {}
  async prepare(owner: string, id: string, raw: unknown) {
    const { expectedRevision } = authoringExpectedRevisionSchema.parse(raw);
    const operation = await this.operations.read(owner, id);
    if (
      operation.revision !== expectedRevision ||
      operation.status !== 'succeeded' ||
      operation.input.selection.kind !== 'modify' ||
      !operation.outcome?.outputText
    )
      return authoringConflict('AUTHORING_OPERATION_CONFLICT', '操作不对应可审核修改建议');
    const output = validateAuthoringModification(
      operation.input.content,
      operation.input.selection,
      JSON.parse(operation.outcome.outputText),
    );
    return this.sources.propose(owner, operation.draftId, {
      operationId: id,
      expectedRevision,
      intent: operation.input.selection.intent,
      allowedPaths: output.allowedPaths,
      beforeText: operation.input.content.definitionText,
      afterText: JSON.stringify(output.definition, null, 2),
      differences: output.differences,
    });
  }
  apply(owner: string, id: string, raw: unknown) {
    const ownerId = requireAuthoringOwner(owner);
    z.uuid().parse(id);
    const { expectedRevision } = authoringExpectedRevisionSchema.parse(raw);
    return this.database.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Proposal[]>(
        Prisma.sql`SELECT * FROM "StrategyAuthoringProposal" WHERE id=${id}::uuid AND "ownerId"=${ownerId}`,
      );
      const proposal = rows[0] ?? authoringNotFound();
      const draft = await lockOwnedAuthoringDraft(tx, ownerId, proposal.draftId);
      const latest = await tx.$queryRaw<Proposal[]>(
        Prisma.sql`SELECT * FROM "StrategyAuthoringProposal" WHERE id=${id}::uuid AND "ownerId"=${ownerId}`,
      );
      const reference = {
        proposalId: id,
        draftId: draft.id,
        appliedRevision: proposal.revision + 1,
      };
      if (expectedRevision !== proposal.revision)
        return authoringConflict('AUTHORING_PROPOSAL_STALE', '修改审核修订不同');
      if (latest[0]!.status === 'applied') return reference;
      if (
        draft.state !== 'editing' ||
        draft.revision !== expectedRevision ||
        latest[0]!.status !== 'pending'
      )
        return authoringConflict('AUTHORING_PROPOSAL_STALE', '修改建议已处理或过期');
      const operations = await tx.$queryRaw<AuthoringOperation[]>(
        Prisma.sql`SELECT * FROM "StrategyAuthoringOperation" WHERE id=${proposal.operationId}::uuid AND "ownerId"=${ownerId}`,
      );
      const operation = operations[0] ?? authoringNotFound();
      if (
        operation.status !== 'succeeded' ||
        operation.disposition !== 'unapplied' ||
        !operation.outcome?.outputText
      )
        return authoringConflict('AUTHORING_OPERATION_CONFLICT', '修改操作不可应用');
      const output = validateAuthoringModification(
        operation.input.content,
        operation.input.selection,
        JSON.parse(operation.outcome.outputText),
      );
      await this.drafts.updateInTransaction(
        tx,
        ownerId,
        draft.id,
        {
          expectedRevision,
          content: {
            ...operation.input.content,
            confirmation: output.confirmation,
            confirmationDraft: undefined,
            definitionText: JSON.stringify(output.definition, null, 2),
            manualChanges: [
              ...operation.input.content.manualChanges,
              `用户确认局部修改：${operation.input.selection.intent}`,
            ],
            requirements: operation.input.content.requirements.map((requirement) => ({
              ...requirement,
              definitionPaths:
                output.coverage.find((coverage) => coverage.requirementId === requirement.id)
                  ?.definitionPaths ?? requirement.definitionPaths,
            })),
          },
        },
        true,
      );
      await tx.$executeRaw(
        Prisma.sql`UPDATE "StrategyAuthoringProposal" SET status='applied', "updatedAt"=clock_timestamp() WHERE id=${id}::uuid AND "ownerId"=${ownerId}`,
      );
      await tx.$executeRaw(
        Prisma.sql`UPDATE "StrategyAuthoringOperation" SET disposition='applied', "updatedAt"=clock_timestamp() WHERE id=${operation.id}::uuid AND "ownerId"=${ownerId}`,
      );
      return reference;
    });
  }
}
