import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  researchComparisonIdentity,
  type ResearchReportDetail,
  type ResearchReportLocator,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { AiResearchReportsQuery } from '../ai/ai-research-reports.query.js';
import { ResearchScopeReader } from './research-scope-reader.js';
import { researchObservationDigest } from './research-observation-identity.js';

@Injectable()
export class ResearchObservationAccess {
  constructor(
    @Inject(AiResearchReportsQuery) private readonly reports: AiResearchReportsQuery,
    @Inject(ResearchScopeReader) private readonly scopes: ResearchScopeReader,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}
  report(ownerId: string, id: string, locator: ResearchReportLocator) {
    return this.reports.detail(ownerId, id, locator, this.scopes);
  }
  /** 重试谱系也逐份执行原范围授权，拒绝跨身份、跨范围和循环链。 */
  async lineage(ownerId: string, report: ResearchReportDetail, locator: ResearchReportLocator) {
    const expected = researchObservationDigest(researchComparisonIdentity(report));
    const visited = new Set<string>();
    let current = report;
    for (let depth = 0; depth < 20; depth++) {
      if (visited.has(current.id)) throw new BadRequestException('研究重试谱系存在循环');
      visited.add(current.id);
      if (
        current.availability !== 'available' ||
        current.resultVersion !== 2 ||
        researchObservationDigest(researchComparisonIdentity(current)) !== expected
      )
        throw new BadRequestException('研究重试谱系的范围或产物不一致');
      const row = await this.prisma.aiRun.findFirst({
        where: { id: current.id, researchOwnerId: ownerId },
        select: { retryOfRunId: true },
      });
      if (!row) throw new NotFoundException('研究报告不存在或不可访问');
      if (!row.retryOfRunId) return current.id;
      current = await this.report(ownerId, row.retryOfRunId, locator);
    }
    throw new BadRequestException('研究重试谱系超过有界读取范围');
  }
}
