import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { PerformancePnlQuery, PerformancePnlResponse } from '@thesis-ledger/schemas';
import { TradeRealizedPnlHistoryService } from '../ledger/trade-realized-pnl-history.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import { PerformanceDataService } from './performance-data.service.js';
import { currentInstrumentRealizedPnl, projectInstrumentSnapshotPnl } from './performance-instrument-pnl.js';
import {
  pnlSnapshotAccountIds,
  projectSnapshotPnl,
  type PnlSnapshot,
} from './performance-pnl-projection.js';

@Injectable()
export class PerformancePnlSeriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly data: PerformanceDataService,
    private readonly realized: TradeRealizedPnlHistoryService,
  ) {}

  async series(input: PerformancePnlQuery, now = new Date()): Promise<PerformancePnlResponse> {
    const cutoff = input.asOf ? new Date(input.asOf) : now;
    if (cutoff > now) throw new BadRequestException('盈亏读取截止时间不能晚于当前时间');
    if (
      input.accountId &&
      !(await this.data.accountCurrencies(input.accountId, input.mode)).has(input.accountId)
    )
      throw new NotFoundException('当前模式下找不到该账户');
    let start: Date | undefined;
    if (input.range === 'YTD') {
      const year = new Intl.DateTimeFormat('en', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
      }).format(cutoff);
      start = new Date(`${year}-01-01T00:00:00+08:00`);
    } else if (input.range !== 'ALL') {
      const days = { '1M': 31, '3M': 93, '1Y': 366 }[input.range];
      start = new Date(cutoff.getTime() - days * 86_400_000);
    }
    const rows = await this.prisma.portfolioSnapshot.findMany({
      where: {
        accountId: input.accountId ?? null,
        mode: input.mode,
        source: 'DAILY_CLOSE',
        status: 'VALID',
        supersededBy: null,
        capturedAt: { ...(start ? { gte: start } : {}), lte: cutoff },
      },
      orderBy: { capturedAt: 'desc' },
      take: 2001,
    });
    const snapshots = rows.slice(0, 2000).reverse();
    const groups = new Map<string, { ids: string[]; snapshots: PnlSnapshot[] }>();
    for (const snapshot of snapshots) {
      const ids = pnlSnapshotAccountIds(snapshot);
      if (ids === null) continue;
      const key = ids.join(',');
      const group = groups.get(key) ?? { ids, snapshots: [] };
      group.snapshots.push(snapshot);
      groups.set(key, group);
    }
    const summaries = new Map<
      string,
      Awaited<ReturnType<TradeRealizedPnlHistoryService['atTimes']>>
    >();
    await Promise.all(
      [...groups].map(async ([key, group]) => {
        summaries.set(
          key,
          await this.realized.atTimes(
            group.ids,
            input.mode,
            group.snapshots.map((row) => row.capturedAt),
            input.symbol,
          ),
        );
      }),
    );
    let currentRealizedPnl: number | null = null;
    if (input.symbol) {
      const accounts = await this.data.accountCurrencies(input.accountId, input.mode);
      const current = await this.realized.atTimes([...accounts.keys()], input.mode, [cutoff], input.symbol);
      currentRealizedPnl = currentInstrumentRealizedPnl(current.get(cutoff.getTime()), input.baseCurrency);
    }
    return {
      mode: input.mode,
      accountId: input.accountId ?? null,
      ...(input.symbol ? { symbol: input.symbol, currentRealizedPnl } : {}),
      ...(input.asOf ? { asOf: input.asOf } : {}),
      currency: input.baseCurrency,
      range: input.range,
      basis: 'REALIZED_PLUS_UNREALIZED',
      historyStart: snapshots[0]?.capturedAt.toISOString() ?? null,
      truncated: rows.length > 2000,
      points: snapshots.map((snapshot) => {
        const ids = pnlSnapshotAccountIds(snapshot);
        const realized =
          ids === null
            ? undefined
            : summaries.get(ids.join(','))?.get(snapshot.capturedAt.getTime());
        return input.symbol
          ? projectInstrumentSnapshotPnl(snapshot, realized, input.baseCurrency, input.symbol)
          : projectSnapshotPnl(snapshot, realized, input.baseCurrency);
      }),
    };
  }
}
