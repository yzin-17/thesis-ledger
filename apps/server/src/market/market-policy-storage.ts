import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  desiredProviderPolicyV3Schema,
  effectiveProviderPolicyV3Schema,
  marketRouteKeyIdV3,
  type DesiredProviderPolicyV3,
} from '@thesis-ledger/schemas';
import type { PrismaService } from '../platform/prisma.service.js';

export type MarketPolicyPayload = DesiredProviderPolicyV3;
export type MarketPolicyRoutes = DesiredProviderPolicyV3['routes'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const buildMarketPolicyPayload = (input: unknown, revision: number): MarketPolicyPayload => {
  const raw = isRecord(input) ? input : {};
  return desiredProviderPolicyV3Schema.parse({
    ...raw,
    consumer: raw.consumer ?? 'thesis-ledger',
    requestId: raw.requestId ?? randomUUID(),
    revision: raw.revision ?? revision,
  });
};

export const decodeMarketPolicyRoutes = (storedRoutes: unknown): MarketPolicyRoutes => {
  if (
    !isRecord(storedRoutes) ||
    storedRoutes.storageVersion !== 3 ||
    'legacyV2Routes' in storedRoutes ||
    'routesV3' in storedRoutes
  ) {
    throw new ConflictException('Policy routes 存储格式不是当前版本');
  }
  const parsed = desiredProviderPolicyV3Schema.shape.routes.safeParse(storedRoutes.routes);
  if (!parsed.success) throw new ConflictException('Policy routes 存储格式不是当前版本');
  return parsed.data;
};

export const encodeMarketPolicyRoutes = (routes: MarketPolicyRoutes) => ({
  storageVersion: 3 as const,
  routes: desiredProviderPolicyV3Schema.shape.routes.parse(routes),
});

export const marketPolicyResponse = (row: Record<string, unknown>): Record<string, unknown> => {
  const effectiveResult = effectiveProviderPolicyV3Schema
    .nullable()
    .safeParse(row.effectiveProjection ?? null);
  if (!effectiveResult.success)
    throw new ConflictException('Policy Effective 存储格式不是当前版本');
  const effective = effectiveResult.data;
  const parsed = desiredProviderPolicyV3Schema.parse({
    contractVersion: 3,
    consumer: 'thesis-ledger',
    requestId: effective?.requestId ?? randomUUID(),
    revision: row.revision,
    enabled: row.enabled,
    routes: decodeMarketPolicyRoutes(row.routes),
  });
  const effectiveStale =
    row.syncState !== 'applied' ||
    !effective ||
    effective.sourceDesiredRevision !== parsed.revision ||
    effective.enabled !== parsed.enabled ||
    effective.routes.length !== parsed.routes.length ||
    !parsed.routes.every((route, index) => {
      const projection = effective.routes[index];
      return (
        projection &&
        marketRouteKeyIdV3(projection.key) === marketRouteKeyIdV3(route.key) &&
        projection.targets.length === route.targets.length &&
        route.targets.every((target, targetIndex) => {
          const projectedTarget = projection.targets[targetIndex];
          return (
            projectedTarget?.routeIndex === targetIndex &&
            projectedTarget.providerId === target.providerId &&
            projectedTarget.upstreamSource === target.upstreamSource
          );
        })
      );
    });
  const stored = isRecord(row.routes) ? row.routes : null;
  return {
    ...row,
    ...parsed,
    effectiveProjection: effective,
    effectiveStale,
    ...(stored && isRecord(stored.catalogAudit) ? { catalogAudit: stored.catalogAudit } : {}),
  };
};

export const removeProviderTargets = (routes: MarketPolicyRoutes, providerId: string) => {
  const normalizedProviderId = providerId.trim().toLowerCase();
  const nextRoutes: MarketPolicyRoutes = [];
  const routeDiff: Array<{
    key: MarketPolicyRoutes[number]['key'];
    previous: MarketPolicyRoutes[number]['targets'];
    next: MarketPolicyRoutes[number]['targets'];
  }> = [];
  for (const route of routes) {
    const nextTargets = route.targets.filter(
      (target) => target.providerId !== normalizedProviderId,
    );
    if (nextTargets.length !== route.targets.length) {
      routeDiff.push({ key: route.key, previous: route.targets, next: nextTargets });
    }
    if (nextTargets.length > 0) nextRoutes.push({ ...route, targets: nextTargets });
  }
  return { nextRoutes, routeDiff };
};

export const persistMarketPolicyRevision = async (
  prisma: PrismaService,
  policy: MarketPolicyPayload,
) =>
  prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw(Prisma.sql`
      SELECT "consumer" FROM "DesiredProviderPolicy"
      WHERE "consumer" = 'thesis-ledger'
      FOR UPDATE
    `);
    const current = await transaction.desiredProviderPolicy.findUniqueOrThrow({
      where: { consumer: 'thesis-ledger' },
      include: { history: { orderBy: { revision: 'desc' }, take: 20 } },
    });
    const currentRoutes = decodeMarketPolicyRoutes(current.routes);
    if (policy.revision < current.revision) throw new ConflictException('Policy revision 不能回退');
    if (policy.revision === current.revision) {
      if (
        current.enabled !== policy.enabled ||
        JSON.stringify(currentRoutes) !== JSON.stringify(policy.routes)
      ) {
        throw new ConflictException('相同 revision 的 Policy 内容不能冲突');
      }
      return current;
    }

    const routes = encodeMarketPolicyRoutes(policy.routes);
    const lastError = {
      code: 'policy_not_applied',
      message: 'Policy 等待精确 Route Capability 目录验证',
    };
    return transaction.desiredProviderPolicy.update({
      where: { consumer: 'thesis-ledger' },
      data: {
        revision: policy.revision,
        enabled: policy.enabled,
        routes,
        syncState: 'rejected',
        lastError,
        syncedAt: null,
        dsaRevision: null,
        effectiveProjection: current.effectiveProjection ?? Prisma.JsonNull,
        history: {
          create: {
            revision: policy.revision,
            enabled: policy.enabled,
            routes,
            syncState: 'rejected',
            lastError,
            effectiveProjection: current.effectiveProjection ?? Prisma.JsonNull,
          },
        },
      },
      include: { history: { orderBy: { revision: 'desc' }, take: 20 } },
    });
  });
