import { z } from 'zod';

const count = z.number().int().nonnegative();
const path = z.array(z.union([z.string(), z.number().int().nonnegative()]));
export const backtestRuleDiagnosticsSchema = z.strictObject({
  version: z.literal('rule-evaluation-v1'),
  rules: z.array(z.strictObject({
    ruleId: z.string().min(1), path,
    observations: count, computableObservations: count, trueObservations: count,
    applicableDecisions: count, computableDecisions: count, warmupObservations: count,
    unavailableReasons: z.array(z.strictObject({
      code: z.enum(['RULE_INPUT_UNAVAILABLE', 'RULE_WARMUP', 'RULE_FACT_NOT_VISIBLE', 'OTHER_UNAVAILABLE']),
      reason: z.string(), count,
      samples: z.array(z.strictObject({ path, occurredAt: z.iso.datetime({ offset: true }), message: z.string() })).max(3),
    })).max(13),
  })).max(8),
});
