import { randomUUID } from 'node:crypto';
import { type Prisma } from '@prisma/client';
import { expect } from 'vitest';
import { researchResultV2Schema, researchResultSchema } from '@thesis-ledger/schemas';
import { localIdentityPrincipal } from '../../src/identity/local-workspace.js';
import { useResearchPrivatePostgresFixture } from './research-private-postgres.fixture.js';

export const reportScope = { view: 'scoped', mode: 'shadow' };
export function useResearchReportFixture() {
  const ctx = useResearchPrivatePostgresFixture();
  return {
    ctx,
    async completed() {
      const saved = await ctx.harness.models.seed(localIdentityPrincipal()!.id);
      await ctx.harness.models.execute(saved.run.id);
      const row = await ctx.prisma.aiRun.findUniqueOrThrow({ where: { id: saved.run.id } });
      expect(row.status).toBe('succeeded');
      return { saved, row, result: researchResultV2Schema.parse(row.result) };
    },
    async legacy(withCall = true, context: object = { scope: 'portfolio', mode: 'actual' }) {
      const id = randomUUID(),
        callId = randomUUID();
      const result = researchResultSchema.parse({
        version: 1,
        provider: 'controlled-provider',
        createdAt: new Date().toISOString(),
        conclusion: '受控历史正文',
        evidence: [
          {
            claim: '受控历史证据',
            citations: [
              {
                ...(withCall ? { toolCallId: callId } : {}),
                tool: 'portfolioSnapshot',
                sourceId: 'controlled',
                provider: 'controlled-ledger',
                observedAt: new Date().toISOString(),
              },
            ],
          },
        ],
        risks: [],
        unknowns: [],
        disclaimer: '仅供研究',
      });
      await ctx.prisma.aiRun.create({
        data: {
          id,
          provider: 'controlled-provider',
          model: 'controlled-model',
          promptVersion: 'research-v1',
          status: 'succeeded',
          question: '受控历史问题',
          context: context as Prisma.InputJsonValue,
          result: result as Prisma.InputJsonValue,
        },
      });
      if (withCall)
        await ctx.prisma.aiToolCall.create({
          data: {
            id: callId,
            aiRunId: id,
            tool: 'portfolioSnapshot',
            permission: 'portfolio:read',
            status: 'ok',
            inputSummary: '{}',
            outputSummary: '受控审计',
            provider: 'controlled-ledger',
          },
        });
      return { id, callId, result };
    },
    get(path = '', query: Record<string, string | number> = reportScope, session?: string) {
      return ctx.harness.get('/research/reports' + path, query, session);
    },
  };
}
