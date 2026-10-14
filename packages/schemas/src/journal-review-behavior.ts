import { z } from 'zod';

export const journalBehaviorEvidenceSchema = z
  .object({
    code: z.enum([
      'ENTRY_PRICE_DEVIATION',
      'EXIT_PRICE_DEVIATION',
      'HOLDING_PERIOD_DEVIATION',
      'STOP_EXIT_DEVIATION',
    ]),
    status: z.enum(['DEVIATION', 'NO_DEVIATION', 'INSUFFICIENT_EVIDENCE']),
    metricKeys: z.array(z.string().min(1)).min(1),
    missingEvidence: z.array(z.string().min(1)),
  })
  .strict()
  .refine(
    (value) => (value.status === 'INSUFFICIENT_EVIDENCE') === value.missingEvidence.length > 0,
    '行为状态与缺失证据不一致',
  );
