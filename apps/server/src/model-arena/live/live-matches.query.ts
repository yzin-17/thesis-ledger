import { Inject, Injectable } from '@nestjs/common';
import { arenaWindowDate, arenaAvailableCash, arenaAvailableShares, DecimalValue, projectMarketSession } from '@thesis-ledger/domain';
import { arenaLiveAccountSchema, arenaLiveDetailSchema, arenaLivePointSchema, marketPeriodCalendarSchema, type ArenaPointQuery } from '@thesis-ledger/schemas';
import { PrismaService } from '../../platform/prisma.service.js';
import { InstrumentDisplayService } from '../../market/instruments/instrument-display.service.js';
import { MarketService } from '../../market/market.service.js';
import { liveAgents, liveMatch, liveSummary, type LiveCycleRow } from './live-storage.js';
import { LiveValuationQuery } from './live-valuation-query.js';
import { liveTimeline } from './live-timeline.js';

@Injectable()
export class LiveMatchesQuery {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(InstrumentDisplayService) private readonly names: InstrumentDisplayService,
    @Inject(MarketService) private readonly market: Pick<MarketService, 'getSession'>,
  ) {}
  async points(ownerId: string, id: string, input: ArenaPointQuery) {
    const match = liveSummary(await liveMatch(this.db, id, ownerId));
    const rows = await this.db.$queryRaw<{ agentId: string; model: string; fill: unknown; day: string }[]>`
      SELECT a.id AS "agentId",a.model,f.fill,
        to_char((f.fill->>'marketTime')::timestamptz AT TIME ZONE ${match.protocol.timeZone},'YYYY-MM-DD') AS day
      FROM "ArenaLiveAgent" a CROSS JOIN LATERAL jsonb_array_elements(a.account->'fills') f(fill)
      WHERE a."matchId"=${id}::uuid AND (${input.entrantId ?? null}::uuid IS NULL OR a.id=${input.entrantId ?? null}::uuid)
        AND f.fill->>'symbol'=${input.symbol}
        AND ((f.fill->>'marketTime')::timestamptz AT TIME ZONE ${match.protocol.timeZone})::date BETWEEN ${input.start}::date AND ${input.end}::date
      ORDER BY (f.fill->>'marketTime')::timestamptz,a.id,f.fill->>'id'`;
    return rows.map((row) => {
      const f = arenaLiveAccountSchema.shape.fills.element.parse(row.fill);
      return arenaLivePointSchema.parse({ protocolVersion: 2, id: f.id, arenaId: id, roundId: null,
        entrantId: row.agentId, model: row.model, symbol: f.symbol, day: row.day,
        executedAt: f.marketTime, side: f.side, price: f.price, quantity: f.quantity });
    });
  }
  async read(ownerId: string, id: string) {
    const match = await liveMatch(this.db, id, ownerId);
    const summary = liveSummary(match);
    const agents = await liveAgents(this.db, id);
    const cycles = await this.db.$queryRaw<LiveCycleRow[]>`SELECT * FROM "ArenaLiveCycle"
      WHERE "matchId"=${id}::uuid ORDER BY "createdAt" DESC,id LIMIT 200`;
    const history = new LiveValuationQuery(this.db);
    const accounts = agents.map((a) => ({ ...a, account: arenaLiveAccountSchema.parse(a.account) }));
    const symbols = [...new Set([
      ...summary.protocol.instruments.map((i) => i.symbol),
      ...accounts.flatMap((a) => [...a.account.watchedSymbols, ...a.account.positions.map((p) => p.symbol), ...a.account.orders.map((o) => o.symbol)]),
    ])];
    const directory = await this.names.resolve(symbols).catch(() => ({ name: (symbol: string) => symbol }));
    const timeline = await liveTimeline(this.db, id);
    const sessionAt = timeline?.phase === 'replay' ? new Date(timeline.pendingAt ?? timeline.cursorAt) : undefined;
    let session;
    if (sessionAt) {
      const [stored] = await this.db.$queryRaw<{ calendar: unknown }[]>`SELECT evidence->'calendar' AS calendar FROM "ArenaLiveValuation" WHERE "matchId"=${id}::uuid ORDER BY at DESC LIMIT 1`;
      const calendar = marketPeriodCalendarSchema.safeParse(stored?.calendar);
      session = projectMarketSession(calendar.success ? calendar.data : null, sessionAt);
    } else session = await this.market.getSession(summary.protocol.market);
    const day = session.state !== 'unknown' ? session.date ?? null : null;
    const [frames, final] = await Promise.all([
      history.chart(id, agents.length + summary.protocol.benchmarks.length), history.latest(id, summary.state === 'ended'),
    ]);
    const sealedFrame = summary.state === 'ended' ? final : null;
    const periodReturns = await Promise.all((['today', 'week', 'month', 'all'] as const).map(async (period) => {
      const cutoff = arenaWindowDate(period, final?.at ?? new Date().toISOString(), summary.protocol.timeZone);
      const base = cutoff ? await history.before(id, cutoff, summary.protocol.timeZone) : null;
      return { period, rows: agents.map((a) => {
        const startNav = base ? base.marks.find((m) => m.agentId === a.id)?.nav : summary.protocol.initialCash;
        const endNav = final?.marks.find((m) => m.agentId === a.id)?.nav;
        const returnRatio = !startNav || !endNav || DecimalValue.from(startNav).isZero() ? null : DecimalValue.from(endNav).dividedBy(startNav).minus('1').toString();
        return { agentId: a.id, returnRatio };
      }) };
    }));
    return arenaLiveDetailSchema.parse({
      ...summary, timeline, session, remaining: match.remaining, sealedFrame, periodReturns, frames,
      instrumentDirectory: Object.fromEntries(symbols.map((s) => [s, directory.name(s)])),
      agents: accounts.map((a) => ({ id: a.id, providerId: a.providerId, model: a.model, remaining: a.remaining,
        availability: { tradingDate: day, cash: day ? arenaAvailableCash(a.account, day) : null,
          shares: day ? Object.fromEntries([...new Set(a.account.positions.map((p) => p.symbol))].map((symbol) => [symbol, arenaAvailableShares(a.account, symbol, day)])) : {} },
        state: a.state, reason: a.reason, account: a.account, cycles: cycles.filter((c) => c.agentId === a.id).map((c) => ({
        id: c.id, agentId: c.agentId, state: c.state, trigger: c.trigger, attempt: c.attempt,
        reason: c.reason, requestId: c.requestId,
        createdAt: c.createdAt.toISOString(), completedAt: c.completedAt?.toISOString() ?? null,
        asOf: (c.input as { asOf?: string } | null)?.asOf ?? null,
        usage: c.requestAudit, decision: c.decision,
      })) })),
    });
  }
}
