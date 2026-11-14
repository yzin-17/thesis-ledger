import { z } from 'zod';
import { arenaBudgetSchema } from './model-arena.js';

export const arenaLiveRemainingBudgetSchema = z.strictObject({
  requests: arenaBudgetSchema.shape.requests.nullable(),
  tokens: arenaBudgetSchema.shape.tokens.nullable(),
  costMicros: arenaBudgetSchema.shape.costMicros.nullable(),
});
export const arenaLiveBudgetSchema = arenaLiveRemainingBudgetSchema.extend({
  requests: arenaLiveRemainingBudgetSchema.shape.requests.default(null),
  tokens: arenaLiveRemainingBudgetSchema.shape.tokens.default(null),
  costMicros: arenaLiveRemainingBudgetSchema.shape.costMicros.default(null),
}).default(() => ({ requests: null, tokens: null, costMicros: null }));
export type ArenaLiveBudget = z.infer<typeof arenaLiveBudgetSchema>;
