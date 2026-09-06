import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { desiredProviderPolicySchema, type DesiredProviderPolicy } from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { DsaClient, DsaError } from '../integration/dsa/dsa.client.js';

const defaultRoutes = {
  REALTIME_QUOTE: {
    STOCK: ['akshare', 'efinance'],
    ETF: ['akshare', 'efinance'],
  },
  DAILY_BAR: {
    STOCK: ['akshare', 'efinance'],
    ETF: ['akshare', 'efinance'],
  },
  FUND_NAV: { MUTUAL_FUND: ['akshare', 'efinance'] },
  FUND_NAV_HISTORY: { MUTUAL_FUND: ['akshare', 'efinance'] },
  CHIP_SUMMARY: { STOCK: ['akshare'] },
} as const;

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

  private policyPayload(input: unknown, revision: number): DesiredProviderPolicy {
    const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    return desiredProviderPolicySchema.parse({
      contractVersion: 1,
      consumer: 'thesis-ledger',
      requestId: typeof raw.requestId === 'string' ? raw.requestId : randomUUID(),
      revision,
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
      routes: raw.routes ?? defaultRoutes,
    });
  }

  private async ensureSeededPolicy() {
    const current = await this.prisma.desiredProviderPolicy.findUnique({
      where: { consumer: 'thesis-ledger' },
      include: { history: { orderBy: { revision: 'desc' }, take: 20 } },
    });
    if (current) return current;
    const payload = this.policyPayload({ routes: defaultRoutes }, 1);
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
    return current;
  }

  private async pushToDsa(
    policy: DesiredProviderPolicy,
    allowRebase = true,
  ): Promise<ReturnType<MarketControlService['recordSyncFailure']>> {
    try {
      const projection = (await this.dsa.applyControlPolicy(policy)) as {
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
  private async rebaseToDsaRevision(policy: DesiredProviderPolicy) {
    try {
      const effective = (await this.dsa.effectiveControlPolicy()) as {
        projection?: { desired?: { revision?: number } } | null;
      };
      const remoteRevision = effective.projection?.desired?.revision;
      if (
        !Number.isInteger(remoteRevision) ||
        ((remoteRevision as number) <= policy.revision)
      )
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
    policy: DesiredProviderPolicy,
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
    return result.shouldPush ? this.pushToDsa(policy) : result.current;
  }

  async retryLatest() {
    const current = await this.ensureSeededPolicy();
    if (current.syncState !== 'pending') return current;
    const policy = this.policyPayload(
      {
        enabled: current.enabled,
        routes: current.routes,
      },
      current.revision,
    );
    return this.pushToDsa(policy);
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
    return {
      rolledBackFrom: current.revision,
      rolledBackTo: targetRevision,
      ...(await this.applyPolicy({
        revision: current.revision + 1,
        enabled: target.enabled,
        routes: target.routes,
      })),
    };
  }

  async removeProvider(providerId: string) {
    const current = await this.ensureSeededPolicy();
    const currentRoutes = (current.routes ?? {}) as Record<string, Record<string, string[]>>;
    const nextRoutes: Record<string, Record<string, string[]>> = {};
    const routeDiff: Array<{
      capability: string;
      instrumentType: string;
      previous: string[];
      next: string[];
    }> = [];
    for (const [capability, typeRoutes] of Object.entries(currentRoutes)) {
      nextRoutes[capability] = {};
      for (const [instrumentType, providers] of Object.entries(typeRoutes)) {
        const previous = Array.isArray(providers) ? providers.map(String) : [];
        const next = previous.filter((item) => item !== providerId);
        nextRoutes[capability][instrumentType] = next;
        if (next.length !== previous.length)
          routeDiff.push({ capability, instrumentType, previous, next });
      }
    }
    const revision = current.revision + (routeDiff.length > 0 ? 1 : 0);
    const policy = this.policyPayload(
      { requestId: randomUUID(), enabled: current.enabled, routes: nextRoutes },
      revision,
    );
    const dsaPolicy =
      routeDiff.length > 0
        ? await this.applyPolicy(policy)
        : current.syncState === 'pending'
          ? await this.retryLatest()
          : current;
    if (dsaPolicy.syncState !== 'applied') {
      return {
        providerId,
        removed: false,
        pending: dsaPolicy.syncState === 'pending',
        routeDiff,
        policy: dsaPolicy,
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
        policy: dsaPolicy,
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
    return { providerId, removed: true, routeDiff, policy: dsaPolicy, tombstone, dsaTombstone };
  }

  providers() {
    return this.dsa.controlProviders();
  }

  saveProvider(providerId: string, input: unknown) {
    const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    return this.dsa.saveControlProvider(providerId, {
      requestId: typeof raw.requestId === 'string' ? raw.requestId : randomUUID(),
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
      ...(typeof raw.credential === 'string' ? { credential: raw.credential } : {}),
      ...(raw.clearCredentials === true ? { clearCredentials: true } : {}),
      settings:
        raw.settings && typeof raw.settings === 'object'
          ? (raw.settings as Record<string, unknown>)
          : {},
    });
  }

  testProvider(providerId: string, input: unknown) {
    const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    return this.dsa.testControlProvider(providerId, {
      requestId: typeof raw.requestId === 'string' ? raw.requestId : randomUUID(),
      ...(typeof raw.credential === 'string' ? { credential: raw.credential } : {}),
    });
  }
}
