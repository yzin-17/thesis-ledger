import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { arenaDateAt, arenaDueWakeups, arenaLiveDateAllowed } from '@thesis-ledger/domain';
import {
  arenaLiveAccountSchema,
  arenaLiveProtocolSchema,
  type Quote,
  type MarketSession,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../../platform/prisma.service.js';
import { MarketService } from '../../market/market.service.js';
import { liveQuoteInCurrentSession } from '../../market/market-live-quote-session.js';
import {
  liveActiveMatches,
  liveAgents,
  liveMatch,
  saveLiveAccount,
  type LiveCycleRow,
} from './live-storage.js';
import { liveTimeline } from './live-timeline.js';

@Injectable()
export class LiveAppointments {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(MarketService) private readonly market: Pick<MarketService, 'getSession' | 'getQuote'>,
  ) {}
  async scan(now = new Date()) {
    for await (const row of liveActiveMatches(this.db, false)) await this.admit(row.id, now);
  }
  async admit(id: string, now?: Date) {
    if ((await liveTimeline(this.db, id))?.phase === 'replay') return [];
    const started = now ?? new Date();
    const match = await liveMatch(this.db, id);
    const p = arenaLiveProtocolSchema.parse(match.protocol);
    // 研究预约可以在盘前、收盘后和休市唤醒；赛期仍按市场时区约束。
    const tradingDate = arenaDateAt(started.toISOString(), p.timeZone);
    if (!arenaLiveDateAllowed(p, tradingDate)) return [];
    const session = await this.market.getSession(p.market, started);
    // 只有经过实际交易会话确认的价格才能触发价格事件；时间/成交事件不依赖开市。
    const canObservePrices = session.state === 'open' && session.date === tradingDate;
    const observedAgents = await liveAgents(this.db, id);
    const symbols = canObservePrices
      ? [
          ...new Set(
            observedAgents.flatMap((a) =>
              arenaLiveAccountSchema
                .parse(a.account)
                .wakeups.flatMap((w) =>
                  !w.firedAt && w.condition.kind === 'price' ? [w.condition.symbol] : [],
                ),
            ),
          ),
        ]
      : [];
    const quotes = new Map<string, Quote>();
    for (const symbol of symbols) {
      const fixed = p.instruments.find((i) => i.symbol === symbol);
      const dot = symbol.lastIndexOf('.');
      const known = fixed
        ? null
        : await this.db.instrument.findFirst({
            where: {
              canonicalCode: symbol.slice(0, dot),
              market: symbol.slice(dot + 1),
              active: true,
              instrumentType: { in: ['STOCK', 'ETF'] },
            },
            select: { instrumentType: true },
          });
      const assetType = fixed?.assetType ?? known?.instrumentType;
      if (assetType !== 'STOCK' && assetType !== 'ETF') continue;
      try {
        const q = await this.market.getQuote(symbol, { assetType, allowStale: false });
        if (!isPriceWakeupQuote(q, symbol, p.currency)) continue;
        quotes.set(symbol, q);
      } catch {
        /* 来源失败只阻止相应价格条件；时间和成交事件独立。 */
      }
    }
    const cutoff = now ?? new Date();
    if (quotes.size) {
      const currentSession = await this.market.getSession(p.market, cutoff);
      prunePriceWakeupQuotes(
        quotes,
        currentSession,
        session.date,
        cutoff,
        p.resources.maxQuoteAgeSeconds,
      );
    }
    return this.db.$transaction(async (tx) => {
      const current = await liveMatch(tx, id, undefined, true);
      if (current.state !== 'running') return [];
      // 旧版扫描可能留下“等待开市”原因；该原因现在不再阻止研究。
      await tx.$executeRaw`UPDATE "ArenaLiveAgent" SET reason=NULL
        WHERE "matchId"=${id}::uuid AND state='waiting' AND reason IN ('market_closed','calendar_unavailable','calendar_incomplete','calendar_future','calendar_invalid')`;
      const ids: string[] = [];
      for (const agent of await liveAgents(tx, id, true)) {
        if (agent.state !== 'waiting') continue;
        const active = await tx.$queryRaw<LiveCycleRow[]>`SELECT id FROM "ArenaLiveCycle"
          WHERE "agentId"=${agent.id}::uuid AND state IN ('pending','running') LIMIT 1`;
        if (active.length) continue;
        const book = arenaLiveAccountSchema.parse(agent.account);
        const fired = arenaDueWakeups(
          book.wakeups,
          [...quotes.values()].map((q) => ({
            symbol: q.symbol,
            price: String(q.price),
            marketTime: q.marketTime!,
            observedAt: q.fetchedAt,
          })),
          book.fills,
          cutoff.toISOString(),
        );
        if (!fired.length) continue;
        for (const w of book.wakeups) if (fired.includes(w.id)) w.firedAt = cutoff.toISOString();
        const cycleId = randomUUID();
        await tx.$executeRaw`INSERT INTO "ArenaLiveCycle" (id,"matchId","agentId",trigger,"bookRevision")
          VALUES (${cycleId}::uuid,${id}::uuid,${agent.id}::uuid,${JSON.stringify(fired)},${book.revision})`;
        await saveLiveAccount(tx, agent.id, book);
        await tx.$executeRaw`UPDATE "ArenaLiveAgent" SET state='waiting',reason='delivery_pending' WHERE id=${agent.id}::uuid`;
        ids.push(cycleId);
      }
      return ids;
    });
  }
}

function isPriceWakeupQuote(
  q: Quote,
  symbol: string,
  currency: string,
): q is Quote & { marketTime: string } {
  return !(
    q.symbol !== symbol ||
    q.stale ||
    q.refreshFailure ||
    q.freshness !== 'live' ||
    !q.marketTime ||
    q.units?.priceCurrency !== currency
  );
}

function prunePriceWakeupQuotes(
  quotes: Map<string, Quote>,
  session: Pick<MarketSession, 'state' | 'date' | 'sessions'>,
  observedDate: MarketSession['date'],
  cutoff: Date,
  maxQuoteAgeSeconds: number,
) {
  if (session.state !== 'open' || session.date !== observedDate) quotes.clear();
  else
    for (const [symbol, q] of quotes)
      if (
        !liveQuoteInCurrentSession(session, q.marketTime!, cutoff) ||
        cutoff.getTime() - Date.parse(q.marketTime!) > maxQuoteAgeSeconds * 1000
      )
        quotes.delete(symbol);
}
