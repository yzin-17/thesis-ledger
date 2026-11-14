import { z } from 'zod';
export const researchPublicSearchRequestSchema = z.strictObject({
  query: z.string().trim().min(1).max(500), limit: z.number().int().min(1).max(10),
  market: z.enum(['CN', 'HK', 'US']),
});
export const researchPublicSearchResultSchema = z.strictObject({
  status: z.enum(['ready', 'unavailable']), query: z.string(), provider: z.string().nullable(),
  market: z.enum(['CN', 'HK', 'US']), coverage: z.literal('last_year'),
  upstreamAttempts: z.number().int().nonnegative(),
  observedAt: z.iso.datetime({ offset: true }), reason: z.string().nullable(),
  items: z.array(z.strictObject({ title: z.string(), url: z.url(), snippet: z.string(), publishedAt: z.string().nullable() })).max(10),
});
