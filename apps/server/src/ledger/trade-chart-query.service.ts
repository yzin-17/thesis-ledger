import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { marketCivilInstant } from '@thesis-ledger/domain';
import {
  currencySchema,
  tradeChartQuerySchema,
  tradeChartResponseSchema,
  type TradeChartMarker,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';

const nextDate = (date: string) =>
  new Date(Date.parse(date) + 86_400_000).toISOString().slice(0, 10);
const tradingDate = (time: Date, timezone: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(time)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
};

/** 只读取已落库成交投影；不触发账本重建、来源查询或账户写入。 */
@Injectable()
export class TradeChartQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async read(raw: unknown) {
    const input = tradeChartQuerySchema.parse(raw);
    const timezone = input.symbol.endsWith('.HK') ? 'Asia/Hong_Kong' : 'Asia/Shanghai';
    const zone = input.symbol.endsWith('.US') ? 'America/New_York' : timezone;
    const lower = new Date(
      Math.min(Date.parse(input.start), Date.parse(marketCivilInstant(input.start, 0, zone))),
    );
    const upper = new Date(
      Math.max(
        Date.parse(nextDate(input.end)),
        Date.parse(marketCivilInstant(nextDate(input.end), 0, zone)),
      ),
    );
    return this.prisma.$transaction(
      async (tx) => {
        const account = await tx.account.findUnique({
          where: { id: input.accountId },
          select: { mode: true },
        });
        const state = await tx.accountLedgerState.findUnique({
          where: { accountId: input.accountId },
          select: { ledgerRevision: true, projectionGeneration: true },
        });
        const base = {
          version: 'trade-chart-v1' as const,
          ...input,
          ledgerRevision: state?.ledgerRevision.toString() ?? '0',
          projectionGeneration: state?.projectionGeneration.toString() ?? '0',
          generatedAt: new Date().toISOString(),
        };
        const unavailable = (
          reason:
            'account_scope_unavailable' | 'marker_budget_exceeded' | 'projection_inconsistent',
        ) => tradeChartResponseSchema.parse({ ...base, status: 'unavailable', reason });
        if (!account || account.mode !== input.mode)
          return unavailable('account_scope_unavailable');
        const trade = {
          accountId: input.accountId,
          accountMode: input.mode,
          symbol: input.symbol,
          account: { mode: input.mode },
        };
        const where = { trade, occurredAt: { gte: lower, lt: upper } };
        const select = {
          id: true,
          eventId: true,
          factId: true,
          occurredAt: true,
          currency: true,
          price: true,
          quantity: true,
          trade: { select: { projectionGeneration: true } },
        } as const;
        const [buys, sells, unknownBuys, unknownSells] = await Promise.all([
          tx.tradeEntryLeg.findMany({
            where,
            select,
            orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
            take: 1001,
          }),
          tx.tradeCloseSlice.findMany({
            where,
            select,
            orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
            take: 1001,
          }),
          tx.tradeEntryLeg.count({ where: { trade, occurredAt: null } }),
          tx.tradeCloseSlice.count({ where: { trade, occurredAt: null } }),
        ]);
        if (buys.length + sells.length > 1000) return unavailable('marker_budget_exceeded');
        const all = [
          ...buys.map((row) => ({ ...row, side: 'buy' as const })),
          ...sells.map((row) => ({ ...row, side: 'sell' as const })),
        ];
        if (
          all.some((row) => row.trade.projectionGeneration.toString() !== base.projectionGeneration)
        )
          return unavailable('projection_inconsistent');
        const events = await tx.ledgerEvent.findMany({
          where: { accountId: input.accountId, id: { in: all.map((row) => row.eventId) } },
          select: { id: true, timePrecision: true },
        });
        const precision = new Map(events.map((event) => [event.id, event.timePrecision]));
        const markers: TradeChartMarker[] = [];
        let omittedCount = 0;
        for (const row of all) {
          const timePrecision = precision.get(row.eventId);
          if (
            !row.occurredAt ||
            !row.price ||
            !row.price.gt(0) ||
            !row.quantity.gt(0) ||
            !currencySchema.safeParse(row.currency).success ||
            (timePrecision !== 'DATE' && timePrecision !== 'INSTANT')
          ) {
            omittedCount++;
            continue;
          }
          const date =
            timePrecision === 'DATE'
              ? row.occurredAt.toISOString().slice(0, 10)
              : tradingDate(row.occurredAt, zone);
          if (date < input.start || date > input.end) continue;
          markers.push({
            id: `${row.side}:${row.id}`,
            eventId: row.eventId,
            factId: row.factId,
            side: row.side,
            occurredAt: row.occurredAt.toISOString(),
            tradingDate: date,
            timePrecision,
            currency: currencySchema.parse(row.currency),
            price: row.price.toFixed(),
            quantity: row.quantity.toFixed(),
          });
        }
        markers.sort(
          (left, right) =>
            left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id),
        );
        return tradeChartResponseSchema.parse({
          ...base,
          status: 'ready',
          markers,
          omittedCount,
          unplacedCount: unknownBuys + unknownSells,
          unplacedCountScope: 'symbol-all-dates',
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
