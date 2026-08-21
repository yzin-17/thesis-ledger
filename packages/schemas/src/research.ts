import { z } from 'zod';
import { aiAnalysisSchema } from './ai.js';

export const researchResultSchema = aiAnalysisSchema.extend({
  version: z.literal(1),
  provider: z.string().min(1),
  symbol: z.string().optional(),
  score: z.number().min(0).max(100).optional(),
  signals: z.array(z.string()).default([]),
  createdAt: z.iso.datetime({ offset: true }),
});

export type ResearchResultV1 = z.infer<typeof researchResultSchema>;
