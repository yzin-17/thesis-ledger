import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { authoringOwnerSchema } from '@thesis-ledger/schemas';
import type { authoringErrorCodeSchema } from '@thesis-ledger/schemas';
import type { z } from 'zod';

export type AuthoringDatabase = Pick<PrismaClient, '$transaction'>;
export type AuthoringTransaction = Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'>;
export type AuthoringHeader = {
  id: string;
  ownerId: string;
  state: 'editing' | 'saved' | 'discarded';
  revision: number;
  title: string;
  savedVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};
export const authoringConflict = (
  code: z.infer<typeof authoringErrorCodeSchema>,
  message: string,
  currentRevision?: number,
): never => {
  throw new ConflictException({
    code,
    message,
    ...(currentRevision === undefined ? {} : { currentRevision }),
  });
};
export const authoringNotFound = (): never => {
  throw new NotFoundException({ code: 'AUTHORING_NOT_FOUND', message: '编写记录不存在或不可访问' });
};
export const requireAuthoringOwner = (owner: string) => authoringOwnerSchema.parse(owner);

// Owner must originate from a trusted identity adapter, never from request body/header.
export async function lockOwnedAuthoringDraft(tx: AuthoringTransaction, owner: string, id: string) {
  const ownerId = requireAuthoringOwner(owner);
  const rows = await tx.$queryRaw<AuthoringHeader[]>(Prisma.sql`
    SELECT * FROM "StrategyAuthoringDraft" WHERE id = ${id}::uuid AND "ownerId" = ${ownerId} FOR UPDATE`);
  const draft = rows[0];
  if (!draft) return authoringNotFound();
  return draft;
}
export async function lockAuthoringDraft(
  tx: AuthoringTransaction,
  owner: string,
  id: string,
  expectedRevision?: number,
) {
  const draft = await lockOwnedAuthoringDraft(tx, owner, id);
  if (draft.state !== 'editing')
    return authoringConflict(
      'AUTHORING_CLOSED',
      '草稿已保存或已丢弃，不能继续写入',
      draft.revision,
    );
  if (expectedRevision !== undefined && draft.revision !== expectedRevision)
    return authoringConflict(
      'AUTHORING_REVISION_CONFLICT',
      '草稿已更新，请保留本地内容并重新读取',
      draft.revision,
    );
  return draft;
}
