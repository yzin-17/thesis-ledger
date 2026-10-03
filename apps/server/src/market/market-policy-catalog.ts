import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  desiredProviderPolicyV3Schema,
  marketControlPolicyApplyResponseV3Schema,
  marketRouteCatalogV3Schema,
  marketRouteKeyIdV3,
  type DesiredProviderPolicyV3,
  type MarketRouteCatalogV3,
} from '@thesis-ledger/schemas';
import type { PrismaService } from '../platform/prisma.service.js';
import { DsaError, type DsaClient } from '../integration/dsa/dsa.client.js';
import { decodeMarketPolicyRoutes, marketPolicyResponse } from './market-policy-storage.js';
import { claimPolicyApplyAttempt, policyAttemptRoutes } from './market-policy-attempt.js';
import { marketPolicyCatalogIssues } from './market-policy-catalog-validation.js';

type CatalogDsaClient = Pick<DsaClient, 'marketRouteCatalogV3' | 'applyControlPolicyV3'>;
type PolicyRow = Record<string, unknown>;

export type MarketRouteCatalogReadReasonV3 =
  | 'catalog_partial'
  | 'control_timeout'
  | 'control_unauthorized'
  | 'unsupported_capability'
  | 'invalid_response'
  | 'control_unavailable';

export type MarketRouteCatalogReadV3 = {
  contractVersion: 3;
  consumer: 'thesis-ledger';
  status: 'complete' | 'partial' | 'unavailable';
  catalogRevision: number | null;
  generatedAt: string | null;
  entries: MarketRouteCatalogV3['entries'];
  reason: MarketRouteCatalogReadReasonV3 | null;
};

