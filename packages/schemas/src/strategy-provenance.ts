import { z } from 'zod';

export const strategyVersionProvenanceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('manual') }).strict(),
  z.object({ kind: z.literal('experiment'), referenceId: z.string().uuid() }).strict(),
  z.object({ kind: z.literal('ai_assisted'), referenceId: z.string().uuid() }).strict(),
  z.object({ kind: z.literal('unknown') }).strict(),
]);
export type StrategyVersionProvenance = z.infer<typeof strategyVersionProvenanceSchema>;
