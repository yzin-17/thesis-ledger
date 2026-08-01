import { Injectable } from '@nestjs/common';
import { DsaClient } from '../market/dsa-client.js';
import { PrismaService } from '../platform/prisma.service.js';

export type ProviderState = 'healthy' | 'degraded' | 'down';

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
  ) {
    const previous = await this.prisma.providerHealth.findUnique({ where: { provider } });
    const consecutiveFailures = success ? 0 : (previous?.consecutiveFailures ?? 0) + 1;
    const state: ProviderState = success
      ? latencyMs > 3_000
        ? 'degraded'
        : 'healthy'
      : consecutiveFailures >= 3
        ? 'down'
        : 'degraded';
    const result = await this.prisma.providerHealth.upsert({
      where: { provider },
      update: {
        state,
        consecutiveFailures,
        latencyMs,
        errorCode: errorCode ?? null,
        checkedAt,
      },
      create: {
        provider,
        state,
        consecutiveFailures,
        latencyMs,
        errorCode: errorCode ?? null,
        checkedAt,
      },
    });
    if (this.prisma.providerHealthCheck) {
      await this.prisma.providerHealthCheck.create({
        data: { provider, state, latencyMs, errorCode: errorCode ?? null, checkedAt },
      });
    }
    return result;
  }

  list() {
    return this.prisma.providerHealth.findMany({ orderBy: { provider: 'asc' } });
  }

  async checkDsa() {
    const started = Date.now();
    try {
      await this.dsa.health();
      return this.record('dsa', true, Date.now() - started);
    } catch (error) {
      const errorCode = error instanceof Error ? error.name : 'provider_error';
      return this.record('dsa', false, Date.now() - started, errorCode);
    }
  }

  async checkAll() {
    return [await this.checkDsa()];
  }

  history(provider?: string) {
    return this.prisma.providerHealthCheck.findMany({
      ...(provider ? { where: { provider } } : {}),
      orderBy: { checkedAt: 'desc' },
      take: 200,
    });
  }
}
