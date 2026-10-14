import { z } from 'zod';
import { marketPublicFeesResponseV3Schema } from './market-public-fees-v3.js';

export const publicFeesCompositionVersionV3 = 'public-fees-model-v1' as const;
export const publicFeesArtifactKeyV3 = 'metadata/public-fees-v3.parquet' as const;
const text = z.string().trim().min(1);
export const backtestPublicFeesDisclosureV3Schema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('source'),
    response: marketPublicFeesResponseV3Schema,
    fallbackReason: text.optional(),
  }),
  z.strictObject({ status: z.literal('executionModel'), reason: text }),
]);
export const backtestPublicFeesSnapshotRefV3Schema = z.strictObject({
  artifactKey: text,
  compositionVersion: z.literal(publicFeesCompositionVersionV3),
});
export const backtestPublicFeesSnapshotV3Schema = z.strictObject({
  compositionVersion: z.literal(publicFeesCompositionVersionV3),
  modelContentHash: z.string().regex(/^[a-f0-9]{64}$/),
  disclosure: backtestPublicFeesDisclosureV3Schema,
});
export type BacktestPublicFeesSnapshotV3 = z.infer<typeof backtestPublicFeesSnapshotV3Schema>;
export type BacktestPublicFeesDisclosureV3 = z.infer<typeof backtestPublicFeesDisclosureV3Schema>;
