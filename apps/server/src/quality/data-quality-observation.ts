import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../platform/prisma.service.js';

const messages = {
  response_schema_invalid: '来源返回的数据格式或数值未通过校验',
  response_identity_mismatch: '来源返回的标的与请求不一致',
  response_contract_invalid: '来源返回的数据与请求合同不一致',
  calendar_invalid: '来源返回的交易日历无效',
  calendar_incomplete: '交易日历未覆盖实际请求范围',
} as const;

export type DataQualityObservation = {
  capability: string;
  provider: string;
  symbol?: string;
  scope?: string;
  code: keyof typeof messages;
};

/** 事务锁只合并同一未关闭问题，不改变业务数据或问题关闭状态。 */
export async function recordDataQualityObservation(
  prisma: PrismaService,
  input: DataQualityObservation,
) {
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify([
        input.capability,
        input.provider,
        input.symbol ?? null,
        input.code,
        input.scope ?? null,
      ]),
    )
    .digest('hex');
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${fingerprint}, 0))`;
      const existing = await tx.dataQualityIssue.findFirst({
        where: {
          capability: input.capability,
          provider: input.provider,
          symbol: input.symbol ?? null,
          code: input.code,
          status: { in: ['open', 'acknowledged'] },
          details: { path: ['fingerprint'], equals: fingerprint },
        },
        orderBy: [{ detectedAt: 'desc' }, { id: 'desc' }],
      });
      const now = new Date();
      const previous = existing?.details as Record<string, unknown> | undefined;
      const count = previous?.occurrences;
      const occurrences =
        typeof count === 'number' && Number.isSafeInteger(count) && count >= 1 ? count + 1 : 1;
      const details = {
        fingerprint,
        message: messages[input.code],
        ...(input.scope ? { scope: input.scope } : {}),
        occurrences,
        firstSeenAt: existing?.detectedAt.toISOString() ?? now.toISOString(),
        lastSeenAt: now.toISOString(),
      } satisfies Prisma.InputJsonObject;
      if (existing) {
        const result = await tx.dataQualityIssue.updateMany({
          where: { id: existing.id, status: { in: ['open', 'acknowledged'] } },
          data: { details },
        });
        if (result.count === 1) return { id: existing.id, created: false, occurrences };
      }
      const issue = await tx.dataQualityIssue.create({
        data: {
          capability: input.capability,
          provider: input.provider,
          symbol: input.symbol ?? null,
          code: input.code,
          severity: input.code === 'calendar_incomplete' ? 'warning' : 'error',
          detectedAt: now,
          details: { ...details, occurrences: 1, firstSeenAt: now.toISOString() },
        },
      });
      return { id: issue.id, created: true, occurrences: 1 };
    },
    { maxWait: 1000, timeout: 2000 },
  );
}
