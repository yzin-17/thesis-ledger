import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  researchReportToolsPageSchema,
  type ResearchReportToolsQuery,
} from '@thesis-ledger/schemas';

const cursorSchema = z.strictObject({
  version: z.literal(1),
  createdAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
  binding: z.string().regex(/^[a-f0-9]{64}$/u),
});

/** 只在报告身份及当前权限已于本事务授权后调用。 */
export async function readResearchReportTools(
  transaction: Prisma.TransactionClient,
  ownerId: string,
  runId: string,
  query: ResearchReportToolsQuery,
) {
  const { limit, cursor, ...locator } = query;
  const binding = createHash('sha256')
    .update(JSON.stringify({ ownerId, runId, locator }))
    .digest('hex');
  let after: { createdAt: Date; id: string } | undefined;
  if (cursor) {
    try {
      const value = cursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString()));
      if (value.binding !== binding) throw new Error('范围不一致');
      after = { createdAt: new Date(value.createdAt), id: value.id };
    } catch {
      throw new BadRequestException('工具审计游标无效或属于其他报告范围');
    }
  }
  const calls = await transaction.aiToolCall.findMany({
    where: {
      aiRunId: runId,
      ...(after
        ? {
            OR: [
              { createdAt: { gt: after.createdAt } },
              { createdAt: after.createdAt, id: { gt: after.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: limit + 1,
  });
  const items = calls.slice(0, limit),
    hasMore = calls.length > limit,
    tail = items.at(-1);
  return researchReportToolsPageSchema.parse({
    runId,
    items: items.map((call) => ({
      id: call.id,
      tool: call.tool,
      permission: call.permission,
      status: call.status,
      inputSummary: call.inputSummary,
      ...(call.outputSummary === null ? {} : { outputSummary: call.outputSummary }),
      ...(call.provider === null ? {} : { provider: call.provider }),
      ...(call.marketTime ? { marketTime: call.marketTime.toISOString() } : {}),
      ...(call.availableAt ? { availableAt: call.availableAt.toISOString() } : {}),
      ...(call.fetchedAt ? { fetchedAt: call.fetchedAt.toISOString() } : {}),
      createdAt: call.createdAt.toISOString(),
    })),
    hasMore,
    nextCursor:
      hasMore && tail
        ? Buffer.from(
            JSON.stringify({
              version: 1,
              createdAt: tail.createdAt.toISOString(),
              id: tail.id,
              binding,
            }),
          ).toString('base64url')
        : null,
  });
}
