import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { WatchlistRepository } from '../../src/watchlist/watchlist.repository.js';

const url = process.env.JOURNAL_REVIEW_DATABASE_URL;
if (
  url &&
  (new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/journal_review_fixture')
)
  throw new Error('需要隔离数据库');
const db = new PrismaService({ datasourceUrl: url ?? 'postgresql://fixture@127.0.0.1:1/unused' });
const repo = new WatchlistRepository(db);
afterAll(() => db.$disconnect());

it.skipIf(!url)('并发添加幂等；修订只成功一次，数据库也拒绝跨身份分组', async () => {
  const [owner, other, instrumentId] = [randomUUID(), randomUUID(), randomUUID()] as const;
  await db.instrument.create({
    data: {
      id: instrumentId,
      canonicalCode: '000001',
      market: 'SZ',
      instrumentType: 'STOCK',
      displayName: '测试标的',
      generation: 1,
    },
  });
  const [a, b] = await Promise.all([repo.add(owner, instrumentId), repo.add(owner, instrumentId)]);
  expect(a.revision).toBe(1);
  expect(b.revision).toBe(1);
  const edits = await Promise.allSettled(
    ['甲', '乙'].map((name) => repo.change(owner, { action: 'createGroup', revision: 1, name })),
  );
  expect(edits.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  await repo.change(other, { action: 'createGroup', revision: 0, name: '私有' });
  const group = await db.watchlistGroup.findFirstOrThrow({ where: { ownerId: other } });
  const item = await db.watchlistItem.findFirstOrThrow({ where: { ownerId: owner } });
  await expect(
    db.watchlistItem.update({ where: { id: item.id }, data: { groupId: group.id } }),
  ).rejects.toMatchObject({ code: 'P2003' });
  await expect(
    repo.change(other, { action: 'remove', revision: 1, itemId: item.id }),
  ).rejects.toThrow();
  const ownGroup = await db.watchlistGroup.findFirstOrThrow({ where: { ownerId: owner } });
  await repo.change(owner, {
    action: 'place',
    revision: 2,
    itemId: item.id,
    groupId: ownGroup.id,
    pinned: true,
    beforeId: null,
  });
  await repo.change(owner, { action: 'deleteGroup', revision: 3, groupId: ownGroup.id });
  expect(await db.watchlistItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({
    groupId: null,
    pinned: true,
  });
  await repo.change(owner, { action: 'remove', revision: 4, itemId: item.id });
  expect(await db.watchlistItem.count({ where: { ownerId: owner } })).toBe(0);
});

it.skipIf(!url)('同修订并发排序时只有一方成功，置顶分区顺序重读一致', async () => {
  const owner = randomUUID();
  const items = [];
  for (const code of ['666001', '666002', '666003']) {
    const instrument = await db.instrument.create({
      data: {
        canonicalCode: code,
        market: 'SH',
        instrumentType: 'STOCK',
        displayName: code,
        generation: 1,
      },
    });
    await repo.add(owner, instrument.id);
    items.push(
      await db.watchlistItem.findFirstOrThrow({
        where: { ownerId: owner, instrumentId: instrument.id },
      }),
    );
  }
  const moves = await Promise.allSettled(
    [items[0]!, items[1]!].map((i) =>
      repo.change(owner, {
        action: 'place',
        itemId: i.id,
        pinned: true,
        groupId: null,
        beforeId: null,
        revision: 3,
      }),
    ),
  );
  expect(moves.filter((m) => m.status === 'fulfilled')).toHaveLength(1);
  const first = await db.watchlistItem.findFirstOrThrow({
    where: { ownerId: owner, pinned: true },
  });
  await repo.change(owner, {
    action: 'place',
    itemId: items[2]!.id,
    pinned: true,
    groupId: null,
    beforeId: first.id,
    revision: 4,
  });
  const read = () =>
    db.watchlistItem.findMany({
      where: { ownerId: owner },
      orderBy: [{ pinned: 'desc' }, { order: 'asc' }, { id: 'asc' }],
    });
  expect((await read()).map((i) => i.id).slice(0, 2)).toEqual([items[2]!.id, first.id]);
  expect(await read()).toEqual(await read());
});
