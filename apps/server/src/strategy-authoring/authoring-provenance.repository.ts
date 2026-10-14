import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  authoringProposalInputSchema,
  authoringStrategySchema,
  authoringSourceSnapshotSchema,
  type AuthoringContent,
  type AuthoringProposalInput,
} from '@thesis-ledger/schemas';
import {
  type AuthoringDatabase,
  type AuthoringTransaction,
  lockAuthoringDraft,
  lockOwnedAuthoringDraft,
  requireAuthoringOwner,
  authoringConflict,
  authoringNotFound,
} from './authoring-store.js';

type Proposal = {
  id: string;
  draftId: string;
  ownerId: string;
  revision: number;
  operationId: string;
  payload: AuthoringProposalInput;
  status: 'pending' | 'applied' | 'discarded' | 'expired';
};
type Source = {
  versionId: string;
  draftId: string;
  ownerId: string;
  revision: number;
  snapshot: { kind: 'ai_assisted'; content: AuthoringContent; operationIds: string[] };
  createdAt: Date;
};

// Internal persistence only. T03/T05 own semantic validation and server-authorized modification scope.
export class AuthoringProvenanceRepository {
  constructor(private readonly database: AuthoringDatabase) {}
  propose(owner: string, draftId: string, input: unknown) {
    const ownerId = requireAuthoringOwner(owner);
    z.uuid().parse(draftId);
    const payload = authoringProposalInputSchema.parse(input);
    authoringStrategySchema.parse(payload.afterText);
    return this.database.$transaction(async (tx) => {
      await lockAuthoringDraft(tx, ownerId, draftId, payload.expectedRevision);
      const existing = await tx.$queryRaw<Proposal[]>(
        Prisma.sql`SELECT * FROM "StrategyAuthoringProposal" WHERE "operationId"=${payload.operationId}::uuid AND "ownerId"=${ownerId}`,
      );
      if (existing[0]) return existing[0];
      const operations = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id FROM "StrategyAuthoringOperation" WHERE id = ${payload.operationId}::uuid AND "ownerId" = ${ownerId}
          AND "draftId" = ${draftId}::uuid AND revision = ${payload.expectedRevision} AND status = 'succeeded' AND disposition = 'unapplied'`);
      if (!operations.length)
        return authoringConflict('AUTHORING_PROPOSAL_STALE', '提案操作不可访问、未成功或已过期');
      const revisions = await tx.$queryRaw<{ content: AuthoringContent }[]>(Prisma.sql`
        SELECT content FROM "StrategyAuthoringRevision" WHERE "draftId" = ${draftId}::uuid AND "ownerId" = ${ownerId} AND revision = ${payload.expectedRevision}`);
      if (payload.beforeText !== revisions[0]!.content.definitionText)
        return authoringConflict('AUTHORING_PROPOSAL_STALE', '提案基线与草稿当前定义不一致');
      const rows = await tx.$queryRaw<Proposal[]>(Prisma.sql`
        INSERT INTO "StrategyAuthoringProposal" (id, "draftId", "ownerId", revision, "operationId", payload)
        VALUES (${randomUUID()}::uuid, ${draftId}::uuid, ${ownerId}, ${payload.expectedRevision}, ${payload.operationId}::uuid, ${JSON.stringify(payload)}::jsonb) RETURNING *`);
      return rows[0]!;
    });
  }
  readProposal(owner: string, id: string) {
    const ownerId = requireAuthoringOwner(owner);
    z.uuid().parse(id);
    return this.database.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Proposal[]>(Prisma.sql`SELECT p.*,
        CASE WHEN p.status = 'pending' AND (d.state <> 'editing' OR d.revision <> p.revision) THEN 'expired' ELSE p.status END AS status
        FROM "StrategyAuthoringProposal" p JOIN "StrategyAuthoringDraft" d ON d.id = p."draftId" AND d."ownerId" = p."ownerId"
        WHERE p.id = ${id}::uuid AND p."ownerId" = ${ownerId}`);
      return rows[0] ?? authoringNotFound();
    });
  }
  discardProposal(owner: string, id: string, expectedRevision: number) {
    const ownerId = requireAuthoringOwner(owner);
    z.uuid().parse(id);
    z.number().int().positive().parse(expectedRevision);
    return this.database.$transaction(async (tx) => {
      const proposals = await tx.$queryRaw<Proposal[]>(
        Prisma.sql`SELECT * FROM "StrategyAuthoringProposal" WHERE id = ${id}::uuid AND "ownerId" = ${ownerId}`,
      );
      const proposal = proposals[0] ?? authoringNotFound();
      const draft = await lockOwnedAuthoringDraft(tx, ownerId, proposal.draftId);
      const fresh = await tx.$queryRaw<Proposal[]>(
        Prisma.sql`SELECT * FROM "StrategyAuthoringProposal" WHERE id=${id}::uuid AND "ownerId"=${ownerId}`,
      );
      if (fresh[0]!.status === 'discarded' && proposal.revision === expectedRevision) return;
      if (draft.state !== 'editing') return authoringConflict('AUTHORING_CLOSED', '草稿已结束');
      if (draft.revision !== expectedRevision)
        return authoringConflict(
          'AUTHORING_REVISION_CONFLICT',
          '草稿已更新，建议已过期',
          draft.revision,
        );
      const count =
        await tx.$executeRaw(Prisma.sql`UPDATE "StrategyAuthoringProposal" SET status = 'discarded', "updatedAt" = clock_timestamp()
        WHERE id = ${id}::uuid AND "ownerId" = ${ownerId} AND revision = ${expectedRevision} AND status = 'pending'`);
      if (count !== 1)
        return authoringConflict('AUTHORING_PROPOSAL_STALE', '提案已处理或修订已变化');
      await tx.$executeRaw(
        Prisma.sql`UPDATE "StrategyAuthoringOperation" SET disposition='stale', "updatedAt"=clock_timestamp() WHERE id=${proposal.operationId}::uuid AND "ownerId"=${ownerId} AND disposition='unapplied'`,
      );
    });
  }
  // T04 calls inside the same transaction after creating v1 and marking the draft saved.
  async recordSource(
    tx: AuthoringTransaction,
    owner: string,
    draftId: string,
    versionId: string,
    expectedRevision: number,
  ) {
    const ownerId = requireAuthoringOwner(owner);
    z.uuid().parse(draftId);
    z.uuid().parse(versionId);
    const draft = await lockOwnedAuthoringDraft(tx, ownerId, draftId);
    if (
      draft.state !== 'saved' ||
      draft.savedVersionId !== versionId ||
      draft.revision !== expectedRevision
    )
      return authoringConflict(
        'AUTHORING_REVISION_CONFLICT',
        '来源必须对应同事务保存的草稿和版本',
        draft.revision,
      );
    const revisions = await tx.$queryRaw<{ content: AuthoringContent }[]>(Prisma.sql`
      SELECT content FROM "StrategyAuthoringRevision" WHERE "draftId" = ${draftId}::uuid AND revision = ${expectedRevision} AND "ownerId" = ${ownerId}`);
    const content = revisions[0]!.content;
    const finalDefinition = authoringStrategySchema.parse(content.definitionText);
    const versions = await tx.$queryRaw<{ matches: boolean; schemaVersion: number }[]>(Prisma.sql`
      SELECT schema = ${JSON.stringify(finalDefinition)}::jsonb AS matches, "schemaVersion" FROM "StrategyVersion" WHERE id = ${versionId}::uuid`);
    const version = versions[0];
    if (!version || version.schemaVersion !== 2 || !version.matches)
      return authoringConflict('AUTHORING_REVISION_CONFLICT', '来源定义必须与正式版本定义一致');
    const operations = await tx.$queryRaw<
      { id: string; status: string; kind: string; disposition: string }[]
    >(Prisma.sql`
      SELECT id, status, disposition, input->'selection'->>'kind' AS kind FROM "StrategyAuthoringOperation"
      WHERE "draftId" = ${draftId}::uuid AND "ownerId" = ${ownerId} ORDER BY "createdAt", id`);
    if (
      !operations.some(
        (operation) =>
          operation.status === 'succeeded' &&
          operation.kind === 'generate' &&
          operation.disposition === 'applied',
      )
    )
      return authoringConflict(
        'AUTHORING_OPERATION_CONFLICT',
        'AI 辅助来源需要已明确应用的成功生成操作',
      );
    const snapshot = authoringSourceSnapshotSchema.parse({
      kind: 'ai_assisted',
      content,
      operationIds: operations.map((item) => item.id),
    });
    await tx.$executeRaw(Prisma.sql`INSERT INTO "StrategyAuthoringSource" ("versionId", "draftId", "ownerId", revision, snapshot)
      VALUES (${versionId}::uuid, ${draftId}::uuid, ${ownerId}, ${expectedRevision}, ${JSON.stringify(snapshot)}::jsonb) ON CONFLICT ("versionId") DO NOTHING`);
  }
  readSource(owner: string, versionId: string) {
    const ownerId = requireAuthoringOwner(owner);
    z.uuid().parse(versionId);
    return this.database.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Source[]>(
        Prisma.sql`SELECT * FROM "StrategyAuthoringSource" WHERE "versionId" = ${versionId}::uuid AND "ownerId" = ${ownerId}`,
      );
      return rows[0] ?? authoringNotFound();
    });
  }
}