type CatalogAudit = {
  catalogRevision: number | null;
  generatedAt: string | null;
  integrity: 'complete' | 'partial' | 'unavailable';
  checkedAt: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const policyTargets = (policy: DesiredProviderPolicyV3, reason: string) =>
  policy.routes.flatMap((route, routeIndex) =>
    route.targets.map((_target, targetIndex) => ({
      path: ['routes', routeIndex, 'targets', targetIndex],
      reason,
    })),
  );

const catalogAudit = (
  integrity: CatalogAudit['integrity'],
  catalog?: MarketRouteCatalogV3,
): CatalogAudit => ({
  catalogRevision: catalog?.catalogRevision ?? null,
  generatedAt: catalog?.generatedAt ?? null,
  integrity,
  checkedAt: new Date().toISOString(),
});

const catalogError = (
  code: string,
  message: string,
  issues: Array<{ path: (string | number)[]; reason: string }>,
  audit: CatalogAudit,
) => ({ code, message, issues, ...audit });

const addCatalogAudit = (storedRoutes: unknown, audit: CatalogAudit) => {
  if (!isRecord(storedRoutes) || storedRoutes.storageVersion !== 3) return storedRoutes;
  return { ...storedRoutes, catalogAudit: audit };
};

const persistCatalogDecision = async (
  prisma: PrismaService,
  policy: DesiredProviderPolicyV3,
  attemptId: string,
  storedRoutes: unknown,
  decision: {
    syncState: 'applied' | 'pending' | 'rejected';
    lastError: unknown;
    audit: CatalogAudit;
    effectiveProjection?: unknown;
    syncedAt?: Date;
    dsaRevision?: number;
  },
) => {
  const data = {
    routes: addCatalogAudit(
      policyAttemptRoutes(storedRoutes, policy.requestId, attemptId),
      decision.audit,
    ) as Prisma.InputJsonValue,
    syncState: decision.syncState,
    lastError:
      decision.lastError === null ? Prisma.JsonNull : (decision.lastError as Prisma.InputJsonValue),
    ...(decision.effectiveProjection === undefined
      ? {}
      : { effectiveProjection: decision.effectiveProjection as Prisma.InputJsonValue }),
    ...(decision.syncedAt ? { syncedAt: decision.syncedAt } : {}),
    ...(decision.dsaRevision === undefined ? {} : { dsaRevision: decision.dsaRevision }),
  };

  return prisma.$transaction(async (transaction) => {
    const committed = await transaction.desiredProviderPolicy.updateMany({
      where: {
        consumer: policy.consumer,
        revision: policy.revision,
        routes: { path: ['applyAttempt', 'requestId'], equals: policy.requestId },
        AND: [{ routes: { path: ['applyAttempt', 'attemptId'], equals: attemptId } }],
      },
      data,
    });
    if (committed.count === 1) {
      await transaction.desiredProviderPolicyRevision.update({
        where: { consumer_revision: { consumer: policy.consumer, revision: policy.revision } },
        data,
      });
    }
    return transaction.desiredProviderPolicy.findUniqueOrThrow({
      where: { consumer: 'thesis-ledger' },
      include: { history: { orderBy: { revision: 'desc' }, take: 20 } },
    });
  });
};

const safeDsaError = (error: unknown) => ({
  code: error instanceof DsaError ? error.code : 'control_unavailable',
  message: error instanceof DsaError ? error.message : 'DSA Control 暂时不可用',
});

const routeCatalogUnavailable = (
  reason: Exclude<MarketRouteCatalogReadReasonV3, 'catalog_partial'>,
): MarketRouteCatalogReadV3 => ({
  contractVersion: 3,
  consumer: 'thesis-ledger',
  status: 'unavailable',
  catalogRevision: null,
  generatedAt: null,
  entries: [],
  reason,
});

const routeCatalogReadFailureReason = (
  error: unknown,
): Exclude<MarketRouteCatalogReadReasonV3, 'catalog_partial'> => {
  if (!(error instanceof DsaError)) return 'control_unavailable';
  if (error.code === 'timeout') return 'control_timeout';
  if (error.code === 'unauthorized') return 'control_unauthorized';
  if (error.code === 'unsupported-capability') return 'unsupported_capability';
  if (error.code === 'invalid-response') return 'invalid_response';
  return 'control_unavailable';
};

/** Read a safe Desktop projection of the exact DSA catalog without exposing transport errors. */
export const readMarketRouteCatalogV3 = async (
  dsa: Pick<DsaClient, 'marketRouteCatalogV3'>,
): Promise<MarketRouteCatalogReadV3> => {
  let raw: unknown;
  try {
    raw = await dsa.marketRouteCatalogV3();
  } catch (error) {
    return routeCatalogUnavailable(routeCatalogReadFailureReason(error));
  }

  const parsed = marketRouteCatalogV3Schema.safeParse(raw);
  if (!parsed.success) return routeCatalogUnavailable('invalid_response');

  const catalog = parsed.data;
  if (catalog.integrity === 'partial') {
    return {
      contractVersion: 3,
      consumer: 'thesis-ledger',
      status: 'partial',
      catalogRevision: catalog.catalogRevision,
      generatedAt: catalog.generatedAt,
      entries: [],
      reason: 'catalog_partial',
    };
  }

  return {
    contractVersion: 3,
    consumer: 'thesis-ledger',
    status: 'complete',
    catalogRevision: catalog.catalogRevision,
    generatedAt: catalog.generatedAt,
    entries: catalog.entries,
    reason: null,
  };
};

const sameJsonValue = (left: unknown, right: unknown): boolean => {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (isRecord(value)) {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
          .map(([key, item]) => [key, normalize(item)]),
      );
    }
    return value;
  };
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
};

const applyResponseMatches = (
  policy: DesiredProviderPolicyV3,
  response: Awaited<ReturnType<CatalogDsaClient['applyControlPolicyV3']>>,
) => {
  if (
    response.status !== 'applied' ||
    response.requestId !== policy.requestId ||
    !sameJsonValue(response.desired, policy) ||
    response.effective.requestId !== policy.requestId ||
    response.effective.sourceDesiredRevision !== policy.revision ||
    response.effective.enabled !== policy.enabled ||
    response.effective.routes.length !== policy.routes.length
  ) {
    return false;
  }

  return policy.routes.every((desiredRoute, routeIndex) => {
    const effectiveRoute = response.effective.routes[routeIndex];
    if (
      !effectiveRoute ||
      marketRouteKeyIdV3(effectiveRoute.key) !== marketRouteKeyIdV3(desiredRoute.key) ||
      effectiveRoute.targets.length !== desiredRoute.targets.length
    ) {
      return false;
    }
    return desiredRoute.targets.every((target, targetIndex) => {
      const effectiveTarget = effectiveRoute.targets[targetIndex];
      return (
        effectiveTarget?.routeIndex === targetIndex &&
        effectiveTarget.providerId === target.providerId &&
        effectiveTarget.upstreamSource === target.upstreamSource
      );
    });
  });
};

