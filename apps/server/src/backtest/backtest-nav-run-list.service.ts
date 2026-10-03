import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  backtestNavRunConfigV3Schema,
  backtestNavRunListV3Schema,
  backtestNavRunSummaryV3Schema,
  type BacktestNavRunSummaryV3,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { persistedContractVersion } from './backtest-v3-run-lifecycle.js';
import { canonicalizeManifest } from './backtest-snapshot.js';

const navRunListSelect = {
  id: true,
  strategyVersionId: true,
  mode: true,
  status: true,
  stage: true,
  progress: true,
  periodStart: true,
  periodEnd: true,
  errorCode: true,
  errorSummary: true,
  createdAt: true,
  updatedAt: true,
  input: true,
  runConfig: true,
} satisfies Prisma.BacktestJobSelect;

type NavRunListRecord = Prisma.BacktestJobGetPayload<{ select: typeof navRunListSelect }>;

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const toInstant = (value: Date): string | undefined =>
  Number.isFinite(value.getTime()) ? value.toISOString() : undefined;

const summaryFor = (row: NavRunListRecord): BacktestNavRunSummaryV3 | undefined => {
  const input = asRecord(row.input);
  if (
    row.mode !== 'V3' ||
    persistedContractVersion(row) !== 3 ||
    input?.inputKind !== 'nav'
  ) {
    return undefined;
  }

  const inputConfig = backtestNavRunConfigV3Schema.safeParse(input.runConfig);
  const storedConfig = backtestNavRunConfigV3Schema.safeParse(row.runConfig);
  if (
    !inputConfig.success ||
    !storedConfig.success ||
    canonicalizeManifest(inputConfig.data) !== canonicalizeManifest(storedConfig.data)
  ) {
    return undefined;
  }

  const periodStart = toInstant(row.periodStart);
  const periodEnd = toInstant(row.periodEnd);
  const createdAt = toInstant(row.createdAt);
  const updatedAt = toInstant(row.updatedAt);
  if (!periodStart || !periodEnd || !createdAt || !updatedAt) return undefined;
  if (
    row.periodStart.toISOString().slice(0, 10) !== inputConfig.data.startDate ||
    row.periodEnd.toISOString().slice(0, 10) !== inputConfig.data.endDate
  ) {
    return undefined;
  }

  const parsed = backtestNavRunSummaryV3Schema.safeParse({
    contractVersion: 3,
    inputKind: 'nav',
    id: row.id,
    strategyVersionId: row.strategyVersionId,
    symbol: inputConfig.data.navInput.symbol,
    status: row.status,
    stage: row.stage,
    progress: row.progress,
    periodStart,
    periodEnd,
    errorCode: row.errorCode,
    errorSummary: row.errorSummary,
    createdAt,
    updatedAt,
  });
  return parsed.success ? parsed.data : undefined;
};

@Injectable()
export class BacktestNavRunListService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(): Promise<BacktestNavRunSummaryV3[]> {
    const rows = await this.prisma.backtestJob.findMany({
      where: {
        mode: 'V3',
        AND: [
          { input: { path: ['contractVersion'], equals: 3 } },
          { input: { path: ['schemaVersion'], equals: '3' } },
          { input: { path: ['inputKind'], equals: 'nav' } },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
      select: navRunListSelect,
    });
    return backtestNavRunListV3Schema.parse(rows.flatMap((row) => {
      const summary = summaryFor(row);
      return summary ? [summary] : [];
    }));
  }
}
