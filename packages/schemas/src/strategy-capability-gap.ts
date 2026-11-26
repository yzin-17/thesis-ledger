import { z } from 'zod';

/** 不能精确执行的原构思单独保存，不能带部分策略或被静默改成近似候选。 */
export const strategyCapabilityGapSchema = z.strictObject({
  status: z.literal('unsupported'),
  originalRule: z.string().trim().min(1).max(4000),
  reason: z.string().trim().min(1).max(2000),
  gaps: z
    .array(
      z.strictObject({
        path: z.string().trim().min(1).max(240),
        kind: z.enum(['expression', 'data', 'execution', 'scope']),
        detail: z
          .string()
          .trim()
          .min(1)
          .max(2000)
          .describe(
            '指出完成原规则必需但当前确实缺少的能力或输入；没有要求的可选委托／保护不是能力缺口。',
          ),
      }),
    )
    .min(1)
    .max(32),
  supportedParts: z.array(z.string().trim().min(1).max(1000)).max(32),
  evidenceRefs: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
});
export type StrategyCapabilityGap = z.infer<typeof strategyCapabilityGapSchema>;
export function isStrategyCapabilityGap(value: unknown): value is StrategyCapabilityGap {
  return strategyCapabilityGapSchema.safeParse(value).success;
}
