import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import {
  assertProviderControlEnvelope,
  parseProviderSaveInput,
  parseProviderTestInput,
} from './market-provider-input.js';
import { PrismaService } from '../platform/prisma.service.js';
import { DsaClient, DsaError } from '../integration/dsa/dsa.client.js';
import {
  buildMarketPolicyPayload,
  decodeMarketPolicyRoutes,
  encodeMarketPolicyRoutes,
  marketPolicyResponse,
  persistMarketPolicyRevision,
  removeProviderTargets,
} from './market-policy-storage.js';
import {
  applyDesiredProviderPolicyV3,
  marketPolicyCatalogResponse,
  readMarketRouteCatalogV3,
  retryDesiredProviderPolicyV3,
} from './market-policy-catalog.js';

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

  private async ensureSeededPolicy() {
    const current = await this.prisma.desiredProviderPolicy.findUnique({
      where: { consumer: 'thesis-ledger' },
      include: { history: { orderBy: { revision: 'desc' }, take: 20 } },
    });
    if (current) {
      marketPolicyResponse(current);
      return current;
    }
    const payload = buildMarketPolicyPayload(
      {
        contractVersion: 3,
        enabled: true,
        routes: [],
      },
      1,
    );
    const routes = encodeMarketPolicyRoutes(payload.routes);
    return this.prisma.desiredProviderPolicy.upsert({
      where: { consumer: 'thesis-ledger' },
      update: {},
      create: {
        consumer: 'thesis-ledger',
        revision: payload.revision,
        enabled: payload.enabled,
        routes,
        syncState: 'pending',
        history: {
          create: {
            revision: payload.revision,
            enabled: payload.enabled,
            routes,
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
    return marketPolicyCatalogResponse(current);
  }

  routeCapabilitiesV3() {
    return readMarketRouteCatalogV3(this.dsa);
  }

  async applyPolicy(input: unknown) {
    const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    if (raw.contractVersion !== 3) throw new BadRequestException('Policy contractVersion 必须是 3');
    if (typeof raw.revision !== 'number' || !Number.isInteger(raw.revision) || raw.revision <= 0)
      throw new BadRequestException('Policy revision 必须是正整数');
    let policy;
    try {
      policy = buildMarketPolicyPayload(input, raw.revision);
    } catch (error) {
      if (error instanceof ZodError) throw new BadRequestException('Policy V3 结构无效');
      throw error;
    }
    await this.ensureSeededPolicy();
    const current = await persistMarketPolicyRevision(this.prisma, policy);
    return marketPolicyCatalogResponse(
      await applyDesiredProviderPolicyV3(this.prisma, this.dsa, policy, current),
    );
  }

  async retryLatest() {
    const current = await this.ensureSeededPolicy();
    return retryDesiredProviderPolicyV3(this.prisma, this.dsa, current);
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
      contractVersion: 3,
      consumer: 'thesis-ledger',
      requestId: randomUUID(),
      revision: current.revision + 1,
      enabled: target.enabled,
      routes: decodeMarketPolicyRoutes(target.routes),
    });
    return { rolledBackFrom: current.revision, rolledBackTo: targetRevision, ...policy };
  }

  async removeProvider(providerId: string, input?: unknown) {
    assertProviderControlEnvelope(input);
    const current = await this.ensureSeededPolicy();
    const { nextRoutes, routeDiff } = removeProviderTargets(
      decodeMarketPolicyRoutes(current.routes),
      providerId,
    );
    const policy = buildMarketPolicyPayload(
      {
        contractVersion: 3,
        enabled: current.enabled,
        routes: nextRoutes,
      },
      current.revision + (routeDiff.length > 0 ? 1 : 0),
    );
    let policyResponse: Record<string, unknown>;
    if (routeDiff.length > 0) policyResponse = await this.applyPolicy(policy);
    else if (current.syncState === 'pending') policyResponse = await this.retryLatest();
    else policyResponse = marketPolicyCatalogResponse(current);
    if (policyResponse.syncState !== 'applied') {
      return {
        providerId,
        removed: false,
        pending: policyResponse.syncState === 'pending',
        routeDiff,
        policy: policyResponse,
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
        policy: policyResponse,
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
      policy: policyResponse,
      tombstone,
      dsaTombstone,
    };
  }

  providers() {
    return this.dsa.controlProviders();
  }

  saveProvider(providerId: string, input: unknown) {
    const raw = parseProviderSaveInput(input);
    return this.dsa.saveControlProvider(providerId, {
      requestId: raw.requestId ?? randomUUID(),
      ...(raw.enabled !== undefined ? { enabled: raw.enabled } : {}),
      ...(raw.credentials !== undefined ? { credentials: raw.credentials } : {}),
      ...(raw.clearCredentials !== undefined ? { clearCredentials: raw.clearCredentials } : {}),
      ...(raw.settings !== undefined ? { settings: raw.settings } : {}),
    });
  }

  testProvider(providerId: string, input: unknown) {
    const raw = parseProviderTestInput(input);
    return this.dsa.testControlProvider(providerId, {
      requestId: raw.requestId ?? randomUUID(),
      ...(raw.credentials !== undefined ? { credentials: raw.credentials } : {}),
    });
  }
}
