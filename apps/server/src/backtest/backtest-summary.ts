import type { Prisma } from '@prisma/client';
import type { ExecutionModelDisclosure } from '@thesis-ledger/schemas';
import { withBacktestModelDisclosure } from './backtest-model-disclosure.js';

export const backtestJobSummarySelect = {
  id: true,
  strategyVersionId: true,
  mode: true,
  status: true,
  stage: true,
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
  snapshotId: true,
  diagnostics: true,
  input: true,
} satisfies Prisma.BacktestJobSelect;

type BacktestJobSummaryRecord = Prisma.BacktestJobGetPayload<{
  select: typeof backtestJobSummarySelect;
}>;

export type BacktestJobSummary = Omit<BacktestJobSummaryRecord, 'input'> & {
  initialCash: number | null;
  executionModelDisclosure?: ExecutionModelDisclosure;
};

export const toBacktestJobSummary = (record: BacktestJobSummaryRecord): BacktestJobSummary => {
  const { input, ...summary } = withBacktestModelDisclosure(record);
  let initialCashValue: unknown;
  if (input && typeof input === 'object' && !Array.isArray(input) && 'initialCash' in input) {
    initialCashValue = input.initialCash;
  } else if (input && typeof input === 'object' && !Array.isArray(input) && 'runConfig' in input) {
    const runConfig = input.runConfig as {
      baseCurrency?: 'CNY' | 'HKD' | 'USD';
      initialCash?: Partial<Record<'CNY' | 'HKD' | 'USD', string>>;
    };
    const initialCash = runConfig.initialCash;
    if (runConfig.baseCurrency && initialCash?.[runConfig.baseCurrency] !== undefined) {
      initialCashValue = initialCash[runConfig.baseCurrency];
    } else {
      initialCashValue = Object.values(initialCash ?? {}).find((amount) => amount !== undefined);
    }
  }
  const initialCash = Number(initialCashValue);
  Reflect.deleteProperty(summary, 'result');
  return {
    ...summary,
    initialCash: Number.isFinite(initialCash) ? initialCash : null,
  };
};
