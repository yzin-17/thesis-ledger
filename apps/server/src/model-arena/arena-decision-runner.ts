import {
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../platform/prisma.service.js';
import { ArenaResearchPackets } from './arena-research-packets.js';
import { ArenaModelDecisions } from './arena-model-decisions.js';
import { lockArena } from './model-arena.repository.js';
import { settleReservation } from './arena-settlement.js';

@Injectable()
export class ArenaDecisionRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ArenaDecisionRunner.name);
  private timer?: ReturnType<typeof setInterval>;
  private active: Promise<void> | undefined;
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ArenaResearchPackets) private readonly packets: ArenaResearchPackets,
    @Inject(ArenaModelDecisions) private readonly decisions: ArenaModelDecisions,
  ) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(
      () => void this.run().catch(() => this.logger.warn('竞技场决策等待下次恢复')),
      10000,
    );
    this.timer.unref();
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.active;
  }
  run() {
    return (this.active ??= this.poll().finally(() => {
      this.active = undefined;
    }));
  }
  private async poll() {
    const unopened = await this.db.arenaRound.findMany({
      where: { outcome: { path: ['state'], equals: 'unopened' }, packet: null },
      orderBy: { createdAt: 'asc' },
      take: 20,
      select: { id: true },
    });
    for (const r of unopened) {
      try {
        await this.packets.freeze(r.id);
      } catch {
        this.logger.warn('预算未开轮的收盘估值待重试');
      }
    }
    const rounds = await this.db.arenaRound.findMany({
      where: { outcome: { path: ['state'], equals: 'open' } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 20,
      select: {
        id: true,
        arenaId: true,
        tradingDate: true,
        arena: { select: { ownerId: true, state: true } },
      },
    });
    for (const round of rounds) {
      const occurrence = await this.db.arenaOccurrence.findUnique({
        where: { arenaId_tradingDate: { arenaId: round.arenaId, tradingDate: round.tradingDate } },
      });
      if (!occurrence) continue;
      if (occurrence.deadlineAt.getTime() > Date.now() && round.arena.state === 'running') {
        try {
          await this.packets.freeze(round.id);
          const ready = await this.db.arenaReservation.findMany({
            where: { roundId: round.id, decisionState: 'ready' },
            select: { id: true },
          });
          await Promise.all(ready.map((r) => this.decisions.execute(r.id)));
        } catch {
          this.logger.warn('本轮研究输入或执行暂不可用');
        }
      }
      await this.db.$transaction(async (tx) => {
        const arena = await lockArena(tx, round.arenaId, round.arena.ownerId);
        const expired = occurrence.deadlineAt.getTime() <= Date.now();
        if (expired || arena.state !== 'running') {
          const unfinished = await tx.arenaReservation.findMany({
            where: { roundId: round.id, settledAt: null },
          });
          for (const r of unfinished) {
            const sent = r.requestId !== null;
            let state = 'cancelled';
            if (sent) state = 'unknown_usage';
            else if (expired) state = 'timeout';
            await tx.arenaReservation.update({
              where: { id: r.id },
              data: { decisionState: state },
            });
            await settleReservation(
              tx,
              r.id,
              sent ? null : { requests: 0, tokens: 0, costMicros: 0 },
            );
          }
        }
        if (
          (await tx.arenaReservation.count({ where: { roundId: round.id, settledAt: null } })) === 0
        )
          await tx.arenaRound.update({
            where: { id: round.id },
            data: { outcome: { state: 'sealed' } },
          });
      });
    }
  }
}
