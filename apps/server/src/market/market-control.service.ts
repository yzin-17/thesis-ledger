import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  desiredProviderPolicyV2Schema,
  type DesiredProviderPolicyV2,
  type RouteTargetV2,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { DsaClient, DsaError } from '../integration/dsa/dsa.client.js';

export const defaultMarketRoutesV2 = {
  REALTIME_QUOTE: {
    STOCK: [
      { providerId: 'akshare', upstreamSource: 'akshare' },
      { providerId: 'efinance', upstreamSource: 'efinance' },
    ],
    ETF: [
      { providerId: 'akshare', upstreamSource: 'akshare' },
      { providerId: 'efinance', upstreamSource: 'efinance' },
    ],
  },
  DAILY_BAR: {
    STOCK: [
      { providerId: 'akshare', upstreamSource: 'eastmoney' },
      { providerId: 'efinance', upstreamSource: 'eastmoney' },
    ],
    ETF: [
      { providerId: 'tencent', upstreamSource: 'tencent' },
      { providerId: 'akshare', upstreamSource: 'eastmoney' },
    ],
  },
  FUND_NAV: {
    MUTUAL_FUND: [
      { providerId: 'akshare', upstreamSource: 'akshare' },
      { providerId: 'efinance', upstreamSource: 'efinance' },
    ],
  },
  FUND_NAV_HISTORY: {
    MUTUAL_FUND: [
      { providerId: 'akshare', upstreamSource: 'akshare' },
      { providerId: 'efinance', upstreamSource: 'efinance' },
    ],
  },
  FUND_HOLDINGS: { MUTUAL_FUND: [{ providerId: 'akshare', upstreamSource: 'akshare' }] },
  CHIP_SUMMARY: { STOCK: [{ providerId: 'akshare', upstreamSource: 'akshare' }] },
} as const;

type RouteMatrixV2 = Record<string, Record<string, RouteTargetV2[]>>;

export function removeProviderTargets(routes: RouteMatrixV2, providerId: string) {
  const normalizedProviderId = providerId.trim().toLowerCase();
  const nextRoutes: RouteMatrixV2 = {};
  const routeDiff: Array<{
    capability: string;
    instrumentType: string;
    previous: RouteTargetV2[];
    next: RouteTargetV2[];
  }> = [];
  for (const [capability, typeRoutes] of Object.entries(routes)) {
    nextRoutes[capability] = {};
    for (const [instrumentType, targets] of Object.entries(typeRoutes)) {
      const previous = Array.isArray(targets) ? targets : [];
      const next = previous.filter((target) => target.providerId !== normalizedProviderId);
      nextRoutes[capability][instrumentType] = next;
      if (next.length !== previous.length)
        routeDiff.push({ capability, instrumentType, previous, next });
    }
  }
  return { nextRoutes, routeDiff };
}

const safeError = (error: unknown) => ({
  code: error instanceof DsaError ? error.code : 'control_unavailable',
  message: error instanceof DsaError ? error.message : 'DSA Control 暂时不可用',
});

