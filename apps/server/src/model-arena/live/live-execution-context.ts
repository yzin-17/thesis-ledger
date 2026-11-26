import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { ArenaPaperContext, ArenaPaperQuote } from '@thesis-ledger/domain';
import type {
  ArenaLiveAccount,
  ArenaLiveDecision,
  ArenaLiveProtocol,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../../platform/prisma.service.js';
import { MarketService } from '../../market/market.service.js';
import { MarketLiveExecutionReader } from '../../market/market-live-execution-reader.js';
import { MarketArenaReplayReader } from '../../market/market-arena-replay-reader.js';
import { MarketArenaValuationReader } from '../../market/market-arena-valuation-reader.js';

function executionScopeSymbols(
  books: readonly ArenaLiveAccount[],
  decision: ArenaLiveDecision | undefined,
  additionalSymbols: readonly string[],
) {
  return [
    ...new Set([
      ...books.flatMap((b) => [
        ...b.positions.map((s) => s.symbol),
        ...b.orders.filter((o) => o.state === 'active').map((o) => o.symbol),
      ]),
      ...additionalSymbols,
      ...(decision?.orders.map((o) => o.symbol) ?? []),
      ...(decision?.watchedSymbols ?? []),
      ...(decision?.wakeups.flatMap((w) => (w.kind !== 'time' && w.symbol ? [w.symbol] : [])) ??
        []),
    ]),
  ];
}
function needsExecutionQuote(
  symbol: string,
  books: readonly ArenaLiveAccount[],
  decision: ArenaLiveDecision | undefined,
  additionalSymbols: readonly string[],
) {
  return (
    (!decision && books.some((b) => b.orders.some((o) => o.symbol === symbol && o.state === 'active'))) ||
    decision?.orders.some((o) => o.symbol === symbol) ||
    additionalSymbols.includes(symbol)
  );
}
function executionExpiryDates(
  decision: ArenaLiveDecision | undefined,
  symbol?: string,
) {
  return [
    ...new Set([
      ...(decision?.orders.filter(o => !symbol || o.symbol === symbol).flatMap((o) => (o.expiresOn ? [o.expiresOn] : [])) ?? []),
      ...(decision?.orders.filter(o => !symbol || o.symbol === symbol).flatMap((o) => o.onFill?.activateOrders.flatMap((child) =>
        child.validUntil.kind === 'date' ? [child.validUntil.expiresOn] : []) ?? []) ?? []),
    ]),
  ];
}

@Injectable()
export class LiveExecutionContext {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(MarketService) private readonly market: Pick<MarketService, 'getSession'>,
    @Inject(MarketLiveExecutionReader)
    private readonly reader: Pick<MarketLiveExecutionReader, 'read'>,
    @Optional()
    @Inject(MarketArenaReplayReader)
    private readonly replay?: Pick<MarketArenaReplayReader, 'observe'>,
    @Optional()
    @Inject(MarketArenaValuationReader)
    private readonly valuation?: Pick<MarketArenaValuationReader, 'read'>,
  ) {}
  async build(
    p: ArenaLiveProtocol,
    books: readonly ArenaLiveAccount[],
    decision?: ArenaLiveDecision,
    additionalSymbols: readonly string[] = [],
    replayAt?: string,
  ) {
    const symbols = executionScopeSymbols(books, decision, additionalSymbols);
    if (replayAt) {
      return this.buildReplay(p, books, decision, symbols, replayAt);
    }
    const where = symbols.map((symbol) => {
      const dot = symbol.lastIndexOf('.');
      return { canonicalCode: symbol.slice(0, dot), market: symbol.slice(dot + 1) };
    });
    const directory = where.length
      ? await this.db.instrument.findMany({
          where: { OR: where, instrumentType: { in: ['STOCK', 'ETF'] } },
          select: {
            id: true,
            canonicalCode: true,
            market: true,
            instrumentType: true,
            active: true,
          },
        })
      : [];
    const allowed = new Set<string>();
    const quotes: ArenaPaperQuote[] = [];
    const missing: Record<string, string> = {};
    const ends = new Map<string, string>();
    const valuationPrices = new Map<string, string>();
    const needsNav = decision ? decision.orders.some(o => o.side === 'buy')
      : books.some(b => b.orders.some(o => o.state === 'active' && o.side === 'buy'));
    if (needsNav && this.valuation) {
      const instruments = directory.flatMap(item => {
        const symbol = item.canonicalCode + '.' + item.market;
        const held = books.flatMap(b => b.positions).filter(s => s.symbol === symbol);
        return held.length ? [{ symbol, assetType: item.instrumentType as 'STOCK' | 'ETF',
          acquiredOn: held.map(s => s.acquiredOn).sort()[0]!, lastFillAt: null }] : [];
      });
      const valued = instruments.length ? await this.valuation.read(p, instruments) : null;
      if (valued && !('failure' in valued))
        for (const [symbol, price] of valued.prices) valuationPrices.set(symbol, price);
    }
    for (const item of directory) {
      const symbol = item.canonicalCode + '.' + item.market;
      const correctMarket =
        p.market === 'CN' ? ['SH', 'SZ', 'BJ'].includes(item.market) : item.market === p.market;
      if (
        !correctMarket ||
        (p.universe === 'fixed' && !p.instruments.some((i) => i.instrumentId === item.id))
      )
        continue;
      if (item.active) allowed.add(symbol);
      const held = books.flatMap((b) => b.positions).filter((s) => s.symbol === symbol);
      if (held.length) allowed.add(symbol);
      const needsQuote = needsExecutionQuote(
        symbol,
        books,
        decision,
        additionalSymbols,
      );
      if (!needsQuote) continue;
      const expiresOn = executionExpiryDates(decision, symbol);
      try {
        const read = await this.reader.read({
          symbol,
          assetType: item.instrumentType as 'STOCK' | 'ETF',
          market: p.market,
          currency: p.currency,
          maxQuoteAgeSeconds: p.resources.maxQuoteAgeSeconds,
          ...(p.simulationPolicy ? { simulationPolicy: p.simulationPolicy } : {}),
          expiresOn,
          needsBuySettlement: decision ? decision.orders.some(o => o.symbol === symbol && o.side === 'buy')
            : books.some(b => b.orders.some(o => o.symbol === symbol && o.state === 'active' && o.side === 'buy')),
          ...(held.length ? { previousDay: held.map((s) => s.acquiredOn).sort()[0]! } : {}),
        });
        if (read.status === 'unavailable') {
          missing[symbol] = read.reason;
          continue;
        }
        quotes.push(read.observation);
        valuationPrices.set(symbol, read.observation.price);
        for (const [day, end] of read.ends) ends.set(day, end);
      } catch {
        missing[symbol] = 'execution_evidence_unavailable';
      }
    }
    for (const b of books) for (const position of b.positions) allowed.add(position.symbol);
    const at = new Date();
    const session = await this.market.getSession(p.market, at);
    const day = session.date;
    const expiry: ArenaPaperContext['expiresAt'] = (requested, kind) => {
      if (!day) throw new Error('calendar_unavailable');
      if (kind === 'market') {
        const current = session.sessions.find(
          (s) => Date.parse(s.startAt) <= at.getTime() && Date.parse(s.endAt) > at.getTime(),
        );
        if (session.state !== 'open' || !current) throw new Error('market_closed');
        return new Date(current.endAt).toISOString();
      }
      const date = requested ?? day;
      if (p.endsOn && date > p.endsOn) throw new Error('expiry_outside_season');
      const end = ends.get(date);
      if (!end) throw new Error('expiry_calendar_unavailable');
      return end;
    };
    const fresh = quotes.filter(
      (q) => at.getTime() - Date.parse(q.marketTime) <= p.resources.maxQuoteAgeSeconds * 1000,
    );
    const context: ArenaPaperContext = {
      at: at.toISOString(),
      tradingDate: day ?? '',
      fees: p.fees,
      matching: p.matching,
      maxPositionBps: p.maxPositionBps,
      maxActiveSymbols: p.resources.maxActiveSymbols,
      allowedSymbols: allowed,
      quotes: fresh,
      valuationPrices,
      expiresAt: expiry,
      newId: randomUUID,
    };
    return { context, missing, session };
  }
  private async buildReplay(
    p: ArenaLiveProtocol,
    books: readonly ArenaLiveAccount[],
    decision: ArenaLiveDecision | undefined,
    symbols: string[],
    replayAt: string,
  ) {
    if (!this.replay) throw new Error('replay_prices_unavailable');
    const executionSymbols = [
      ...(!decision ? books.flatMap((b) => b.orders.filter((o) => o.state === 'active').map((o) => o.symbol)) : []),
      ...(decision?.orders.map((o) => o.symbol) ?? []),
    ];
    return {
      ...(await this.replay.observe(
        p,
        replayAt,
        symbols,
        books.flatMap((b) => b.positions),
        executionSymbols,
        executionExpiryDates(decision),
        decision ? decision.orders.filter(o => o.side === 'buy').map(o => o.symbol)
          : books.flatMap(b => b.orders.filter(o => o.state === 'active' && o.side === 'buy').map(o => o.symbol)),
        !decision || decision.orders.length > 0,
      )),
      missing: {} as Record<string, string>,
    };
  }
}
