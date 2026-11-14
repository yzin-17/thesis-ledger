import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../platform/prisma.service.js';
import { StructuredLogger } from '../platform/structured-logger.js';
import {
  recordDataQualityObservation,
  type DataQualityObservation,
} from './data-quality-observation.js';

export type DataQualityStatus = 'open' | 'acknowledged' | 'resolved';
type DataQualityQueryStatus = DataQualityStatus | 'unresolved';

@Injectable()
export class DataQualityService {
  private readonly logger = new StructuredLogger('thesis-ledger.quality');
  constructor(private readonly prisma: PrismaService) {}

  async observe(input: DataQualityObservation) {
    try {
      return await recordDataQualityObservation(this.prisma, input);
    } catch {
      this.logger.warn({ operation: 'data_quality.persist_failed', code: input.code });
      return null;
    }
  }

  record(input: {
    capability: string;
    provider: string;
    symbol?: string;
    severity: 'info' | 'warning' | 'error';
    code: string;
    details: Record<string, unknown>;
  }) {
    return this.prisma.dataQualityIssue.create({
      data: {
        capability: input.capability,
        provider: input.provider,
        ...(input.symbol === undefined ? {} : { symbol: input.symbol }),
        severity: input.severity,
        code: input.code,
        details: input.details as Prisma.InputJsonValue,
      },
    });
  }

  list(status?: DataQualityQueryStatus) {
    let where: Prisma.DataQualityIssueWhereInput = {};
    if (status === 'unresolved') where = { status: { in: ['open', 'acknowledged'] } };
    else if (status) where = { status };
    return this.prisma.dataQualityIssue.findMany({
      where,
      orderBy: { detectedAt: 'desc' },
      take: 500,
    });
  }

  async resolve(id: string) {
    const issue = await this.prisma.dataQualityIssue.findUnique({ where: { id } });
    if (!issue) throw new NotFoundException('数据质量问题不存在');
    if (issue.status === 'resolved') return issue;
    return this.prisma.dataQualityIssue.update({
      where: { id },
      data: { status: 'resolved', resolvedAt: new Date() },
    });
  }

  validateStatus(status?: string): DataQualityQueryStatus | undefined {
    if (status === undefined) return undefined;
    if (!['open', 'acknowledged', 'resolved', 'unresolved'].includes(status))
      throw new BadRequestException('数据质量状态无效');
    return status as DataQualityQueryStatus;
  }
}
