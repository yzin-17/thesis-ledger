import type { Prisma } from '@prisma/client';
import type { ExecutionModelDisclosure, ResultReadEligibility } from '@thesis-ledger/schemas';
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
  result: true,
  runConfig: true,
  snapshotManifest: true,
} satisfies Prisma.BacktestJobSelect;

type BacktestJobSummaryRecord = Prisma.BacktestJobGetPayload<{
  select: typeof backtestJobSummarySelect;
}>;

export type BacktestJobSummary = Omit<
  BacktestJobSummaryRecord,
  'input' | 'result' | 'runConfig' | 'snapshotManifest'
> & {
  initialCash: number | null;
  resultMetrics: Record<string, unknown> | null;
  readEligibility?: ResultReadEligibility;
  executionModelDisclosure?: ExecutionModelDisclosure;
};

const resultMetrics = (result: Prisma.JsonValue | null): Record<string, unknown> | null => {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  const metrics = result.metrics;
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return null;
  return metrics;
};

export const toBacktestJobSummary = (record: BacktestJobSummaryRecord): BacktestJobSummary => {
  const {
    input,
    result,
    runConfig: storedConfig,
    snapshotManifest,
    ...summary
  } = withBacktestModelDisclosure(record);
  void storedConfig;
  void snapshotManifest;
  const currentInput = input && typeof input === 'object' && !Array.isArray(input) ? input : null;
  const config = currentInput?.runConfig as
    | {
        baseCurrency?: string;
        initialCash?: Record<string, string>;
      }
    | undefined;
  const initialCashValue = config?.baseCurrency
    ? config.initialCash?.[config.baseCurrency]
    : undefined;
  const initialCash = Number(initialCashValue);
  return {
    ...summary,
    initialCash: Number.isFinite(initialCash) ? initialCash : null,
    resultMetrics: resultMetrics(result),
  };
};
