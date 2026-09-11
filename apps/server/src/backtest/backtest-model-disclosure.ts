import { backtestExecutionModelSchema } from '@thesis-ledger/schemas';

/** Selection metadata only; frozen provenance belongs to the immutable result. */
export const withBacktestModelDisclosure = <T extends { input?: unknown } | null>(record: T) => {
  if (!record) return record;
  const input = record.input as { runConfig?: { executionModel?: unknown } } | null | undefined;
  const parsed = backtestExecutionModelSchema.safeParse(input?.runConfig?.executionModel);
  if (!parsed.success) return record;
  return { ...record, executionModelDisclosure: { model: parsed.data } };
};