/** Recheck a Desired V3 against a live, strictly parsed DSA catalog before applying it. */
export const applyDesiredProviderPolicyV3 = async (
  prisma: PrismaService,
  dsa: CatalogDsaClient,
  policy: DesiredProviderPolicyV3,
  current: PolicyRow,
) => {
  const attemptId = await claimPolicyApplyAttempt(prisma, policy, current.routes);
  if (!attemptId) {
    return prisma.desiredProviderPolicy.findUniqueOrThrow({
      where: { consumer: policy.consumer },
      include: { history: { orderBy: { revision: 'desc' }, take: 20 } },
    });
  }
  let catalog: MarketRouteCatalogV3;
  try {
    const parsed = marketRouteCatalogV3Schema.safeParse(await dsa.marketRouteCatalogV3());
    if (!parsed.success) {
      throw new DsaError('DSA Control V3 精确路由能力目录响应无效', 'invalid-response');
    }
    catalog = parsed.data;
  } catch (error) {
    const audit = catalogAudit('unavailable');
    const lastError = catalogError(
      'route_catalog_unavailable',
      safeDsaError(error).message,
      policyTargets(policy, 'catalog_unavailable'),
      audit,
    );
    return persistCatalogDecision(prisma, policy, attemptId, current.routes, {
      audit,
      syncState: 'rejected',
      lastError,
    });
  }

  const audit = catalogAudit(catalog.integrity, catalog);
  const issues = marketPolicyCatalogIssues(policy, catalog, current.effectiveProjection);
  if (issues.length > 0) {
    const lastError = catalogError(
      catalog.integrity === 'partial' ? 'route_catalog_partial' : 'route_not_ready',
      catalog.integrity === 'partial'
        ? 'DSA Control V3 精确路由能力目录尚未完整'
        : 'Desired Policy V3 包含未就绪的精确路由目标',
      issues,
      audit,
    );
    return persistCatalogDecision(prisma, policy, attemptId, current.routes, {
      audit,
      syncState: 'rejected',
      lastError,
    });
  }

  try {
    const parsed = marketControlPolicyApplyResponseV3Schema.safeParse(
      await dsa.applyControlPolicyV3(policy),
    );
    if (!parsed.success) throw new DsaError('DSA Control V3 Policy 响应无效', 'invalid-response');
    const applied = parsed.data;
    if (!applyResponseMatches(policy, applied)) {
      throw new DsaError('DSA Control V3 Desired/Effective 响应身份不匹配', 'invalid-response');
    }
    return persistCatalogDecision(prisma, policy, attemptId, current.routes, {
      audit,
      syncState: 'applied',
      lastError: null,
      effectiveProjection: applied.effective,
      syncedAt: new Date(),
      dsaRevision: applied.effective.sourceDesiredRevision,
    });
  } catch (error) {
    const status =
      error instanceof DsaError && (error.code === 'timeout' || error.code === 'unavailable')
        ? 'pending'
        : 'rejected';
    return persistCatalogDecision(prisma, policy, attemptId, current.routes, {
      audit,
      syncState: status,
      lastError: safeDsaError(error),
    });
  }
};

export const marketPolicyCatalogResponse = (row: PolicyRow) => {
  return marketPolicyResponse(row);
};

export const retryDesiredProviderPolicyV3 = (
  prisma: PrismaService,
  dsa: CatalogDsaClient,
  current: PolicyRow,
) => {
  const storedRoutes = decodeMarketPolicyRoutes(current.routes);
  const response = marketPolicyCatalogResponse(current);
  if (current.syncState === 'applied' && response.effectiveStale === false)
    return Promise.resolve(response);
  const policy = desiredProviderPolicyV3Schema.parse({
    contractVersion: 3,
    consumer: 'thesis-ledger',
    requestId: randomUUID(),
    revision: current.revision,
    enabled: current.enabled,
    routes: storedRoutes,
  });
  return applyDesiredProviderPolicyV3(prisma, dsa, policy, current).then(
    marketPolicyCatalogResponse,
  );
};
