import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { DesiredProviderPolicyV3 } from '@thesis-ledger/schemas';
import type { PrismaService } from '../platform/prisma.service.js';
import { decodeMarketPolicyRoutes } from './market-policy-storage.js';

export function policyAttemptRoutes(stored: unknown, requestId: string, attemptId: string) {
  decodeMarketPolicyRoutes(stored);
  return { ...(stored as Record<string, unknown>), applyAttempt: { requestId, attemptId } };
}

export async function claimPolicyApplyAttempt(
  prisma: PrismaService,
  policy: DesiredProviderPolicyV3,
  storedRoutes: unknown,
) {
  const attemptId = randomUUID();
  const routes = policyAttemptRoutes(
    storedRoutes,
    policy.requestId,
    attemptId,
  ) as Prisma.InputJsonValue;
  return prisma.$transaction(async (transaction) => {
    const claimed = await transaction.desiredProviderPolicy.updateMany({
      where: { consumer: policy.consumer, revision: policy.revision },
      data: { routes, syncState: 'pending' },
    });
    if (claimed.count !== 1) return undefined;
    await transaction.desiredProviderPolicyRevision.update({
      where: { consumer_revision: { consumer: policy.consumer, revision: policy.revision } },
      data: { routes, syncState: 'pending' },
    });
    return attemptId;
  });
}
