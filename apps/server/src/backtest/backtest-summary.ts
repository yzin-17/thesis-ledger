import type { Prisma } from '@prisma/client';

export const backtestJobSummarySelect = {
  id: true,
  strategyVersionId: true,
  status: true,
  progress: true,
  periodStart: true,
  periodEnd: true,
  dataAsOf: true,
  warnings: true,
  cancelRequestedAt: true,
  executionAttempt: true,
  dispatchedAt: true,
  errorCode: true,
  errorSummary: true,
  createdAt: true,
  updatedAt: true,
  startedAt: true,
  finishedAt: true,
  engineVersion: true,
  resultChecksum: true,
  input: true,
} satisfies Prisma.BacktestJobSelect;

type BacktestJobSummaryRecord = Prisma.BacktestJobGetPayload<{
  select: typeof backtestJobSummarySelect;
}>;

export type BacktestJobSummary = Omit<BacktestJobSummaryRecord, 'input'> & {
  initialCash: number | null;
};

export const toBacktestJobSummary = (record: BacktestJobSummaryRecord): BacktestJobSummary => {
  const { input, ...summary } = record;
  const initialCash =
    input && typeof input === 'object' && !Array.isArray(input) && 'initialCash' in input
      ? Number(input.initialCash)
      : Number.NaN;
  Reflect.deleteProperty(summary, 'result');
  return {
    ...summary,
    initialCash: Number.isFinite(initialCash) ? initialCash : null,
  };
};
