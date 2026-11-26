import { z } from 'zod';

export const aiFrozenResearchSchema = z
  .object({
    version: z.literal('frozen-research-v1'),
    prompt: z.object({ version: z.string().min(1), template: z.string().min(1) }).strict(),
    source: z
      .object({
        tool: z.string().min(1),
        permission: z.enum([
          'market:read',
          'portfolio:read',
          'strategy:read',
          'risk:read',
          'journal:read',
        ]),
        evidence: z
          .object({
            sourceId: z.string().min(1),
            provider: z.string().min(1),
            fetchedAt: z.iso.datetime({ offset: true }),
            data: z.unknown(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();
export class AiFrozenResearchError extends Error {
  readonly errorCode = 'research_frozen_evidence_invalid';
}
