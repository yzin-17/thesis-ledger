import { z } from 'zod';

/** User preference, deliberately separate from the SDK's concrete generation mode. */
export const aiOutputPolicySchema = z.enum(['auto', 'manual']);
export type AiOutputPolicy = z.infer<typeof aiOutputPolicySchema>;

export const aiProviderValidationAuthorizationSchema = z
  .object({
    operationId: z.uuid(),
    planFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    authorized: z.literal(true),
    maxCalls: z.number().int().min(0).max(24),
    allowTextFallback: z.boolean().default(false),
  })
  .strict();
export type AiProviderValidationAuthorization = z.infer<
  typeof aiProviderValidationAuthorizationSchema
>;

export const aiProviderValidationPlanSchema = z
  .object({
    planFingerprint: z.string(),
    pending: z.array(
      z.object({ model: z.string(), purpose: z.string(), policy: aiOutputPolicySchema }).strict(),
    ),
    maxCalls: z.number().int().nonnegative(),
    maxOutputTokensPerCall: z.number().int().positive(),
    maxDurationSeconds: z.number().int().positive(),
    estimatedCosts: z.array(z.object({ currency: z.string(), amount: z.string() }).strict()),
  })
  .strict();
export type AiProviderValidationPlan = z.infer<typeof aiProviderValidationPlanSchema>;
