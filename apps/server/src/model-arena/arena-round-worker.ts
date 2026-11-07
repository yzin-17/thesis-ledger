import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ArenaQueue, type ArenaDelivery } from './arena-queue.js';
import { Prisma } from '@prisma/client';
import { arenaProtocolSchema } from '@thesis-ledger/schemas';
import { AiProviderRegistry } from '../ai/provider-registry.js';
import { MarketInstrumentEvidence } from '../market/market-instrument-evidence.js';
import { PrismaService } from '../platform/prisma.service.js';
import { RedisService } from '../platform/redis.service.js';
import { ArenaRoundAdmission } from './arena-round-admission.js';

@Injectable()
export class ArenaRoundWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ArenaRoundWorker.name);
  private queue?: ArenaQueue;
  private timer?: ReturnType<typeof setInterval>;
  private reconciling = false;
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(ArenaRoundAdmission) private readonly admission: ArenaRoundAdmission,
    @Inject(AiProviderRegistry) private readonly providers: AiProviderRegistry,
    @Inject(MarketInstrumentEvidence) private readonly evidence: MarketInstrumentEvidence,
  ) {}
  onModuleInit() {
    if (process.env.NODE_ENV !== 'test') this.start();
  }
  start() {
    if (this.queue) return;
    const error = () => this.logger.warn('竞技场队列暂不可用，待执行轮次保存在数据库中');
    this.queue = new ArenaQueue(this.redis, (job) => this.execute(job), error);
    const poll = () => void this.reconcile().catch(error);
    this.timer = setInterval(poll, 15000);
    this.timer.unref();
    poll();
  }
  async reconcile(now = new Date()) {
    if (this.reconciling || !this.queue) return;
    this.reconciling = true;
    try {
      await this.db.arenaOccurrence.updateMany({
        where: { state: { in: ['scheduled', 'running'] }, deadlineAt: { lte: now } },
        data: { state: 'expired', reason: 'deadline', leaseUntil: null },
      });
      const expired = await this.db.arenaOccurrence.findMany({
        where: { state: 'running', leaseUntil: { lte: now } },
        take: 100,
      });
      for (const row of expired)
        await this.release(row.id, row.attempt, row.maxAttempts, 'lease_expired');
      const due = await this.db.arenaOccurrence.findMany({
        where: {
          state: 'scheduled',
          arena: { state: 'running' },
          dueAt: { lte: now },
          deadlineAt: { gt: now },
        },
        orderBy: { dueAt: 'asc' },
        take: 100,
        select: { id: true, attempt: true, maxAttempts: true },
      });
      for (const row of due) {
        const attempt = row.attempt + 1;
        if ((await this.queue.ensure(row, attempt)) === 'terminal') {
          await this.db.arenaOccurrence.updateMany({
            where: { id: row.id, state: 'scheduled', attempt: row.attempt },
            data: {
              attempt,
              state: attempt >= row.maxAttempts ? 'failed' : 'scheduled',
              reason: 'delivery_ended_before_claim',
            },
          });
        }
      }
    } finally {
      this.reconciling = false;
    }
  }
  private async release(id: string, attempt: number, limit: number, reason: string) {
    await this.db.arenaOccurrence.updateMany({
      where: { id, state: 'running', attempt },
      data: { state: attempt >= limit ? 'failed' : 'scheduled', reason, leaseUntil: null },
    });
  }
  async execute({ id, attempt }: ArenaDelivery) {
    const now = new Date();
    const claim = await this.db.arenaOccurrence.updateMany({
      where: {
        id,
        attempt: attempt - 1,
        state: 'scheduled',
        dueAt: { lte: now },
        deadlineAt: { gt: now },
        arena: { state: 'running' },
      },
      data: {
        state: 'running',
        attempt,
        reason: null,
        leaseUntil: new Date(now.getTime() + 60000),
      },
    });
    if (!claim.count) return;
    const row = await this.db.arenaOccurrence.findUniqueOrThrow({
      where: { id },
      include: { arena: { include: { entrants: true } } },
    });
    try {
      const protocol = arenaProtocolSchema.parse(row.arena.protocol);
      const prices = new Map<string, { currency: string; maxCostMicros: number }>();
      for (const entrant of row.arena.entrants) {
        const caps = protocol.entrants.find(
          (e) => e.model === entrant.model && e.providerId === entrant.providerId,
        );
        if (!caps) continue;
        try {
          const provider = this.providers.strict(entrant.providerId, entrant.model);
          const price = provider.metadata?.modelPricing?.[entrant.model];
          if (price?.costPer1kInput == null || price.costPer1kOutput == null || !price.costCurrency)
            continue;
          const cost = new Prisma.Decimal(price.costPer1kInput)
            .times(caps.maxInputTokens)
            .plus(new Prisma.Decimal(price.costPer1kOutput).times(caps.maxOutputTokens))
            .times(1000)
            .ceil();
          prices.set(entrant.id, { currency: price.costCurrency, maxCostMicros: cost.toNumber() });
        } catch {
          continue;
        }
      }
      await this.evidence.prepare(protocol, row.tradingDate);
      const prior = await this.db.arenaOccurrence.findFirst({
        where: { arenaId: row.arenaId, tradingDate: { lt: row.tradingDate } },
        select: { id: true },
      });
      const coverage = prior
        ? await this.evidence.corporateActions(
            protocol,
            row.tradingDate,
            new Set(protocol.instruments.map((i) => i.symbol)),
          )
        : {};

      await this.admission.open(
        row.arena.ownerId,
        row.arenaId,
        row.tradingDate,
        prices,
        {
          id,
          attempt,
        },
        coverage,
      );
    } catch {
      await this.release(id, attempt, row.maxAttempts, 'admission_failed');
    }
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.queue?.close();
  }
}
