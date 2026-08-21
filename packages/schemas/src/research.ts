import { z } from 'zod';

export const researchEvidenceSchema = z.object({
  claim: z.string(),
  source: z.string(),
  observedAt: z.iso.datetime({ offset: true }).optional(),
});

export const researchResultSchema = z.object({
  version: z.literal(1),
  provider: z.string().min(1),
  symbol: z.string().optional(),
  conclusion: z.string(),
  score: z.number().min(0).max(100).optional(),
  signals: z.array(z.string()),
  risks: z.array(z.string()),
  evidence: z.array(researchEvidenceSchema),
  createdAt: z.iso.datetime({ offset: true }),
});

export type ResearchResultV1 = z.infer<typeof researchResultSchema>;
