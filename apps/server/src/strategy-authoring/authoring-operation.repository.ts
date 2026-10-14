import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  AUTHORING_LIMITS,
  authoringOperationInputSchema,
  authoringOperationSnapshotSchema,
  authoringOperationFinishSchema,
  authoringQueuedCancellationSchema,
  authoringQueuedFailureSchema,
  type AuthoringContent,
  type AuthoringOperationInput,
  type AuthoringOperationFinish,
  type AuthoringQueuedCancellation,
  type AuthoringQueuedFailure,
} from '@thesis-ledger/schemas';
import {
  type AuthoringDatabase,
  type AuthoringTransaction,
  requireAuthoringOwner,
  lockAuthoringDraft,
  lockOwnedAuthoringDraft,
  authoringConflict,
  authoringNotFound,
} from './authoring-store.js';

export type AuthoringOperation = {
  id: string;
  draftId: string;
  ownerId: string;
  revision: number;
  idempotencyKey: string;
  fingerprint: string;
  input: { selection: AuthoringOperationInput; content: AuthoringContent };
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  attempt: number;
  leaseUntil: Date | null;
  startedAt: Date | null;
  cancelRequestedAt: Date | null;
  deliveryAttempts: number;
  outcome: AuthoringOperationFinish | AuthoringQueuedCancellation | AuthoringQueuedFailure | null;
  disposition: 'unapplied' | 'stale' | 'applied';
  createdAt: Date;
  updatedAt: Date;
};
export class AuthoringOperationRepository {
  constructor(private readonly database: AuthoringDatabase) {}
  submit(owner: string, draftId: string, input: unknown) {
    const ownerId = requireAuthoringOwner(owner);
    z.uuid().parse(draftId);
    const selection = authoringOperationInputSchema.parse(input);
    const fingerprint = createHash('sha256').update(JSON.stringify(selection)).digest('hex');
    return this.database.$transaction(async (tx) => {
      // Serialize submissions on the draft; retries return the same historical intent even after closure.
      const draft = await lockOwnedAuthoringDraft(tx, ownerId, draftId);
      const previous = await tx.$queryRaw<AuthoringOperation[]>(Prisma.sql`
        SELECT * FROM "StrategyAuthoringOperation" WHERE "draftId" = ${draftId}::uuid AND "ownerId" = ${ownerId} AND "idempotencyKey" = ${selection.idempotencyKey}`);
      if (previous[0]) {
        if (previous[0].fingerprint !== fingerprint)
          return authoringConflict(
            'AUTHORING_IDEMPOTENCY_CONFLICT',
            '同一提交意图不能携带不同输入',
          );
        return previous[0];
      }
      if (draft.state !== 'editing')
        return authoringConflict('AUTHORING_CLOSED', '草稿已结束，不能提交操作');
      if (draft.revision !== selection.expectedRevision)
        return authoringConflict(
          'AUTHORING_REVISION_CONFLICT',
          '操作必须绑定当前草稿修订',
          draft.revision,
        );
      const active = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id FROM "StrategyAuthoringOperation" WHERE "draftId" = ${draftId}::uuid AND status IN ('queued', 'running')`);
      if (active.length)
        return authoringConflict('AUTHORING_OPERATION_ACTIVE', '每个草稿最多一个活动付费操作');
      const revisions = await tx.$queryRaw<{ content: AuthoringContent }[]>(Prisma.sql`
        SELECT content FROM "StrategyAuthoringRevision" WHERE "draftId" = ${draftId}::uuid AND "ownerId" = ${ownerId} AND revision = ${draft.revision}`);
      const snapshot = JSON.stringify(
        authoringOperationSnapshotSchema.parse({ selection, content: revisions[0]!.content }),
      );
      const rows = await tx.$queryRaw<AuthoringOperation[]>(Prisma.sql`
        INSERT INTO "StrategyAuthoringOperation" (id, "draftId", "ownerId", revision, "idempotencyKey", fingerprint, input)
        VALUES (${randomUUID()}::uuid, ${draftId}::uuid, ${ownerId}, ${draft.revision}, ${selection.idempotencyKey}, ${fingerprint}, ${snapshot}::jsonb) RETURNING *`);
      return rows[0]!;
    });
  }
  read(owner: string, id: string) {
    const ownerId = requireAuthoringOwner(owner);
    z.uuid().parse(id);
    return this.database.$transaction((tx) => this.readIn(tx, ownerId, id));
  }
  findIntent(owner: string, draftId: string, idempotencyKey: string) {
    const ownerId = requireAuthoringOwner(owner);
    z.uuid().parse(draftId);
    z.string().min(1).max(120).parse(idempotencyKey);
    return this.database.$transaction(async (tx) => {
      await lockOwnedAuthoringDraft(tx, ownerId, draftId);
      const rows = await tx.$queryRaw<AuthoringOperation[]>(Prisma.sql`
        SELECT * FROM "StrategyAuthoringOperation" WHERE "draftId"=${draftId}::uuid AND "ownerId"=${ownerId} AND "idempotencyKey"=${idempotencyKey}`);
      return rows[0] ?? null;
    });
  }
  lookupForExecution(id: string) {
    z.uuid().parse(id);
    return this.database.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<AuthoringOperation[]>(
        Prisma.sql`SELECT * FROM "StrategyAuthoringOperation" WHERE id=${id}::uuid`,
      );
      return rows[0] ?? null;
    });
  }
  pending() {
    return this.database.$transaction((tx) =>
      tx.$queryRaw<AuthoringOperation[]>(Prisma.sql`
      SELECT * FROM "StrategyAuthoringOperation" WHERE status IN ('queued', 'running') ORDER BY "updatedAt", id LIMIT 50`),
    );
  }
  reserveRedelivery(owner: string, id: string) {
    const ownerId = requireAuthoringOwner(owner);
    z.uuid().parse(id);
    return this.database.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<AuthoringOperation[]>(Prisma.sql`
        UPDATE "StrategyAuthoringOperation" SET "deliveryAttempts"="deliveryAttempts"+1, "updatedAt"=clock_timestamp()
        WHERE id=${id}::uuid AND "ownerId"=${ownerId} AND status='queued' AND attempt=0
          AND "deliveryAttempts"<${AUTHORING_LIMITS.maxRedeliveries} RETURNING *`);
      return rows[0] ?? null;
    });
  }
  exhaustDelivery(owner: string, id: string) {
    const ownerId = requireAuthoringOwner(owner);
    z.uuid().parse(id);
    const outcome = authoringQueuedFailureSchema.parse({
      attempt: 0,
      status: 'failed',
      externalResult: 'not_sent',
      outputText: null,
      errorCode: 'AUTHORING_DELIVERY_EXHAUSTED',
      usage: null,
      cost: { status: 'unknown', amount: null, currency: null, source: null, pricingVersion: null },
    });
    return this.database.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<AuthoringOperation[]>(Prisma.sql`
        UPDATE "StrategyAuthoringOperation" SET status='failed', outcome=${JSON.stringify(outcome)}::jsonb, "updatedAt"=clock_timestamp()
        WHERE id=${id}::uuid AND "ownerId"=${ownerId} AND status='queued' AND attempt=0
          AND "deliveryAttempts">=${AUTHORING_LIMITS.maxRedeliveries} RETURNING *`);
      return rows[0] ?? null;
    });
  }
  claim(owner: string, id: string) {
    const ownerId = requireAuthoringOwner(owner);
    z.uuid().parse(id);
    return this.database.$transaction(async (tx) => {
      const operation = await this.readIn(tx, ownerId, id);
      await lockAuthoringDraft(tx, ownerId, operation.draftId, operation.revision);
      const rows = await tx.$queryRaw<AuthoringOperation[]>(Prisma.sql`
        UPDATE "StrategyAuthoringOperation" SET status = 'running', attempt = attempt + 1, "startedAt"=clock_timestamp(),
          "leaseUntil" = clock_timestamp() + ${AUTHORING_LIMITS.leaseMs} * interval '1 millisecond', "updatedAt" = clock_timestamp()
        WHERE id = ${id}::uuid AND "ownerId" = ${ownerId} AND status = 'queued' AND attempt = ${operation.attempt} RETURNING *`);
      return rows[0] ?? authoringConflict('AUTHORING_OPERATION_CONFLICT', '操作已领取或已结束');
    });
  }
  renew(owner: string, id: string, attempt: number) {
    const ownerId = requireAuthoringOwner(owner);
    z.uuid().parse(id);
    z.number().int().positive().parse(attempt);
    return this.database.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<AuthoringOperation[]>(Prisma.sql`
        UPDATE "StrategyAuthoringOperation" SET "leaseUntil"=LEAST(
          clock_timestamp() + ${AUTHORING_LIMITS.leaseMs} * interval '1 millisecond',
          "startedAt" + ${AUTHORING_LIMITS.deadlineMs} * interval '1 millisecond'), "updatedAt"=clock_timestamp()
        WHERE id=${id}::uuid AND "ownerId"=${ownerId} AND status='running' AND attempt=${attempt}
          AND "leaseUntil">clock_timestamp() AND "cancelRequestedAt" IS NULL
          AND "startedAt" + ${AUTHORING_LIMITS.deadlineMs} * interval '1 millisecond'>clock_timestamp()
        RETURNING *`);
      return rows[0] ?? null;
    });
  }
  cancel(owner: string, id: string) {
    const ownerId = requireAuthoringOwner(owner);
    z.uuid().parse(id);
    const queuedCancellation = authoringQueuedCancellationSchema.parse({
      attempt: 0,
      status: 'cancelled',
      externalResult: 'not_sent',
      outputText: null,
      errorCode: 'AUTHORING_CANCELLED',
      usage: null,
      cost: { status: 'unknown', amount: null, currency: null, source: null, pricingVersion: null },
    });
    return this.database.$transaction(async (tx) => {
      const operation = await this.readIn(tx, ownerId, id);
      const rows = await tx.$queryRaw<AuthoringOperation[]>(Prisma.sql`
        UPDATE "StrategyAuthoringOperation" SET status=CASE WHEN status='queued' THEN 'cancelled' ELSE status END,
          outcome=CASE WHEN status='queued' THEN ${JSON.stringify(queuedCancellation)}::jsonb ELSE outcome END,
          "cancelRequestedAt"=COALESCE("cancelRequestedAt", clock_timestamp()), "updatedAt"=clock_timestamp()
        WHERE id=${id}::uuid AND "ownerId"=${ownerId} AND status IN ('queued', 'running') AND attempt=${operation.attempt} RETURNING *`);
      return rows[0] ?? this.readIn(tx, ownerId, id);
    });
  }
  expire(owner: string, id: string, attempt: number) {
    const ownerId = requireAuthoringOwner(owner);
    z.uuid().parse(id);
    z.number().int().positive().parse(attempt);
    const outcome = authoringOperationFinishSchema.parse({
      attempt,
      status: 'failed',
      externalResult: 'unknown',
      outputText: null,
      errorCode: 'AUTHORING_RESULT_UNKNOWN',
      usage: null,
      cost: { status: 'unknown', amount: null, currency: null, source: null, pricingVersion: null },
    });
    return this.database.$transaction(async (tx) => {
      await this.readIn(tx, ownerId, id);
      const rows = await tx.$queryRaw<AuthoringOperation[]>(Prisma.sql`
        UPDATE "StrategyAuthoringOperation" SET status='failed', outcome=${JSON.stringify(outcome)}::jsonb,
          "leaseUntil"=NULL, "updatedAt"=clock_timestamp()
        WHERE id=${id}::uuid AND "ownerId"=${ownerId} AND status='running' AND attempt=${attempt}
          AND ("leaseUntil"<=clock_timestamp() OR
            "startedAt" + ${AUTHORING_LIMITS.deadlineMs} * interval '1 millisecond'<=clock_timestamp()) RETURNING *`);
      return rows[0] ?? null;
    });
  }
  finish(owner: string, id: string, input: unknown) {
    const ownerId = requireAuthoringOwner(owner);
    z.uuid().parse(id);
    const outcome = authoringOperationFinishSchema.parse(input);
    return this.database.$transaction(async (tx) => {
      const operation = await this.readIn(tx, ownerId, id);
      const draft = await lockOwnedAuthoringDraft(tx, ownerId, operation.draftId);
      const disposition =
        draft.state === 'editing' && draft.revision === operation.revision ? 'unapplied' : 'stale';
      const rows = await tx.$queryRaw<AuthoringOperation[]>(Prisma.sql`
        UPDATE "StrategyAuthoringOperation" SET status = ${outcome.status}, outcome = ${JSON.stringify(outcome)}::jsonb,
          disposition = ${disposition}, "leaseUntil" = NULL, "updatedAt" = clock_timestamp()
        WHERE id = ${id}::uuid AND "ownerId" = ${ownerId} AND status = 'running' AND attempt = ${outcome.attempt}
          AND "leaseUntil" > clock_timestamp()
          AND "startedAt" + ${AUTHORING_LIMITS.deadlineMs} * interval '1 millisecond'>clock_timestamp()
          AND ("cancelRequestedAt" IS NULL OR ${outcome.status}='cancelled') RETURNING *`);
      return (
        rows[0] ??
        authoringConflict(
          'AUTHORING_OPERATION_CONFLICT',
          '操作状态、attempt 或租约已变化，不能提交结果',
        )
      );
    });
  }
  private async readIn(tx: AuthoringTransaction, ownerId: string, id: string) {
    const rows = await tx.$queryRaw<AuthoringOperation[]>(Prisma.sql`
      SELECT * FROM "StrategyAuthoringOperation" WHERE id = ${id}::uuid AND "ownerId" = ${ownerId}`);
    return rows[0] ?? authoringNotFound();
  }
}
