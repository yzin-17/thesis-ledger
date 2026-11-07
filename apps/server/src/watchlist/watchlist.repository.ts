import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { watchlistInstrumentSchema, type WatchlistChange } from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';

type Tx = Prisma.TransactionClient;
export const identitySelection = {
  id: true,
  canonicalCode: true,
  instrumentType: true,
  market: true,
  active: true,
} as const;
const missing = () => new NotFoundException('自选条目或分组不存在');
const bump = (tx: Tx, ownerId: string) =>
  tx.watchlist.update({
    where: { ownerId },
    data: { revision: { increment: 1 } },
    select: { revision: true },
  });

// 同一身份的修改先锁名单行。重复添加、修订检查和成员变更共享同一提交边界。
async function lock(tx: Tx, ownerId: string) {
  await tx.$executeRaw`INSERT INTO "Watchlist" ("ownerId") VALUES (${ownerId}::uuid) ON CONFLICT DO NOTHING`;
  const [row] = await tx.$queryRaw<
    { revision: number }[]
  >`SELECT revision FROM "Watchlist" WHERE "ownerId" = ${ownerId}::uuid FOR UPDATE`;
  return row!.revision;
}
async function requireGroup(tx: Tx, ownerId: string, id: string) {
  if (!(await tx.watchlistGroup.findUnique({ where: { ownerId_id: { ownerId, id } } })))
    throw missing();
}

async function place(
  tx: Tx,
  ownerId: string,
  input: Extract<WatchlistChange, { action: 'place' }>,
) {
  const { itemId, groupId, pinned, beforeId } = input;
  if (!(await tx.watchlistItem.findFirst({ where: { ownerId, id: itemId } }))) throw missing();
  if (groupId) await requireGroup(tx, ownerId, groupId);
  const peers = await tx.watchlistItem.findMany({
    where: { ownerId, groupId, pinned, id: { not: itemId } },
    select: { id: true },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  });
  const index = beforeId === null ? peers.length : peers.findIndex((row) => row.id === beforeId);
  if (index < 0) throw new BadRequestException('排序目标不属于该分组或置顶区域');
  peers.splice(index, 0, { id: itemId });
  const ids = peers.map((row) => row.id);
  await tx.$executeRaw`UPDATE "WatchlistItem" AS w SET "groupId" = ${groupId}::uuid, pinned = ${pinned},
    "order" = (v.pos - 1)::int FROM unnest(ARRAY[${Prisma.join(ids)}]::uuid[]) WITH ORDINALITY AS v(id, pos)
    WHERE w.id = v.id AND w."ownerId" = ${ownerId}::uuid`;
}

@Injectable()
export class WatchlistRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  add(ownerId: string, instrumentId: string, groupId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const revision = await lock(tx, ownerId);
      if (
        await tx.watchlistItem.findUnique({
          where: { ownerId_instrumentId: { ownerId, instrumentId } },
        })
      )
        return { revision };
      const instrument = await tx.instrument.findUnique({
        where: { id: instrumentId },
        select: identitySelection,
      });
      if (!instrument?.active || !watchlistInstrumentSchema.safeParse(instrument).success)
        throw new BadRequestException('目录标的不符合自选条件');
      if (groupId) await requireGroup(tx, ownerId, groupId);
      const group = groupId ?? null;
      const last = await tx.watchlistItem.aggregate({
        where: { ownerId, groupId: group, pinned: false },
        _max: { order: true },
      });
      await tx.watchlistItem.create({
        data: { ownerId, instrumentId, groupId: group, order: (last._max.order ?? -1) + 1 },
      });
      return bump(tx, ownerId);
    });
  }

  change(ownerId: string, input: WatchlistChange) {
    return this.prisma.$transaction(async (tx) => {
      const currentRevision = await lock(tx, ownerId);
      if (currentRevision !== input.revision)
        throw new ConflictException({
          code: 'WATCHLIST_REVISION_CONFLICT',
          currentRevision,
          message: '自选已在其他页面更新，请刷新后重试',
        });
      if (input.action === 'createGroup')
        await tx.watchlistGroup.create({ data: { ownerId, name: input.name } });
      else if (input.action === 'remove') {
        if (!(await tx.watchlistItem.deleteMany({ where: { ownerId, id: input.itemId } })).count)
          throw missing();
      } else if (input.action === 'place') await place(tx, ownerId, input);
      else {
        await requireGroup(tx, ownerId, input.groupId);
        const where = { ownerId_id: { ownerId, id: input.groupId } };
        if (input.action === 'renameGroup')
          await tx.watchlistGroup.update({ where, data: { name: input.name } });
        else {
          await tx.watchlistItem.updateMany({
            where: { ownerId, groupId: input.groupId },
            data: { groupId: null },
          });
          await tx.watchlistGroup.delete({ where });
        }
      }
      return bump(tx, ownerId);
    });
  }
}
