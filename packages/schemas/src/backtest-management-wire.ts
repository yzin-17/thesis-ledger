import { z } from 'zod';
import { backtestRunResponseSchemaV3, backtestRunStatusSchema } from './backtest-run.js';
import { resultReadEligibilitySchema } from './strategy-optimization.js';
export const backtestRunIdReadSchema = z.string().min(1);
const metadata = {
  progress: z.number().min(0).max(100).nullable().optional(),
  executionAttempt: z.number().int().nonnegative().optional(),
  attempt: z.number().int().nonnegative().optional(),
  readEligibility: resultReadEligibilitySchema.optional(),
  resultChecksum: z.string().nullable().optional(),
  resultMetrics: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  dataAsOf: z.string().optional(),
};
export const backtestRunSummaryReadSchema = z
  .object({
    id: backtestRunIdReadSchema,
    strategyVersionId: backtestRunIdReadSchema,
    mode: z.literal('V3'),
    status: backtestRunStatusSchema,
    ...metadata,
  })
  .passthrough();
export const backtestRunListReadSchema = z.array(backtestRunSummaryReadSchema).max(100);
export const backtestRunDetailReadSchema = backtestRunResponseSchemaV3
  .safeExtend(metadata)
  .superRefine((run, context) => {
    const result = run.result;
    if (!result) return;
    if (
      run.status !== 'succeeded' ||
      result.runId !== run.id ||
      result.strategyVersionId !== run.strategyVersionId ||
      result.snapshotId !== run.snapshotId ||
      (run.resultChecksum && result.resultChecksum !== run.resultChecksum)
    )
      context.addIssue({
        code: 'custom',
        path: ['result'],
        message: '结果必须属于当前成功 Run、策略版本与冻结快照。',
      });
  });
export type BacktestRunSummaryRead = z.infer<typeof backtestRunSummaryReadSchema>;
export type BacktestRunDetailRead = z.infer<typeof backtestRunDetailReadSchema>;
