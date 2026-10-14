import { z } from 'zod';
import type { AiTool } from './contracts.js';

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
export type AiFrozenResearch = z.infer<typeof aiFrozenResearchSchema>;
export class AiFrozenResearchError extends Error {
  readonly errorCode = 'research_frozen_evidence_invalid';
}

export function readFrozenResearch(metadata: unknown) {
  if (
    metadata === null ||
    typeof metadata !== 'object' ||
    Array.isArray(metadata) ||
    !('frozenResearch' in metadata)
  )
    return null;
  const parsed = aiFrozenResearchSchema.safeParse(metadata.frozenResearch);
  if (!parsed.success) throw new AiFrozenResearchError('任务冻结证据格式无效');
  return parsed.data;
}
export function frozenResearchTool(frozen: AiFrozenResearch): AiTool {
  return {
    name: frozen.source.tool,
    permission: frozen.source.permission,
    execute: (_input, signal) => {
      if (signal.aborted) return Promise.reject(new DOMException('解读已取消', 'AbortError'));
      return Promise.resolve(structuredClone(frozen.source.evidence));
    },
  };
}
