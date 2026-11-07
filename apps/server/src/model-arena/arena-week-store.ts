import { createHash } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  arenaProtocolSchema,
  arenaWeekDetailSchema,
  arenaWeekSummarySchema,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { ArenaWeekProjector } from './arena-week-project.js';
import { arenaWeeks } from './arena-weeks.js';
import type { ArenaDelivery } from './arena-queue.js';

@Injectable()
export class ArenaWeekStore {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ArenaWeekProjector) private readonly projector: ArenaWeekProjector,
  ) {}
  async discover(now: Date) {
    let cursor: string | undefined;
    do {
      const arenas = await this.db.modelArena.findMany({
        where: { state: { not: 'draft' } },
        orderBy: { id: 'asc' },
        take: 100,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
        select: {
          id: true,
          protocol: true,
          startedAt: true,
          endedAt: true,
          occurrences: {
            select: { tradingDate: true, dueAt: true },
            orderBy: { tradingDate: 'asc' },
          },
        },
      });
      for (const a of arenas) {
        const started = a.startedAt ?? a.occurrences[0]?.dueAt;
        if (!started) continue;
        const jobs = arenaWeeks(
          arenaProtocolSchema.parse(a.protocol),
          started,
          a.endedAt,
          a.occurrences,
          now,
        );
        if (jobs.length)
          await this.db.arenaWeek.createMany({
            data: jobs.map((j) => ({ ...j, arenaId: a.id })),
            skipDuplicates: true,
          });
      }
      cursor = arenas.length === 100 ? arenas.at(-1)!.id : undefined;
    } while (cursor);
  }
  async execute({ id, attempt }: ArenaDelivery) {
    const now = new Date();
    const claim = await this.db.arenaWeek.updateMany({
      where: { id, state: 'scheduled', attempt: attempt - 1, cutoff: { lte: now } },
      data: {
        state: 'running',
        attempt,
        reason: null,
        leaseUntil: new Date(now.getTime() + 120000),
      },
    });
    if (!claim.count) return;
    try {
      const row = await this.db.arenaWeek.findUniqueOrThrow({
        where: { id },
        include: { arena: true },
      });
      const report = await this.projector.build(row, row.arena.ownerId, row.arena.protocol);
      const digest = createHash('sha256').update(JSON.stringify(report)).digest('hex');
      await this.db.$transaction(async (tx) => {
        const published = await tx.arenaWeek.updateMany({
          where: { id, state: 'running', attempt, leaseUntil: { gt: new Date() } },
          data: { state: 'published', leaseUntil: null },
        });
        if (!published.count) return;
        const existing = await tx.arenaWeekRevision.findUnique({
          where: { weekId_digest: { weekId: id, digest } },
        });
        if (existing) return;
        const last = await tx.arenaWeekRevision.findFirst({
          where: { weekId: id },
          orderBy: { revision: 'desc' },
        });
        await tx.arenaWeekRevision.create({
          data: { weekId: id, digest, revision: (last?.revision ?? 0) + 1, report },
        });
      });
    } catch {
      await this.retry(id, attempt, 'projection_failed');
    }
  }
  async retry(id: string, attempt: number, reason: string) {
    const job = await this.db.arenaWeek.findUniqueOrThrow({
      where: { id },
      select: { attemptBase: true },
    });
    return this.db.arenaWeek.updateMany({
      where: { id, state: 'running', attempt },
      data: {
        state: attempt >= job.attemptBase + 3 ? 'failed' : 'scheduled',
        leaseUntil: null,
        reason,
      },
    });
  }
  async list(owner: string, arenaId?: string) {
    if (
      arenaId &&
      !(await this.db.modelArena.findFirst({
        where: { id: arenaId, ownerId: owner },
        select: { id: true },
      }))
    )
      throw new NotFoundException('比赛不存在');
    const rows = await this.db.arenaWeekRevision.findMany({
      where: { week: { ...(arenaId ? { arenaId } : {}), arena: { ownerId: owner } } },
      include: { week: { include: { arena: { select: { protocol: true } } } } },
      orderBy: [{ week: { week: 'desc' } }, { revision: 'desc' }, { id: 'asc' }],
    });
    return rows.map((r) =>
      arenaWeekSummarySchema.parse({
        id: r.id,
        arenaId: r.week.arenaId,
        title: arenaProtocolSchema.parse(r.week.arena.protocol).title,
        week: r.week.week,
        revision: r.revision,
        publishedAt: r.publishedAt.toISOString(),
      }),
    );
  }
  async read(owner: string, arenaId: string, id: string) {
    const r = await this.db.arenaWeekRevision.findFirst({
      where: { id, week: { arenaId, arena: { ownerId: owner } } },
      include: { week: { include: { arena: { select: { protocol: true } } } } },
    });
    if (!r) throw new NotFoundException('周报不存在');
    return arenaWeekDetailSchema.parse({
      id,
      arenaId,
      title: arenaProtocolSchema.parse(r.week.arena.protocol).title,
      week: r.week.week,
      revision: r.revision,
      publishedAt: r.publishedAt.toISOString(),
      digest: r.digest,
      report: r.report,
    });
  }
  async revise(owner: string, arenaId: string, id: string) {
    const prior = await this.db.arenaWeekRevision.findFirst({
      where: { id, week: { arenaId, arena: { ownerId: owner } } },
      select: { weekId: true, week: { select: { attempt: true } } },
    });
    if (!prior) throw new NotFoundException('周报不存在');
    // attempt 单调递增，确保新作业有独立投递身份。
    await this.db.arenaWeek.updateMany({
      where: { id: prior.weekId, state: 'published', attempt: prior.week.attempt },
      data: { state: 'scheduled', attemptBase: prior.week.attempt, reason: 'revision_requested' },
    });
    return { id };
  }
}
