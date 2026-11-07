import {
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { arenaBookSchema, arenaProtocolSchema } from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { MarketOpenEvidence } from '../market/market-open-evidence.js';
import { ArenaExecutionStore } from './arena-execution-store.js';
import { lockArena } from './model-arena.repository.js';
import type { OpeningFact } from './arena-open-execution.js';

type Packet = { facts: OpeningFact[]; missing: Record<string, string> };
@Injectable()
export class ArenaExecutionRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ArenaExecutionRunner.name);
  private timer?: ReturnType<typeof setInterval>;
  private active: Promise<void> | undefined;
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(MarketOpenEvidence) private readonly market: MarketOpenEvidence,
    @Inject(ArenaExecutionStore) private readonly execution: ArenaExecutionStore,
  ) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(
      () => void this.run().catch(() => this.logger.warn('模拟成交等待下次恢复')),
      15000,
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
    const pending = { executionAt: null, decisionState: { in: ['decision', 'observe'] } };
    const rounds = await this.db.arenaRound.findMany({
      where: {
        arena: { state: 'running' },
        OR: [
          { openingFacts: { equals: Prisma.DbNull } },
          { outcome: { path: ['state'], equals: 'sealed' }, reservations: { some: pending } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: { arena: true, reservations: { where: pending } },
    });
    for (const round of rounds) {
      const slot = await this.db.arenaOccurrence.findUnique({
        where: { arenaId_tradingDate: { arenaId: round.arenaId, tradingDate: round.tradingDate } },
      });
      if (!slot || slot.nextOpenAt.getTime() > Date.now()) continue;
      const p = arenaProtocolSchema.parse(round.arena.protocol);
      const books = round.reservations.map((r) => arenaBookSchema.parse(r.privateBook));
      let packet = round.openingFacts as Packet | null;
      if (!packet) {
        const gathered: Packet = { facts: [], missing: {} };
        const now = new Date();
        for (const instrument of p.instruments) {
          const held = Prisma.Decimal.max(
            0,
            ...books.flatMap((b) =>
              b.positions.filter((s) => s.symbol === instrument.symbol).map((s) => s.quantity),
            ),
          ).toFixed();
          try {
            const result = await this.market.read({
              ...instrument,
              market: p.market,
              currency: p.currency,
              timeZone: p.timeZone,
              held,
              previousDay: round.tradingDate,
              now,
              openAt: slot.nextOpenAt,
            });
            if (result.status === 'available') gathered.facts.push(result.fact);
            else gathered.missing[instrument.symbol] = result.reason;
          } catch {
            gathered.missing[instrument.symbol] = 'opening_source_unavailable';
          }
        }
        packet = await this.db.$transaction(async (tx) => {
          const a = await lockArena(tx, round.arenaId, round.arena.ownerId);
          const current = await tx.arenaRound.findUniqueOrThrow({ where: { id: round.id } });
          if (current.openingFacts) return current.openingFacts as Packet;
          if (a.state !== 'running') return null;
          await tx.arenaRound.update({ where: { id: round.id }, data: { openingFacts: gathered } });
          return gathered;
        });
      }
      if (packet && (round.outcome as { state: string }).state === 'sealed')
        for (const r of round.reservations)
          await this.execution.apply(r.id, slot.nextOpenAt, packet.facts, packet.missing);
    }
  }
}
