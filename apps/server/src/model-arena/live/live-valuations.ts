import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  arenaAccountNav,
  arenaCommonMarks,
  arenaEqualWeightBook,
  DecimalValue,
} from '@thesis-ledger/domain';
import {
  arenaLiveAccountSchema,
  arenaLiveFrameSchema,
  arenaLiveProtocolSchema,
  type ArenaLiveAccount,
  type MarketSession,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../../platform/prisma.service.js';
import { MarketArenaValuationReader } from '../../market/market-arena-valuation-reader.js';
import { LiveExecutionContext } from './live-execution-context.js';
import { liveAgents, liveMatch } from './live-storage.js';
import { liveTimeline } from './live-timeline.js';

@Injectable()
export class LiveValuations {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(MarketArenaValuationReader)
    private readonly reader: Pick<MarketArenaValuationReader, 'read'>,
    @Inject(LiveExecutionContext) private readonly execution: Pick<LiveExecutionContext, 'build'>,
  ) {}
  async capture(id: string) {
    if ((await liveTimeline(this.db, id))?.phase === 'replay') return;
    const match = await liveMatch(this.db, id);
    if (!match.startedAt || match.state === 'ended' || match.state === 'draft') return;
    const p = arenaLiveProtocolSchema.parse(match.protocol);
    const agents = (await liveAgents(this.db, id)).map((a) => ({
      ...a,
      account: arenaLiveAccountSchema.parse(a.account),
    }));
    const [previous] = await this.db.$queryRaw<
      { frame: unknown; evidence: unknown }[]
    >`SELECT frame,evidence FROM "ArenaLiveValuation"
      WHERE "matchId"=${id}::uuid ORDER BY "at" DESC LIMIT 1`;
    const old = previous ? arenaLiveFrameSchema.parse(previous.frame) : null;
    const benchmark = await this.benchmarkAccount(match, p, previous);
    const books = [...agents.map((a) => a.account), ...(benchmark ? [benchmark] : [])];
    const held = books.flatMap((b) => b.positions);
    const symbols = [...new Set(held.map((s) => s.symbol))];
    const identities = symbols.map((s) => ({
      canonicalCode: s.slice(0, s.lastIndexOf('.')),
      market: s.slice(s.lastIndexOf('.') + 1),
    }));
    const directory = identities.length
      ? await this.db.instrument.findMany({
          where: { OR: identities, instrumentType: { in: ['STOCK', 'ETF'] } },
          select: { canonicalCode: true, market: true, instrumentType: true },
        })
      : [];
    const instruments = directory.map((item) => {
      const symbol = item.canonicalCode + '.' + item.market;
      return {
        symbol,
        assetType: item.instrumentType as 'STOCK' | 'ETF',
        acquiredOn: held
          .filter((s) => s.symbol === symbol)
          .map((s) => s.acquiredOn)
          .sort()[0]!,
        lastFillAt:
          books
            .flatMap((b) => b.fills)
            .filter((f) => f.symbol === symbol)
            .map((f) => f.marketTime)
            .sort()
            .at(-1) ?? null,
      };
    });
    const observed = await this.reader.read(p, instruments);
    if (!observed) return;
    if (observed.failure === true) {
      await this.gap(id, observed.reason, observed.session);
      return;
    }
    const marks = arenaCommonMarks(agents, observed.prices, p.initialCash, old?.marks ?? []);
    const baselineNav = benchmark ? arenaAccountNav(benchmark, observed.prices) : null;
    const complete =
      marks.every((m) => m.complete) &&
      (!p.benchmarks.includes('equal_weight_buy_hold') || baselineNav !== null);
    if (!complete) for (const mark of marks) mark.rank = null;
    const frame = arenaLiveFrameSchema.parse({
      at: observed.at.toISOString(),
      marketTime: observed.marketTime,
      complete,
      reason: complete ? null : 'common_valuation_incomplete',
      marks,
      benchmarks: p.benchmarks.map((kind) => {
        const nav = kind === 'cash' ? p.initialCash : baselineNav;
        return {
          id: kind,
          nav,
          returnRatio:
            nav === null
              ? null
              : DecimalValue.from(nav).dividedBy(p.initialCash).minus('1').toString(),
        };
      }),
    });
    await this.db.$transaction(async (tx) => {
      const current = await liveMatch(tx, id, undefined, true);
      if (current.state !== match.state) return;
      const locked = await liveAgents(tx, id, true);
      if (
        locked.some(
          (a) =>
            arenaLiveAccountSchema.parse(a.account).revision !==
            agents.find((b) => b.id === a.id)?.account.revision,
        )
      )
        return;
      const [latest] = await tx.$queryRaw<
        { at: Date }[]
      >`SELECT "at" FROM "ArenaLiveValuation" WHERE "matchId"=${id}::uuid ORDER BY "at" DESC LIMIT 1`;
      if (
        latest &&
        (latest.at.getTime() >= observed.at.getTime() ||
          (old && latest.at.toISOString() !== old.at))
      )
        return;
      await tx.$executeRaw`INSERT INTO "ArenaLiveValuation" (id,"matchId","at",frame,evidence)
        VALUES (${randomUUID()}::uuid,${id}::uuid,${observed.at},${JSON.stringify(frame)}::jsonb,
        ${JSON.stringify({ session: observed.session, quotes: observed.evidence, missing: observed.missing, benchmarkAccount: benchmark })}::jsonb)`;
    });
    return frame;
  }
  private async benchmarkAccount(
    match: Awaited<ReturnType<typeof liveMatch>>,
    p: ReturnType<typeof arenaLiveProtocolSchema.parse>,
    previous: { evidence: unknown } | undefined,
  ) {
    const savedBaseline = (previous?.evidence as { benchmarkAccount?: unknown } | undefined)
      ?.benchmarkAccount;
    let benchmark: ArenaLiveAccount | null = savedBaseline
      ? arenaLiveAccountSchema.parse(savedBaseline)
      : null;
    if (!benchmark && match.state === 'running' && p.benchmarks.includes('equal_weight_buy_hold')) {
      const symbols = p.instruments.map((i) => i.symbol);
      const ready = await this.execution.build(p, [], undefined, symbols);
      if (ready.session.state === 'open' && ready.context.quotes.length === symbols.length) {
        benchmark = arenaLiveAccountSchema.parse(
          arenaEqualWeightBook(
            p.initialCash,
            p.maxPositionBps,
            ready.context.quotes,
            p.fees,
            ready.context.at,
            randomUUID,
          ),
        );
      }
    }

    return benchmark;
  }
  async gap(id: string, reason: string, session: MarketSession) {
    const at = new Date(session.evaluatedAt);
    await this.db.$transaction(async (tx) => {
      const match = await liveMatch(tx, id, undefined, true);
      if ((await liveTimeline(tx, id))?.phase === 'replay') return;
      if (!match.startedAt || at < match.startedAt || !['running', 'paused'].includes(match.state))
        return;
      const [latest] = await tx.$queryRaw<
        { at: Date; frame: unknown; evidence: unknown }[]
      >`SELECT "at",frame,evidence FROM "ArenaLiveValuation" WHERE "matchId"=${id}::uuid ORDER BY "at" DESC LIMIT 1`;
      if (latest && latest.at >= at) return;
      const p = arenaLiveProtocolSchema.parse(match.protocol),
        old = latest ? arenaLiveFrameSchema.parse(latest.frame) : null;
      const agents = await liveAgents(tx, id);
      const frame = arenaLiveFrameSchema.parse({
        kind: 'gap',
        at: at.toISOString(),
        marketTime: null,
        complete: false,
        reason,
        marks: agents.map((a) => {
          const before = old?.marks.find((m) => m.agentId === a.id);
          return {
            agentId: a.id,
            nav: null,
            returnRatio: null,
            peakNav: before?.peakNav ?? null,
            drawdown: before?.drawdown ?? null,
            rank: null,
            complete: false,
            reason,
          };
        }),
        benchmarks: p.benchmarks.map((kind) => ({ id: kind, nav: null, returnRatio: null })),
      });
      // 缺口只记录观察失败，没有生成新的净值、收益或执行事实。
      await tx.$executeRaw`INSERT INTO "ArenaLiveValuation" (id,"matchId","at",frame,evidence)
        VALUES (${randomUUID()}::uuid,${id}::uuid,${at},${JSON.stringify(frame)}::jsonb,
        ${JSON.stringify({
          kind: 'observation_failure',
          session,
          reason,
          benchmarkAccount:
            (latest?.evidence as { benchmarkAccount?: unknown } | undefined)?.benchmarkAccount ??
            null,
        })}::jsonb)`;
    });
  }
}
