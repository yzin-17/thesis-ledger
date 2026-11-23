import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { arenaLiveProtocolSchema, type MarketSession } from '@thesis-ledger/schemas';
import { arenaDateAt, arenaLiveDateAllowed, arenaLiveSeasonEnded } from '@thesis-ledger/domain';
import { PrismaService } from '../../platform/prisma.service.js';
import { RedisService } from '../../platform/redis.service.js';
import { MarketService } from '../../market/market.service.js';
import { ArenaQueue, type ArenaDelivery } from '../arena-queue.js';
import { LiveAppointments } from './live-appointments.js';
import { LiveCyclesRepository } from './live-cycles.repository.js';
import { LiveOrdersRepository } from './live-orders.repository.js';
import { LiveResearchRunner } from './live-research-runner.js';
import { LiveValuations } from './live-valuations.js';
import { LiveMatchesRepository } from './live-matches.repository.js';
import { liveActiveMatches, liveMatch, type LiveCycleRow } from './live-storage.js';
import { LiveReplayRuntime } from './live-replay-runtime.js';
import { liveTimeline } from './live-timeline.js';

@Injectable()
export class LiveRuntime implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LiveRuntime.name);
  private queue?: ArenaQueue;
  private timer?: ReturnType<typeof setInterval>;
  private inFlight: Promise<void> | undefined;
  private readonly sampled = new Map<string, number>();
  private stopping = false;
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(MarketService) private readonly market: Pick<MarketService, 'getSession'>,
    @Inject(LiveAppointments) private readonly appointments: LiveAppointments,
    @Inject(LiveCyclesRepository) private readonly cycles: LiveCyclesRepository,
    @Inject(LiveOrdersRepository) private readonly orders: LiveOrdersRepository,
    @Inject(LiveResearchRunner) private readonly research: LiveResearchRunner,
    @Inject(LiveValuations) private readonly valuations: LiveValuations,
    @Inject(LiveMatchesRepository) private readonly matches: LiveMatchesRepository,
    @Optional()
    @Inject(LiveReplayRuntime)
    private readonly replay?: Pick<LiveReplayRuntime, 'reconcile'>,
  ) {}
  onModuleInit() {
    if (process.env.NODE_ENV !== 'test') this.start();
  }
  start() {
    if (this.queue) return;
    this.stopping = false;
    const error = () => this.logger.warn('自主竞技场执行暂不可用，任务保留在数据库中');
    this.queue = new ArenaQueue(this.redis, (delivery) => this.execute(delivery), error, 'live');
    const poll = () => {
      if (this.inFlight) return;
      this.inFlight = this.reconcile()
        .catch(error)
        .finally(() => {
          this.inFlight = undefined;
        });
    };
    this.timer = setInterval(poll, 5000);
    this.timer.unref();
    poll();
  }
  async reconcile() {
    if (!this.queue) return;
    await this.cycles.recover();
    for await (const m of liveActiveMatches(this.db)) {
      try {
        if (await this.replay?.reconcile(m.id)) continue;
        if ((await liveTimeline(this.db, m.id))?.phase === 'replay') continue;
        const p = arenaLiveProtocolSchema.parse(m.protocol),
          now = Date.now();
        const session = await this.market.getSession(p.market);
        const localDay = arenaDateAt(new Date(now).toISOString(), p.timeZone);
        if (arenaLiveSeasonEnded(p, localDay, session.latestCompletedTradingDate)) {
          await this.valuations.capture(m.id);
          await this.matches.transition(m.ownerId, m.id, 'ended');
          continue;
        }
        if (now - (this.sampled.get(m.id) ?? 0) < p.resources.quoteIntervalSeconds * 1000) continue;
        this.sampled.set(m.id, now);
        if (m.state === 'running') {
          await this.orders.expire(m.id);
          if (session.state === 'open' && session.date && arenaLiveDateAllowed(p, session.date))
            await this.orders.match(m.id);
        }
        // 研究排队不得受估值读取失败影响；估值和成交继续各用正式交易会话事实。
        if (m.state === 'running') await this.appointments.admit(m.id);
        if (session.state === 'unknown' || !session.date)
          await this.valuations.gap(m.id, session.reason ?? 'calendar_unavailable', session);
        else await this.valuations.capture(m.id);
      } catch {
        this.logger.warn('自主竞技场本次观察失败，将在下一次观察重试');
      }
    }
    await this.dispatchPendingCycles(this.queue);
  }
  async execute({ id, attempt }: ArenaDelivery) {
    if (this.stopping) return;
    const [row] = await this.db.$queryRaw<
      LiveCycleRow[]
    >`SELECT * FROM "ArenaLiveCycle" WHERE id=${id}::uuid`;
    if (!row) return;
    const match = await liveMatch(this.db, row.matchId),
      p = arenaLiveProtocolSchema.parse(match.protocol);
    const clock = await liveTimeline(this.db, row.matchId);
    if (clock?.phase === 'replay' && (clock.status !== 'research' || !clock.pendingAt)) return;
    const replayAt = clock?.phase === 'replay' ? clock.pendingAt! : undefined;
    const now = new Date(),
      businessNow = replayAt ? new Date(replayAt) : now;
    const localDay = arenaDateAt(businessNow.toISOString(), p.timeZone);
    if (!arenaLiveDateAllowed(p, localDay)) return;
    const session = await this.market.getSession(p.market, businessNow);
    // 历史回放保留原有交易时段的研究屏障；实时研究在盘前/休市照常执行。
    if (replayAt && (session.state !== 'open' || session.date !== localDay)) return;
    const active = currentLiveExecutionSession(session, businessNow);
    if (replayAt && !active) return;
    const sessionDeadline = !replayAt && active ? new Date(active.endAt) : undefined;
    if (
      !(await this.cycles.claim(
        id,
        attempt,
        now,
        sessionDeadline,
        replayAt,
        { state: session.state, date: session.date ?? null, reason: session.reason ?? null },
      ))
    )
      return;
    await this.research.execute(id, attempt);
  }
  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.inFlight;
    this.research.stop?.();
    await this.queue?.close();
  }
  private async dispatchPendingCycles(queue: ArenaQueue) {
    for (const row of await this.cycles.pending()) {
      const match = await liveMatch(this.db, row.matchId),
        p = arenaLiveProtocolSchema.parse(match.protocol);
      const clock = await liveTimeline(this.db, row.matchId);
      if (clock?.phase === 'replay' && (clock.status !== 'research' || !clock.pendingAt)) continue;
      if (clock?.phase === 'replay') {
        const session = await this.market.getSession(p.market, new Date(clock.pendingAt!));
        if (session.state !== 'open' || !session.date || !arenaLiveDateAllowed(p, session.date))
          continue;
      } else if (!arenaLiveDateAllowed(p, arenaDateAt(new Date().toISOString(), p.timeZone)))
        continue;
      const attempt = row.attempt + 1;
      if ((await queue.ensure(row, attempt)) === 'terminal')
        await this.cycles.deliveryFailed(row.id, attempt);
    }
  }
}

function currentLiveExecutionSession(session: MarketSession, at: Date) {
  return session.state === 'open'
    ? session.sessions.find(
        (s) => Date.parse(s.startAt) <= at.getTime() && Date.parse(s.endAt) > at.getTime(),
      )
    : undefined;
}
