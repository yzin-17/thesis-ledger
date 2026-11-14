import { z } from 'zod';

export const optimizationRetryRequestSchema = z
  .object({
    idempotencyKey: z.string().trim().min(1).max(200),
    expectedExecutionAttempt: z.number().int().nonnegative(),
  })
  .strict();
export type OptimizationRetryRequest = z.infer<typeof optimizationRetryRequestSchema>;

export const optimizationRetryStateSchema = z
  .object({
    roundOffset: z.number().int().nonnegative().default(0),
    allowedUnknownAttemptIds: z.array(z.uuid()).default([]),
    history: z
      .array(
        z
          .object({
            idempotencyKey: z.string().min(1),
            executionAttempt: z.number().int().nonnegative(),
            failedAt: z.string(),
            requestedAt: z.string(),
            stopReason: z.string().nullable(),
            roundOffset: z.number().int().nonnegative(),
            allowedUnknownAttemptIds: z.array(z.uuid()),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();

export function canRetryOptimizationExperiment(experiment: {
  status: string;
  lockedCandidateIds?: readonly string[] | null | undefined;
}) {
  return experiment.status === 'failed' && !experiment.lockedCandidateIds?.length;
}
