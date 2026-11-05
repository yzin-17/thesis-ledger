import { Injectable, NotFoundException } from '@nestjs/common';
import type { TradeInstrumentsQuery, TradeInstrumentsResponse } from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { InstrumentDisplayService } from '../market/instruments/instrument-display.service.js';

@Injectable()
export class TradeInstrumentQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly display: InstrumentDisplayService,
  ) {}

  async list(query: TradeInstrumentsQuery): Promise<TradeInstrumentsResponse> {
    if (query.accountId) {
      const account = await this.prisma.account.findFirst({
        where: { id: query.accountId, mode: query.mode },
        select: { id: true },
      });
      if (!account) throw new NotFoundException('当前模式下找不到该账户');
    }
    const rows = await this.prisma.trade.groupBy({
      by: ['symbol'],
      where: {
        accountMode: query.mode,
        account: { mode: query.mode },
        ...(query.accountId ? { accountId: query.accountId } : {}),
      },
      orderBy: { symbol: 'asc' },
    });
    const names = await this.display.resolve(rows.map((row) => row.symbol));
    return {
      mode: query.mode,
      accountId: query.accountId ?? null,
      items: rows.map((row) => ({ symbol: row.symbol, displayName: names.name(row.symbol) })),
    };
  }
}
