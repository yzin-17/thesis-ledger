import { backtestExecutionModelSchemaV3 } from '@thesis-ledger/schemas';

/** Selection metadata only; frozen provenance belongs to the immutable result. */
export const withBacktestModelDisclosure = <T extends { input?: unknown } | null>(record: T) => {
  if (!record) return record;
  const input = record.input as { runConfig?: { executionModel?: unknown }; replayOfRunId?: unknown } | null | undefined;
  const metadata = typeof input?.replayOfRunId === 'string' ? { ...record, replayOfRunId: input.replayOfRunId } : record;
  const parsed = backtestExecutionModelSchemaV3.safeParse(input?.runConfig?.executionModel);
  if (!parsed.success) return metadata;
  return { ...metadata, executionModelDisclosure: { model: parsed.data } };
};
