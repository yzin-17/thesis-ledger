import { Injectable } from '@nestjs/common';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import { PrismaService } from '../platform/prisma.service.js';

export type ProviderState = 'healthy' | 'degraded' | 'down';
export type ProviderHealthSource = 'manual' | 'scheduled' | 'delivery';

const DEFAULT_HISTORY_PAGE_SIZE = 20;
const MAX_HISTORY_PAGE_SIZE = 100;

const providerAliases = new Set(['feishu', 'feishu-webhook', 'lark', 'lark-webhook']);

const normalizeProviderName = (provider: string) => {
  const normalized = provider
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
  return providerAliases.has(normalized) ? 'feishu' : normalized;
};

@Injectable()
export class ProviderHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dsa: DsaClient,
  ) {}

  async record(
    provider: string,
    success: boolean,
    latencyMs: number,
    errorCode?: string,
    checkedAt = new Date(),
    source: ProviderHealthSource = 'manual',
  ) {
    const providerKey = normalizeProviderName(provider);
    const previous = await this.prisma.providerHealth.findUnique({
      where: { provider: providerKey },
    });
    const consecutiveFailures = success ? 0 : (previous?.consecutiveFailures ?? 0) + 1;
    const state: ProviderState = success
      ? latencyMs > 3_000
        ? 'degraded'
        : 'healthy'
      : consecutiveFailures >= 3
        ? 'down'
        : 'degraded';
    const result = await this.prisma.providerHealth.upsert({
      where: { provider: providerKey },
      update: {
        state,
        consecutiveFailures,
        latencyMs,
        errorCode: errorCode ?? null,
        checkedAt,
      },
      create: {
        provider: providerKey,
        state,
        consecutiveFailures,
        latencyMs,
        errorCode: errorCode ?? null,
        checkedAt,
      },
    });
    if (this.prisma.providerHealthCheck) {
      await this.prisma.providerHealthCheck.create({
        data: {
          provider: providerKey,
          state,
          latencyMs,
          errorCode: errorCode ?? null,
          source,
          checkedAt,
        },
      });
    }
    return result;
  }

  list() {
    return this.prisma.providerHealth.findMany({ orderBy: { provider: 'asc' } });
  }

  async checkDsa(source: ProviderHealthSource = 'manual') {
    const started = Date.now();
    try {
      await this.dsa.health();
      return this.record('dsa', true, Date.now() - started, undefined, new Date(), source);
    } catch (error) {
      const errorCode = error instanceof Error ? error.name : 'provider_error';
      return this.record('dsa', false, Date.now() - started, errorCode, new Date(), source);
    }
  }

  async checkAll(source: ProviderHealthSource = 'manual') {
    return [await this.checkDsa(source)];
  }

  async history(provider?: string, page?: number, pageSize?: number) {
    const providerKey = provider ? normalizeProviderName(provider) : undefined;
    const requestedPage = Number.isInteger(page) && page && page > 0 ? page : 1;
    const requestedPageSize =
      Number.isInteger(pageSize) && pageSize && pageSize > 0
        ? Math.min(pageSize, MAX_HISTORY_PAGE_SIZE)
        : DEFAULT_HISTORY_PAGE_SIZE;
    const where = providerKey ? { provider: providerKey } : {};
    const total = await this.prisma.providerHealthCheck.count({ where });
    const totalPages = Math.ceil(total / requestedPageSize);
    const currentPage = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
    const items = await this.prisma.providerHealthCheck.findMany({
      where,
      orderBy: [{ checkedAt: 'desc' }, { id: 'desc' }],
      skip: (currentPage - 1) * requestedPageSize,
      take: requestedPageSize,
    });
    return {
      items,
      page: currentPage,
      pageSize: requestedPageSize,
      total,
      totalPages,
    };
  }
}
