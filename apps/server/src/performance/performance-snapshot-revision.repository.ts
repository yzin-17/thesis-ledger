import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../platform/prisma.service.js';
import {
  snapshotMode,
  type PerformanceSnapshot,
  type PortfolioMode,
  type SnapshotSource,
  type SnapshotValuationBasis,
} from './performance-types.js';

export class PerformanceSnapshotRevisionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async appendCurrent(input: {
    slotKey: string;
    idempotencyKey: string;
    valuationBasis: SnapshotValuationBasis;
    data: Omit<Prisma.PortfolioSnapshotUncheckedCreateInput, 'revision'>;
  }) {
    const existing = await this.prisma.portfolioSnapshot.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return existing;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const previous = await this.prisma.portfolioSnapshot.findFirst({
        where: { slotKey: input.slotKey, status: 'VALID' },
        orderBy: { revision: 'desc' },
      });
      if (previous?.valuationBasis === 'OFFICIAL' && input.valuationBasis === 'ESTIMATED') {
        return previous;
      }
      try {
        const data: Prisma.PortfolioSnapshotUncheckedCreateInput = {
          ...input.data,
          revision: (previous?.revision ?? 0) + 1,
          ...(previous ? { supersedesSnapshotId: previous.id } : {}),
        };
        return await this.prisma.portfolioSnapshot.create({ data });
      } catch (error) {
        if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2002')
          throw error;
        const raced = await this.prisma.portfolioSnapshot.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (raced) return raced;
      }
    }
    throw new Error('快照修订并发冲突，请稍后重试');
  }

  current<T extends PerformanceSnapshot>(snapshots: T[]) {
    const current = new Map<string, T>();
    for (const snapshot of snapshots) {
      if (snapshot.status === 'INVALID') continue;
      const key =
        snapshot.slotKey ??
        `${snapshot.accountId ?? 'portfolio'}:${snapshotMode(snapshot)}:${snapshot.capturedAt.toISOString()}`;
      const existing = current.get(key);
      if (!existing || (snapshot.revision ?? 1) > (existing.revision ?? 1)) {
        current.set(key, snapshot);
      }
    }
    return [...current.values()].sort(
      (left, right) => left.capturedAt.getTime() - right.capturedAt.getTime(),
    );
  }

  async list(filters: {
    accountId?: string;
    scope?: 'account' | 'portfolio';
    mode?: PortfolioMode;
    source?: SnapshotSource;
    valuationBasis?: SnapshotValuationBasis;
    start?: string;
    end?: string;
  }) {
    let accountFilter = {};
    if (filters.scope === 'portfolio') accountFilter = { accountId: null };
    else if (filters.accountId) accountFilter = { accountId: filters.accountId };
    const rows = await this.prisma.portfolioSnapshot.findMany({
      where: {
        ...(filters.scope ? { scope: filters.scope } : {}),
        ...accountFilter,
        ...(filters.mode ? { mode: filters.mode } : {}),
        ...(filters.source ? { source: filters.source } : {}),
        ...(filters.valuationBasis ? { valuationBasis: filters.valuationBasis } : {}),
        ...(filters.start || filters.end
          ? {
              capturedAt: {
                ...(filters.start ? { gte: new Date(filters.start) } : {}),
                ...(filters.end ? { lte: new Date(filters.end) } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ capturedAt: 'desc' }, { revision: 'desc' }],
      take: 500,
    });
    return this.current(rows as PerformanceSnapshot[]).map((row) => ({
      ...row,
      snapshotAt: row.capturedAt,
    }));
  }

  async detail(id: string) {
    const snapshot = await this.prisma.portfolioSnapshot.findUnique({ where: { id } });
    if (!snapshot) return null;
    const revisions = await this.prisma.portfolioSnapshot.findMany({
      where: { slotKey: snapshot.slotKey },
      orderBy: { revision: 'asc' },
    });
    return { ...snapshot, snapshotAt: snapshot.capturedAt, revisions };
  }

  pendingEstimates(limit: number) {
    return this.prisma.portfolioSnapshot.findMany({
      where: {
        source: 'DAILY_CLOSE',
        valuationBasis: 'ESTIMATED',
        status: 'VALID',
        supersededBy: null,
      },
      orderBy: [{ valuationDate: 'asc' }, { accountId: 'asc' }],
      take: limit,
    });
  }
}
