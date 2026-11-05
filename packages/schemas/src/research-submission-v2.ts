import { z } from 'zod';
import { aiRunStatusSchema } from './ai.js';
import { researchScopeSnapshotV2Schema } from './research-scope-v2.js';

/** 提交/找回/取消只返回执行收据；报告与材料由范围隔离的读接口提供。 */
export const researchSubmissionReceiptV2Schema = z.strictObject({
  version: z.literal(2),
  runId: z.uuid(),
  submissionId: z.uuid(),
  status: aiRunStatusSchema,
  reused: z.boolean(),
  scopeSnapshot: researchScopeSnapshotV2Schema,
});
export type ResearchSubmissionReceiptV2 = z.infer<typeof researchSubmissionReceiptV2Schema>;
export const researchCapabilitiesV2Schema = z.strictObject({
  version: z.literal('research-capabilities-v2'),
  canCreate: z.boolean(),
  scopes: z
    .array(z.enum(['instrument', 'portfolio', 'account', 'position', 'strategy']))
    .min(1)
    .max(5)
    .refine((values) => new Set(values).size === values.length),
});
