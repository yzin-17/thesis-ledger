import { z } from 'zod';
import { strategyVersionProvenanceSchema } from './strategy-provenance.js';

const id = z.string().min(1);
const definition = z.record(z.string(), z.unknown());
export const strategyVersionReadSchema = z
  .object({
    id,
    strategyId: id.optional(),
    version: z.number().int().positive(),
    schema: definition.optional(),
    schemaVersion: z.number().int().positive().optional(),
    source: strategyVersionProvenanceSchema.nullable().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();
export const strategyDefinitionReadSchema = z
  .object({
    id,
    name: z.string(),
    description: z.string().nullable().optional(),
    status: z.string().optional(),
    schemaVersion: z.number().int().positive().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    versions: z.array(strategyVersionReadSchema),
  })
  .passthrough();
export const strategyDefinitionListSchema = z.array(strategyDefinitionReadSchema);
export const strategyDefinitionCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    schema: definition,
    description: z.string().max(2_000).optional(),
  })
  .strict();
export const strategyVersionCreateSchema = z.object({ schema: definition }).strict();
export type StrategyDefinitionRead = z.infer<typeof strategyDefinitionReadSchema>;
export type StrategyVersionRead = z.infer<typeof strategyVersionReadSchema>;
export type StrategyDefinitionCreate = z.infer<typeof strategyDefinitionCreateSchema>;
