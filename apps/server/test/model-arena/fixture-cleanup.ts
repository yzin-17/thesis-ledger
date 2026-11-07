import type { PrismaService } from '../../src/platform/prisma.service.js';
// 后台轮询扫描整个隔离库，每个用例退出前释放本用例的比赛。
export async function releaseArenaFixture(db: PrismaService, ownerId: string) {
  const url = new URL(process.env.JOURNAL_REVIEW_DATABASE_URL ?? 'about:blank');
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/journal_review_fixture')
    throw Error('需要隔离数据库');
  const arena = { ownerId },
    round = { arena },
    reservation = { round };
  await db.$transaction([
    db.arenaWeekRevision.deleteMany({ where: { week: { arena } } }),
    db.arenaWeek.deleteMany({ where: { arena } }),
    db.arenaFill.deleteMany({ where: { reservation } }),
    db.arenaReservation.deleteMany({ where: { round } }),
    db.arenaResearchPacket.deleteMany({ where: { round } }),
    db.arenaRound.deleteMany({ where: { arena } }),
    db.arenaOccurrence.deleteMany({ where: { arena } }),
    db.arenaEntrant.deleteMany({ where: { arena } }),
    db.modelArena.deleteMany({ where: { ownerId } }),
  ]);
}
