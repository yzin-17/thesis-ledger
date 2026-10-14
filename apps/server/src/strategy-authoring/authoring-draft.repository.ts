import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { invalidateAuthoringConfirmations } from './authoring-semantics.js';
import {
  authoringContentSchema,
  authoringUpdateSchema,
  authoringDefinitionCheck,
  type AuthoringContent,
} from '@thesis-ledger/schemas';
import {
  type AuthoringDatabase,
  type AuthoringTransaction,
  type AuthoringHeader,
  authoringNotFound,
  requireAuthoringOwner,
  lockAuthoringDraft,
} from './authoring-store.js';

export type AuthoringDraft = AuthoringHeader & {
  content: AuthoringContent;
  validation: ReturnType<typeof authoringDefinitionCheck>;
};
export class AuthoringDraftRepository {
  constructor(private readonly database: AuthoringDatabase) {}
  async create(owner: string, input: unknown) {
    const ownerId = requireAuthoringOwner(owner);
    const content = authoringContentSchema.parse(input);
    const id = randomUUID();
    return this.database.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`INSERT INTO "StrategyAuthoringDraft" (id, "ownerId", revision, title)
        VALUES (${id}::uuid, ${ownerId}, 1, ${content.title})`);
      await this.insertRevision(tx, ownerId, id, 1, content);
      return this.readIn(tx, ownerId, id);
    });
  }
  read(owner: string, id: string) {
    z.uuid().parse(id);
    const ownerId = requireAuthoringOwner(owner);
    return this.database.$transaction((tx) => this.readIn(tx, ownerId, id));
  }
  list(owner: string, input: { limit?: number; before?: { updatedAt: string; id: string } } = {}) {
    const ownerId = requireAuthoringOwner(owner);
    const limit = z
      .number()
      .int()
      .min(1)
      .max(50)
      .parse(input.limit ?? 20);
    const before = input.before;
    if (before) {
      z.iso.datetime().parse(before.updatedAt);
      z.uuid().parse(before.id);
    }
    return this.database.$transaction(async (tx) => {
      const cursor = before
        ? Prisma.sql`AND ("updatedAt", id) < (${before.updatedAt}::timestamptz, ${before.id}::uuid)`
        : Prisma.empty;
      const rows = await tx.$queryRaw<
        Array<AuthoringHeader & { cursorUpdatedAt: string }>
      >(Prisma.sql`
        SELECT *, to_char("updatedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorUpdatedAt"
        FROM "StrategyAuthoringDraft" WHERE "ownerId" = ${ownerId} ${cursor}
        ORDER BY "updatedAt" DESC, id DESC LIMIT ${limit + 1}`);
      const selected = rows.slice(0, limit);
      const items = selected.map(({ cursorUpdatedAt, ...item }) => {
        z.iso.datetime().parse(cursorUpdatedAt);
        return item;
      });
      const last = selected.at(-1);
      return {
        items,
        nextCursor:
          rows.length > limit && last ? { updatedAt: last.cursorUpdatedAt, id: last.id } : null,
      };
    });
  }
  update(owner: string, id: string, input: unknown) {
    z.uuid().parse(id);
    const ownerId = requireAuthoringOwner(owner);
    const parsed = authoringUpdateSchema.parse(input);
    return this.database.$transaction((tx) => this.updateInTransaction(tx, ownerId, id, parsed));
  }
  async updateInTransaction(
    tx: AuthoringTransaction,
    owner: string,
    id: string,
    input: unknown,
    confirmedDefinition = false,
  ) {
    const ownerId = requireAuthoringOwner(owner);
    z.uuid().parse(id);
    const parsed = authoringUpdateSchema.parse(input);
    const draft = await lockAuthoringDraft(tx, ownerId, id, parsed.expectedRevision);
    const next = draft.revision + 1;
    const previous = await this.readIn(tx, ownerId, id);
    const content = invalidateAuthoringConfirmations(
      previous.content,
      parsed.content,
      confirmedDefinition,
    );
    await tx.$executeRaw(Prisma.sql`UPDATE "StrategyAuthoringDraft" SET revision = ${next}, title = ${parsed.content.title}, "updatedAt" = clock_timestamp()
        WHERE id = ${id}::uuid AND "ownerId" = ${ownerId} AND state = 'editing' AND revision = ${draft.revision}`);
    await this.insertRevision(tx, ownerId, id, next, content);
    return this.readIn(tx, ownerId, id);
  }
  discard(owner: string, id: string, expectedRevision: number) {
    z.uuid().parse(id);
    z.number().int().positive().parse(expectedRevision);
    const ownerId = requireAuthoringOwner(owner);
    return this.database.$transaction(async (tx) => {
      await lockAuthoringDraft(tx, ownerId, id, expectedRevision);
      await tx.$executeRaw(Prisma.sql`UPDATE "StrategyAuthoringDraft" SET state = 'discarded', "updatedAt" = clock_timestamp()
        WHERE id = ${id}::uuid AND "ownerId" = ${ownerId} AND revision = ${expectedRevision} AND state = 'editing'`);
      return this.readIn(tx, ownerId, id);
    });
  }
  private async insertRevision(
    tx: AuthoringTransaction,
    ownerId: string,
    id: string,
    revision: number,
    content: AuthoringContent,
  ) {
    const validation = authoringDefinitionCheck(content.definitionText);
    await tx.$executeRaw(Prisma.sql`INSERT INTO "StrategyAuthoringRevision" ("draftId", "ownerId", revision, content, validation)
      VALUES (${id}::uuid, ${ownerId}, ${revision}, ${JSON.stringify(content)}::jsonb, ${JSON.stringify(validation)}::jsonb)`);
  }
  private async readIn(tx: AuthoringTransaction, ownerId: string, id: string) {
    const rows = await tx.$queryRaw<AuthoringDraft[]>(Prisma.sql`
      SELECT d.*, r.content, r.validation FROM "StrategyAuthoringDraft" d
      JOIN "StrategyAuthoringRevision" r ON r."draftId" = d.id AND r.revision = d.revision AND r."ownerId" = d."ownerId"
      WHERE d.id = ${id}::uuid AND d."ownerId" = ${ownerId}`);
    return rows[0] ?? authoringNotFound();
  }
}
