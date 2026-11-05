import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Currency } from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { summarizeTradeRealizedPnl } from './trade-realized-pnl.js';

export type RealizedPnlAtTime = {
  complete: boolean;
  pnl: Array<{ currency: Currency; amount: number }>;
};

@Injectable()
export class TradeRealizedPnlHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async atTimes(accountIds: readonly string[], mode: 'actual' | 'shadow', times: readonly Date[], symbol?: string) {
    const dates = [...new Set(times.map((time) => time.getTime()))].sort((a, b) => a - b);
    const ids = [...new Set(accountIds)];
    const result = new Map<number, RealizedPnlAtTime>();
    if (dates.length === 0) return result;
    if (ids.length === 0) {
      for (const date of dates) result.set(date, { complete: true, pnl: [] });
      return result;
    }
    const slices = await this.prisma.tradeCloseSlice.findMany({
      where: {
        trade: { accountId: { in: ids }, accountMode: mode, ...(symbol ? { symbol } : {}) },
        OR: [{ occurredAt: { lte: new Date(dates.at(-1)!) } }, { occurredAt: null }],
      },
      select: {
        occurredAt: true,
        currency: true,
        quantity: true,
        netRealizedPnl: true,
        costEstimated: true,
        allocations: { select: { originalCost: true, allocatedBuyCharges: true } },
      },
      orderBy: { occurredAt: 'asc' },
    });
    let complete = !slices.some((slice) => slice.occurredAt === null);
    const dated = slices.filter((slice) => slice.occurredAt !== null);
    const totals = new Map<Currency, Prisma.Decimal>();
    let index = 0;
    for (const date of dates) {
      while (index < dated.length && dated[index]!.occurredAt!.getTime() <= date) {
        const summary = summarizeTradeRealizedPnl([dated[index]!]);
        complete &&= summary.complete;
        for (const item of summary.pnl) {
          totals.set(
            item.currency,
            (totals.get(item.currency) ?? new Prisma.Decimal(0)).plus(item.amount),
          );
        }
        index += 1;
      }
      result.set(date, {
        complete,
        pnl: [...totals].map(([currency, amount]) => ({ currency, amount: amount.toNumber() })),
      });
    }
    return result;
  }
}
