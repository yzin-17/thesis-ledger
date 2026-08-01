import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../platform/prisma.service.js';

export type DataQualityStatus = 'open' | 'acknowledged' | 'resolved';

@Injectable()
export class DataQualityService {
  constructor(private readonly prisma: PrismaService) {}

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

  list(status?: DataQualityStatus) {
    return this.prisma.dataQualityIssue.findMany({
      where: status ? { status } : {},
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

  validateStatus(status?: string): DataQualityStatus | undefined {
    if (status === undefined) return undefined;
    if (!['open', 'acknowledged', 'resolved'].includes(status))
      throw new BadRequestException('数据质量状态无效');
    return status as DataQualityStatus;
  }
}
