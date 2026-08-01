import { z } from 'zod';

export const aiCitationSchema = z.object({
  tool: z.string(),
  sourceId: z.string(),
  provider: z.string(),
  observedAt: z.iso.datetime({ offset: true }),
  marketTime: z.iso.datetime({ offset: true }).optional(),
  availableAt: z.iso.datetime({ offset: true }).optional(),
  fetchedAt: z.iso.datetime({ offset: true }).optional(),
});

export const aiContextSchema = z.object({
  scope: z.enum(['portfolio', 'account', 'position', 'strategy']),
  portfolioId: z.string().optional(),
  accountId: z.string().optional(),
  symbol: z.string().optional(),
  strategyVersionId: z.string().optional(),
});

export const aiToolCallSchema = z.object({
  tool: z.string(),
  permission: z.string(),
  status: z.enum(['ok', 'unavailable', 'denied']),
  inputSummary: z.string(),
  outputSummary: z.string().optional(),
  provider: z.string().optional(),
  marketTime: z.iso.datetime({ offset: true }).optional(),
  availableAt: z.iso.datetime({ offset: true }).optional(),
  fetchedAt: z.iso.datetime({ offset: true }).optional(),
});

export const aiAnalysisSchema = z.object({
  conclusion: z.string(),
  evidence: z.array(z.object({ claim: z.string(), citations: z.array(aiCitationSchema).min(1) })),
  risks: z.array(z.string()),
  unknowns: z.array(z.string()),
  disclaimer: z.string(),
  context: aiContextSchema.optional(),
  toolCalls: z.array(aiToolCallSchema).optional(),
});
