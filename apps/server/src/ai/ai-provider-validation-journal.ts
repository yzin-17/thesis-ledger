import { ConflictException, Injectable } from '@nestjs/common';
import { normalizeProviderName } from '../providers/provider-health.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import { verifiedRouteSchema, type VerifiedRoute } from './ai-provider-validation-policy.js';

/** AI-owned records in the existing provider check log; no raw prompts or credentials. */
@Injectable()
export class AiProviderValidationJournal {
  constructor(private readonly prisma: PrismaService) {}

  async begin(provider: string, operationId: string, planFingerprint: string) {
    try {
      await this.prisma.providerHealthCheck.create({
        data: {
          id: operationId,
          provider: normalizeProviderName(provider),
          state: 'degraded',
          source: 'manual',
          checkedAt: new Date(),
          errorCode: 'operation_authorized',
          details: { kind: 'ai_provider_validation_operation', planFingerprint, status: 'running' },
        },
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002')
        throw new ConflictException('该测试操作已使用，不能重复发送。请检查结果后重新确认新的操作');
      throw error;
    }
  }

  async passed(provider: string): Promise<VerifiedRoute[]> {
    const rows = await this.prisma.providerHealthCheck.findMany({
      where: {
        provider: normalizeProviderName(provider),
        errorCode: null,
        details: { path: ['kind'], equals: 'ai_provider_validation' },
      },
      orderBy: { checkedAt: 'desc' },
      take: 512,
    });
    return rows.flatMap((row) => {
      if (!row.details || typeof row.details !== 'object' || Array.isArray(row.details)) return [];
      const value = row.details;
      if (value.status !== 'passed') return [];
      const parsed = verifiedRouteSchema.safeParse({
        fingerprint: value.fingerprint,
        model: value.model,
        purpose: value.purpose,
        mode: value.mode,
        requestId: value.requestId,
        checkedAt: row.checkedAt.toISOString(),
        ...(row.latencyMs === null ? {} : { latencyMs: row.latencyMs }),
      });
      return parsed.success ? [parsed.data] : [];
    });
  }
}
