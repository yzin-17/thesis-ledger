import { Injectable, Inject, Optional } from '@nestjs/common';
import type { MarketQuoteIdentity, WatchlistPrice } from '@thesis-ledger/schemas';
import { watchlistPricesInputSchema } from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { MarketPeriodCalendarReader } from '../market/market-period-calendar-reader.js';
import { WatchlistQuoteContext } from './watchlist-quote-context.js';
import { MarketService } from '../market/market.service.js';
import { quoteBatchFailure } from '../market/market-quote-batch.js';
import { localIdentityPrincipal } from '../identity/local-workspace.js';

function unavailable(error: unknown): WatchlistPrice['price'] {
  const failure = quoteBatchFailure(error);
  return { kind: 'unavailable', reason: failure.reason ?? failure.code };
}

@Injectable()
export class WatchlistPrices {
  private readonly quoteContext: WatchlistQuoteContext;
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(MarketService) private readonly market: MarketService,
    @Optional() @Inject(MarketPeriodCalendarReader) calendar?: MarketPeriodCalendarReader,
  ) {
    this.quoteContext = new WatchlistQuoteContext(calendar);
  }
  async read(ownerId: string, raw: unknown, signal: AbortSignal): Promise<WatchlistPrice[]> {
    const { itemIds, mode } = watchlistPricesInputSchema.parse(raw);
    signal.throwIfAborted();
    const rows = await this.db.watchlistItem.findMany({
      where: { ownerId, id: { in: itemIds } },
      select: {
        id: true,
        instrument: {
          select: { canonicalCode: true, market: true, instrumentType: true, active: true },
        },
      },
    });
    const items = rows.map(({ id, instrument: i }) => ({
      id,
      symbol: i.canonicalCode + '.' + i.market,
      type: i.instrumentType,
      active: i.active,
    }));
    const held = await this.held(
      ownerId,
      mode,
      items.map((i) => i.symbol),
    );
    const values = new Map<string, WatchlistPrice['price']>();
    const quotes: MarketQuoteIdentity[] = items.flatMap((i) =>
      i.active && (i.type === 'ETF' || i.type === 'STOCK')
        ? [{ symbol: i.symbol, assetType: i.type }]
        : [],
    );
    signal.throwIfAborted();
    if (quotes.length) {
      for (const { identity, outcome } of await this.market.getQuotes(quotes, {
        allowStale: true,
        signal,
      })) {
        const value: WatchlistPrice['price'] =
          outcome.status === 'fulfilled'
            ? { kind: 'quote', quote: outcome.value }
            : unavailable(outcome.reason);
        values.set(identity.assetType + ':' + identity.symbol, value);
      }
    }
    const funds = items.filter((i) => i.active && i.type === 'MUTUAL_FUND');
    for (let start = 0; start < funds.length; start += 8) {
      signal.throwIfAborted();
      await Promise.all(
        funds.slice(start, start + 8).map(async (i) => {
          try {
            const nav = await this.market.getFundNav(i.symbol, { allowStale: true, signal });
            if (nav.freshness === 'unavailable')
              values.set(i.type + ':' + i.symbol, { kind: 'unavailable', reason: 'unavailable' });
            else values.set(i.type + ':' + i.symbol, { kind: 'nav', nav });
          } catch (error) {
            values.set(i.type + ':' + i.symbol, unavailable(error));
          }
        }),
      );
    }
    signal.throwIfAborted();
    return Promise.all(
      items.map(async (i) => {
        const price = values.get(i.type + ':' + i.symbol) ?? {
          kind: 'unavailable' as const,
          reason: i.active ? 'unavailable' : 'inactive_instrument',
        };
        const quoteContext =
          price.kind === 'quote' ? await this.quoteContext.read(price.quote) : undefined;
        return {
          itemId: i.id,
          price,
          minRefreshSeconds: i.type === 'ETF' ? 600 : 60,
          ...(quoteContext && { quoteContext }),
          held: held?.has(i.symbol) ?? null,
        };
      }),
    );
  }

  private async held(
    ownerId: string,
    mode: 'actual' | 'shadow',
    symbols: string[],
  ): Promise<Set<string> | null> {
    if (localIdentityPrincipal()?.id !== ownerId || !symbols.length) return null;
    try {
      const positions = await this.db.position.findMany({
        where: { symbol: { in: symbols }, quantity: { gt: 0 }, account: { active: true, mode } },
        select: { symbol: true },
        distinct: ['symbol'],
      });
      return new Set(positions.map((p) => p.symbol));
    } catch {
      return null;
    }
  }
}
