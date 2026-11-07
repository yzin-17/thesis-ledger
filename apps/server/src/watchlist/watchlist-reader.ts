import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { watchlistPageQuerySchema, watchlistPageSchema } from '@thesis-ledger/schemas';
import { InstrumentDisplayService } from '../market/instruments/instrument-display.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import { identitySelection } from './watchlist.repository.js';

@Injectable()
export class WatchlistReader {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(InstrumentDisplayService) private readonly names: InstrumentDisplayService,
  ) {}

  async read(ownerId: string, raw: unknown) {
    const { group, market, instrumentType, offset, limit } = watchlistPageQuerySchema.parse(raw);
    const result = await this.db.$transaction(
      async (tx) => {
        const groups = await tx.watchlistGroup.findMany({
          where: { ownerId },
          select: { id: true, name: true },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
        });
        if (group && group !== 'ungrouped' && !groups.some((g) => g.id === group))
          throw new NotFoundException('分组不存在');
        const state = await tx.watchlist.findUnique({
          where: { ownerId },
          select: { revision: true },
        });
        const rows = await tx.watchlistItem.findMany({
          where: {
            ownerId,
            ...(group ? { groupId: group === 'ungrouped' ? null : group } : {}),
            instrument: { ...(market && { market }), ...(instrumentType && { instrumentType }) },
          },
          select: {
            id: true,
            groupId: true,
            order: true,
            pinned: true,
            addedAt: true,
            instrument: { select: identitySelection },
          },
          orderBy: [{ pinned: 'desc' }, { order: 'asc' }, { id: 'asc' }],
          skip: offset,
          take: limit + 1,
        });
        return {
          groups,
          revision: state?.revision ?? 0,
          rows: rows.slice(0, limit),
          nextOffset: rows.length > limit ? offset + limit : null,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
    const symbols = result.rows.map(
      (row) => row.instrument.canonicalCode + '.' + row.instrument.market,
    );
    const names = await this.names.resolve(symbols);
    return watchlistPageSchema.parse({
      groups: result.groups,
      revision: result.revision,
      nextOffset: result.nextOffset,
      items: result.rows.map((row, i) => ({
        ...row,
        displayName: names.name(symbols[i]!),
        addedAt: row.addedAt.toISOString(),
      })),
    });
  }
}
