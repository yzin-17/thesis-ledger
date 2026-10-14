import { z } from 'zod';
import {
  marketStatusCompositionV1Schema,
  evaluateStatusCompositionV1,
} from './market-status-composition-v1.js';

export const statusCompositionFreezeVersionV1 = 'frozen-status-composition-v1' as const;
export const statusCompositionArtifactKeyV1 = 'metadata/status-composition-v1.parquet' as const;
export const backtestStatusCompositionRefV1Schema = z.strictObject({
  artifactKey: z.string().min(1),
  freezeVersion: z.literal(statusCompositionFreezeVersionV1),
});
export const backtestStatusCompositionV1Schema = z
  .strictObject({
    freezeVersion: z.literal(statusCompositionFreezeVersionV1),
    runConfigChecksum: z.string().regex(/^[a-f0-9]{64}$/),
    frozenAt: z.iso.datetime({ offset: true }),
    composition: marketStatusCompositionV1Schema,
    adoption: z.strictObject({
      policy: z.literal('known-suspensions-only-v1'),
      suspendedDates: z.array(z.iso.date()),
      observedAfterPriceCutoff: z.boolean(),
    }),
  })
  .superRefine((value, context) => {
    const evaluation = evaluateStatusCompositionV1(value.composition.entries);
    if (
      evaluation.blockedCapabilities.length ||
      JSON.stringify(evaluation.suspendedDates) !== JSON.stringify(value.adoption.suspendedDates)
    )
      context.addIssue({ code: 'custom', message: '采用事实与组合需求不一致' });
    if (
      value.composition.entries.some(
        (item) =>
          item.status === 'included' &&
          Date.parse(item.result.clock.observedAt) > Date.parse(value.frozenAt),
      )
    )
      context.addIssue({ code: 'custom', message: '实际观察晚于冻结时间' });
  });
export type BacktestStatusCompositionV1 = z.infer<typeof backtestStatusCompositionV1Schema>;