@Injectable()
export class MarketControlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dsa: DsaClient,
  ) {}

  private policyPayload(input: unknown, revision: number): DesiredProviderPolicyV2 {
    const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    return desiredProviderPolicyV2Schema.parse({
      contractVersion: 2,
      consumer: 'thesis-ledger',
      requestId: typeof raw.requestId === 'string' ? raw.requestId : randomUUID(),
      revision,
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
      routes: raw.routes ?? defaultMarketRoutesV2,
    });
  }

  private policyResponse(row: Record<string, unknown>): Record<string, unknown> {
    const parsed = desiredProviderPolicyV2Schema.parse({
      contractVersion: 2,
      consumer: 'thesis-ledger',
      requestId: randomUUID(),
      revision: row.revision,
      enabled: row.enabled,
      routes: row.routes,
    });
    return { ...row, ...parsed, contractVersion: 2 };
  }

  private async ensureSeededPolicy() {
    const current = await this.prisma.desiredProviderPolicy.findUnique({
      where: { consumer: 'thesis-ledger' },
      include: { history: { orderBy: { revision: 'desc' }, take: 20 } },
    });
    if (current) {
      desiredProviderPolicyV2Schema.parse({
        contractVersion: 2,
        consumer: 'thesis-ledger',
        requestId: randomUUID(),
        revision: current.revision,
        enabled: current.enabled,
        routes: current.routes,
      });
      return current;
    }
    const payload = this.policyPayload({ routes: defaultMarketRoutesV2 }, 1);
    return this.prisma.desiredProviderPolicy.upsert({
      where: { consumer: 'thesis-ledger' },
      update: {},
      create: {
        consumer: 'thesis-ledger',
        revision: payload.revision,
        enabled: payload.enabled,
        routes: payload.routes,
        syncState: 'pending',
        history: {
          create: {
            revision: payload.revision,
            enabled: payload.enabled,
            routes: payload.routes,
            syncState: 'pending',
          },
        },
      },
      include: { history: { orderBy: { revision: 'desc' }, take: 20 } },
    });
  }

  async getPolicy() {
    const current = await this.ensureSeededPolicy();
    if (current.syncState === 'pending') return this.retryLatest();
    return this.policyResponse(current as unknown as Record<string, unknown>);
  }

  private async pushToDsa(
    policy: DesiredProviderPolicyV2,
    allowRebase = true,
  ): Promise<ReturnType<MarketControlService['recordSyncFailure']>> {
    try {
      const projection = (await this.dsa.applyControlPolicyV2(policy)) as {
        status?: string;
        effective?: Record<string, unknown>;
      };
      return this.prisma.$transaction(async (transaction) => {
        await transaction.desiredProviderPolicyRevision.update({
          where: { consumer_revision: { consumer: 'thesis-ledger', revision: policy.revision } },
          data: {
            syncState: 'applied',
            dsaRevision:
              typeof projection.effective?.sourceDesiredRevision === 'number'
                ? projection.effective.sourceDesiredRevision
                : policy.revision,
            syncedAt: new Date(),
            effectiveProjection: projection.effective
              ? (projection.effective as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            lastError: Prisma.JsonNull,
          },
        });
        await transaction.desiredProviderPolicy.updateMany({
          where: { consumer: 'thesis-ledger', revision: policy.revision },
          data: {
            syncState: 'applied',
            dsaRevision:
              typeof projection.effective?.sourceDesiredRevision === 'number'
                ? projection.effective.sourceDesiredRevision
                : policy.revision,
            syncedAt: new Date(),
            effectiveProjection: projection.effective
              ? (projection.effective as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            lastError: Prisma.JsonNull,
          },
        });
        return transaction.desiredProviderPolicy.findUniqueOrThrow({
          where: { consumer: 'thesis-ledger' },
          include: { history: { orderBy: { revision: 'desc' }, take: 20 } },
        });
      });
    } catch (error) {
      const lastError = safeError(error);
      const rejected =
        error instanceof DsaError &&
        (error.code === 'control-rejected' || error.code === 'stale-revision');
      const syncState = rejected ? 'rejected' : 'pending';
      const failed = await this.recordSyncFailure(policy, syncState, lastError);
      // 本地策略计数器可能落后于 DSA（例如本地库重建后从 1 重新计数）：
      // 命中远端 STALE_REVISION 错误码时读取 DSA 当前版本，把本地推进到其之上并重推一次。
      if (allowRebase && rejected && this.isStaleRevisionError(lastError)) {
        const rebased = await this.rebaseToDsaRevision(policy);
        if (rebased) return this.pushToDsa(rebased, false);
      }
      return failed;
    }
  }

  private isStaleRevisionError(lastError: { code: string }) {
    return lastError.code === 'stale-revision';
  }

  // 以 DSA 当前 revision 为基线：本地新建一个“远端版本 + 1”的修订（内容保持本地期望），推送由调用方完成
  private async rebaseToDsaRevision(policy: DesiredProviderPolicyV2) {
    try {
      const effective = (await this.dsa.effectiveControlPolicy()) as {
        projection?: { desired?: { revision?: number } } | null;
      };
      const remoteRevision = effective.projection?.desired?.revision;
      if (!Number.isInteger(remoteRevision) || (remoteRevision as number) <= policy.revision)
        return null;
      const next = this.policyPayload(
        { enabled: policy.enabled, routes: policy.routes },
        (remoteRevision as number) + 1,
      );
      await this.prisma.desiredProviderPolicy.update({
        where: { consumer: 'thesis-ledger' },
        data: {
          revision: next.revision,
          enabled: next.enabled,
          routes: next.routes,
          syncState: 'pending',
          lastError: Prisma.JsonNull,
          syncedAt: null,
          dsaRevision: null,
          history: {
            create: {
              revision: next.revision,
              enabled: next.enabled,
              routes: next.routes,
              syncState: 'pending',
            },
          },
        },
      });
      return next;
    } catch {
      return null;
    }
  }

  private recordSyncFailure(
    policy: DesiredProviderPolicyV2,
    syncState: 'rejected' | 'pending',
    lastError: { code: string; message: string },
  ) {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.desiredProviderPolicyRevision.update({
        where: { consumer_revision: { consumer: 'thesis-ledger', revision: policy.revision } },
        data: { syncState, lastError },
      });
      await transaction.desiredProviderPolicy.updateMany({
        where: { consumer: 'thesis-ledger', revision: policy.revision },
        data: { syncState, lastError },
      });
      return transaction.desiredProviderPolicy.findUniqueOrThrow({
        where: { consumer: 'thesis-ledger' },
        include: { history: { orderBy: { revision: 'desc' }, take: 20 } },
      });
    });
  }

  async applyPolicy(input: unknown) {
    const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    await this.ensureSeededPolicy();
    const revision = Number(raw.revision);
    if (!Number.isInteger(revision) || revision <= 0)
      throw new BadRequestException('Policy revision 必须是正整数');
    const policy = this.policyPayload(input, revision);
    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT "consumer" FROM "DesiredProviderPolicy"
        WHERE "consumer" = 'thesis-ledger'
        FOR UPDATE
      `);
      const current = await transaction.desiredProviderPolicy.findUniqueOrThrow({
        where: { consumer: 'thesis-ledger' },
        include: { history: { orderBy: { revision: 'desc' }, take: 20 } },
      });
      if (revision < current.revision) throw new ConflictException('Policy revision 不能回退');
      if (revision === current.revision) {
        const currentRoutes = JSON.stringify(current.routes);
        const requestedRoutes = JSON.stringify(policy.routes);
        if (current.enabled !== policy.enabled || currentRoutes !== requestedRoutes)
          throw new ConflictException('相同 revision 的 Policy 内容不能冲突');
        return { current, shouldPush: current.syncState === 'pending' };
      }
      const next = await transaction.desiredProviderPolicy.update({
        where: { consumer: 'thesis-ledger' },
        data: {
          revision: policy.revision,
          enabled: policy.enabled,
          routes: policy.routes,
          syncState: 'pending',
          lastError: Prisma.JsonNull,
          syncedAt: null,
          dsaRevision: null,
          effectiveProjection: current.effectiveProjection ?? Prisma.JsonNull,
          history: {
            create: {
              revision: policy.revision,
              enabled: policy.enabled,
              routes: policy.routes,
              syncState: 'pending',
              effectiveProjection: current.effectiveProjection ?? Prisma.JsonNull,
            },
          },
        },
        include: { history: { orderBy: { revision: 'desc' }, take: 20 } },
      });
      return { current: next, shouldPush: true };
    });
    const response = result.shouldPush ? await this.pushToDsa(policy) : result.current;
    return this.policyResponse(response as unknown as Record<string, unknown>);
  }

  async retryLatest() {
    const current = await this.ensureSeededPolicy();
    if (current.syncState !== 'pending') return this.policyResponse(current as unknown as Record<string, unknown>);
    const policy = this.policyPayload(
      {
        enabled: current.enabled,
        routes: current.routes,
      },
      current.revision,
    );
    return this.policyResponse((await this.pushToDsa(policy)) as unknown as Record<string, unknown>);
  }

  async rollback(targetRevision: number) {
    const current = await this.ensureSeededPolicy();
    if (!Number.isInteger(targetRevision) || targetRevision <= 0)
      throw new BadRequestException('回滚目标 revision 必须是正整数');
    if (targetRevision >= current.revision)
      throw new ConflictException('回滚目标必须早于当前 revision');
    const target = await this.prisma.desiredProviderPolicyRevision.findUnique({
      where: { consumer_revision: { consumer: 'thesis-ledger', revision: targetRevision } },
    });
    if (!target) throw new NotFoundException(`找不到 revision ${targetRevision}`);
    const policy = await this.applyPolicy({
      revision: current.revision + 1,
      enabled: target.enabled,
      routes: target.routes,
    });
    return {
      rolledBackFrom: current.revision,
      rolledBackTo: targetRevision,
      ...policy,
    };
  }

  async removeProvider(providerId: string) {
    const current = await this.ensureSeededPolicy();
    const { nextRoutes, routeDiff } = removeProviderTargets(
      (current.routes ?? {}) as RouteMatrixV2,
      providerId,
    );
    const revision = current.revision + (routeDiff.length > 0 ? 1 : 0);
    const policy = this.policyPayload(
      { requestId: randomUUID(), enabled: current.enabled, routes: nextRoutes },
      revision,
    );
    let dsaPolicy: Record<string, unknown>;
    if (routeDiff.length > 0) {
      dsaPolicy = await this.applyPolicy(policy) as Record<string, unknown>;
    } else if (current.syncState === 'pending') {
      dsaPolicy = await this.retryLatest() as Record<string, unknown>;
    } else {
      dsaPolicy = current as unknown as Record<string, unknown>;
    }
    if (dsaPolicy.syncState !== 'applied') {
      return {
        providerId,
        removed: false,
        pending: dsaPolicy.syncState === 'pending',
        routeDiff,
        policy: this.policyResponse(dsaPolicy as unknown as Record<string, unknown>),
        tombstone: null,
        dsaTombstone: null,
      };
    }
    let dsaTombstone: unknown;
    try {
      dsaTombstone = await this.dsa.removeControlProvider(providerId, {
        requestId: policy.requestId,
        reason: 'removed_by_consumer',
      });
    } catch (error) {
      return {
        providerId,
        removed: false,
        pending: true,
        routeDiff,
        policy: this.policyResponse(dsaPolicy as unknown as Record<string, unknown>),
        tombstone: null,
        dsaTombstone: safeError(error),
      };
    }
    const tombstone = await this.prisma.providerTombstone.upsert({
      where: { providerId },
      update: {
        reason: 'removed_by_consumer',
        metadata: { routeDiff },
        removedAt: new Date(),
      },
      create: {
        providerId,
        displayName: providerId,
        reason: 'removed_by_consumer',
        metadata: { routeDiff },
      },
    });
    return {
      providerId,
      removed: true,
      routeDiff,
      policy: this.policyResponse(dsaPolicy as unknown as Record<string, unknown>),
      tombstone,
      dsaTombstone,
    };
  }

  providers() {
    return this.dsa.controlProviders();
  }

  saveProvider(providerId: string, input: unknown) {
    const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    return this.dsa.saveControlProvider(providerId, {
      requestId: typeof raw.requestId === 'string' ? raw.requestId : randomUUID(),
      ...(typeof raw.enabled === 'boolean' ? { enabled: raw.enabled } : {}),
      ...(typeof raw.credential === 'string' ? { credential: raw.credential } : {}),
      ...(raw.credentials && typeof raw.credentials === 'object'
        ? {
            credentials: raw.credentials as {
              method: string;
              values: Record<string, unknown>;
            },
          }
        : {}),
      ...(raw.clearCredentials === true ? { clearCredentials: true } : {}),
      ...(raw.settings && typeof raw.settings === 'object'
        ? { settings: raw.settings as Record<string, unknown> }
        : {}),
    });
  }

  testProvider(providerId: string, input: unknown) {
    const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    return this.dsa.testControlProvider(providerId, {
      requestId: typeof raw.requestId === 'string' ? raw.requestId : randomUUID(),
      ...(typeof raw.credential === 'string' ? { credential: raw.credential } : {}),
      ...(raw.credentials && typeof raw.credentials === 'object'
        ? {
            credentials: raw.credentials as {
              method: string;
              values: Record<string, unknown>;
            },
          }
        : {}),
    });
  }
}
