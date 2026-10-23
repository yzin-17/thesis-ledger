import {
  Inject,
  Injectable,
  HttpException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, type AiRun } from '@prisma/client';
import { isEqual } from 'es-toolkit';
import {
  researchReportListQuerySchema,
  researchReportLocatorSchema,
  researchReportPageSchema,
  researchReportSummarySchema,
  researchReportEvidenceSchema,
  researchScopeSnapshotV2Schema,
  researchReportMatchesLocator,
  researchReportComparisonQuerySchema,
  researchComparisonIdentity,
  type ResearchReportLocator,
  type ResearchReportDetail,
} from '@thesis-ledger/schemas';
import { researchReportIdSchema } from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import type { AiResearchSubmissionV2Access } from './ai-research-submission-v2.store.js';
import { researchReportWhere } from './ai-research-report-where.js';
import {
  decodeResearchReportCursor,
  encodeResearchReportCursor,
} from './ai-research-report-cursor.js';
import {
  projectResearchReport,
  type ResearchReadProjection,
} from './ai-research-report-projection.js';

export interface AiResearchReportComparisonRead {
  current: Pick<ResearchReadProjection, 'detail' | 'frozen'>;
  previous: Pick<ResearchReadProjection, 'detail' | 'frozen'> | null;
  selection: 'default' | 'explicit';
  searchStatus: 'complete' | 'truncated' | 'completion_unrecorded';
}

export interface AiResearchReportAccess extends Pick<
  AiResearchSubmissionV2Access,
  'assertSnapshot'
> {
  assertLegacy(
    transaction: Prisma.TransactionClient,
    ownerId: string,
    context: unknown,
  ): Promise<void>;
}
async function authorize(
  transaction: Prisma.TransactionClient,
  row: AiRun,
  ownerId: string,
  locator: ResearchReportLocator,
  access: AiResearchReportAccess,
): Promise<ResearchReportDetail['historicalScope']> {
  if (locator.view === 'legacy') {
    const metadata = row.modelMetadata as Record<string, unknown> | null;
    if (
      row.researchOwnerId ||
      row.promptVersion !== 'research-v1' ||
      metadata?.optimizationExperimentId
    )
      throw new NotFoundException('研究报告不存在或不可访问');
    const [relation] = await transaction.$queryRaw<Array<{ internal: boolean }>>(
      Prisma.sql`SELECT EXISTS(SELECT 1 FROM "OptimizationAttempt" WHERE "aiRunId"=${row.id}::uuid) AS "internal"`,
    );
    if (!relation || relation.internal) throw new NotFoundException('研究报告不存在或不可访问');
    await access.assertLegacy(transaction, ownerId, row.context);
    return { status: 'unrecorded', snapshot: null, label: '历史范围未记录' };
  }
  const parsed = researchScopeSnapshotV2Schema.safeParse(row.researchScopeSnapshot);
  if (
    row.researchOwnerId !== ownerId ||
    !parsed.success ||
    !researchReportMatchesLocator(parsed.data, locator)
  )
    throw new NotFoundException('研究报告不存在或不可访问');
  await access.assertSnapshot(transaction, ownerId, parsed.data);
  return { status: 'known', snapshot: parsed.data };
}
const inaccessible = (error: unknown) =>
  error instanceof HttpException && [403, 404].includes(error.getStatus());

@Injectable()
export class AiResearchReportsQuery {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(ownerId: string, raw: unknown, access: AiResearchReportAccess) {
    const query = researchReportListQuerySchema.parse(raw);
    const cursor = decodeResearchReportCursor(ownerId, query);
    return this.prisma.$transaction(
      async (transaction) => {
        const rows = await transaction.aiRun.findMany({
          where: {
            AND: [
              researchReportWhere(ownerId, query),
              ...(query.status ? [{ status: query.status }] : []),
              ...(query.search
                ? [{ question: { contains: query.search, mode: 'insensitive' as const } }]
                : []),
              ...(cursor
                ? [
                    {
                      OR: [
                        { updatedAt: { lt: cursor.updatedAt } },
                        { updatedAt: cursor.updatedAt, id: { lt: cursor.id } },
                      ],
                    },
                  ]
                : []),
            ],
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: query.limit + 1,
        });
        const hasMore = rows.length > query.limit;
        const visible = rows.slice(0, query.limit);
        const items = [];
        for (const row of visible) {
          let scope: ResearchReportDetail['historicalScope'];
          try {
            scope = await authorize(transaction, row, ownerId, query, access);
          } catch (error) {
            if (inaccessible(error)) continue;
            throw error;
          }
          const projection = await projectResearchReport(transaction, row, scope);
          items.push(researchReportSummarySchema.strip().parse(projection.detail));
        }
        const tail = visible.at(-1);
        return researchReportPageSchema.parse({
          items,
          hasMore,
          nextCursor: hasMore && tail ? encodeResearchReportCursor(ownerId, query, tail) : null,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  private async read(
    transaction: Prisma.TransactionClient,
    ownerId: string,
    id: string,
    locator: ResearchReportLocator,
    access: AiResearchReportAccess,
  ) {
    const row = await transaction.aiRun.findFirst({
      where: { AND: [{ id }, researchReportWhere(ownerId, locator)] },
    });
    if (!row) throw new NotFoundException('研究报告不存在或不可访问');
    const scope = await authorize(transaction, row, ownerId, locator, access);
    return { ...(await projectResearchReport(transaction, row, scope)), row };
  }
  /** 显式比较的另一端以自身可信范围独立授权，随后由比较层解释范围差异。 */
  private async comparisonPeer(
    transaction: Prisma.TransactionClient,
    ownerId: string,
    id: string,
    access: AiResearchReportAccess,
  ) {
    const row = await transaction.aiRun.findFirst({
      where: {
        id,
        OR: [{ researchOwnerId: ownerId }, { researchOwnerId: null, promptVersion: 'research-v1' }],
      },
    });
    if (!row) throw new NotFoundException('研究报告不存在或不可访问');
    let locator: ResearchReportLocator = { view: 'legacy' };
    if (row.researchOwnerId) {
      const scope = researchScopeSnapshotV2Schema.safeParse(row.researchScopeSnapshot);
      if (!scope.success) throw new NotFoundException('研究报告不存在或不可访问');
      locator = { view: 'scoped', mode: scope.data.mode, scope: 'all' };
    }
    const scope = await authorize(transaction, row, ownerId, locator, access);
    return projectResearchReport(transaction, row, scope);
  }
  comparisonInputs(
    ownerId: string,
    rawId: unknown,
    raw: unknown,
    access: AiResearchReportAccess,
  ): Promise<AiResearchReportComparisonRead> {
    const id = researchReportIdSchema.parse(rawId);
    const { beforeId, ...locator } = researchReportComparisonQuerySchema.parse(raw);
    if (beforeId === id) throw new BadRequestException('请选择另一份研究报告');
    return this.prisma.$transaction(
      async (transaction) => {
        const current = await this.read(transaction, ownerId, id, locator, access);
        const output: AiResearchReportComparisonRead = {
          current: { detail: current.detail, frozen: current.frozen },
          previous: null,
          selection: beforeId ? 'explicit' : 'default',
          searchStatus: 'complete',
        };
        if (beforeId) {
          const previous = await this.comparisonPeer(transaction, ownerId, beforeId, access);
          output.previous = { detail: previous.detail, frozen: previous.frozen };
          return output;
        }
        const identity = researchComparisonIdentity(current.detail),
          frozen = current.frozen;
        if (!identity || !frozen || current.detail.availability !== 'available') return output;
        if (!current.row.completedAt) {
          output.searchStatus = 'completion_unrecorded';
          return output;
        }
        const family: ResearchReportLocator = {
          view: 'scoped',
          mode: frozen.request.mode,
          ...frozen.request.scope,
        };
        let cursor = { completedAt: current.row.completedAt, id: current.row.id };
        let scanned = 0;
        while (scanned < 200) {
          const limit = Math.min(50, 200 - scanned);
          const rows = await transaction.aiRun.findMany({
            where: {
              AND: [
                researchReportWhere(ownerId, family),
                { status: 'succeeded', completedAt: { not: null } },
                {
                  OR: [
                    { completedAt: { lt: cursor.completedAt } },
                    { completedAt: cursor.completedAt, id: { lt: cursor.id } },
                  ],
                },
                frozen.request.templateId
                  ? {
                      modelMetadata: {
                        path: ['frozenResearch', 'request', 'templateId'],
                        equals: frozen.request.templateId,
                      },
                    }
                  : { question: frozen.request.question },
              ],
            },
            orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
            take: limit + 1,
          });
          const visible = rows.slice(0, limit);
          for (const row of visible) {
            scanned++;
            let scope: ResearchReportDetail['historicalScope'];
            try {
              scope = await authorize(transaction, row, ownerId, family, access);
            } catch (error) {
              if (inaccessible(error)) continue;
              throw error;
            }
            const candidate = await projectResearchReport(transaction, row, scope);
            if (
              candidate.detail.availability === 'available' &&
              isEqual(identity, researchComparisonIdentity(candidate.detail))
            ) {
              output.previous = { detail: candidate.detail, frozen: candidate.frozen };
              return output;
            }
          }
          if (rows.length <= limit) return output;
          const tail = visible.at(-1)!;
          if (!tail.completedAt) throw new Error('成功候选的完成时间缺失');
          cursor = { completedAt: tail.completedAt, id: tail.id };
        }
        output.searchStatus = 'truncated';
        return output;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  detail(ownerId: string, rawId: unknown, raw: unknown, access: AiResearchReportAccess) {
    const id = researchReportIdSchema.parse(rawId);
    const locator = researchReportLocatorSchema.parse(raw);
    return this.prisma.$transaction(
      async (transaction) => (await this.read(transaction, ownerId, id, locator, access)).detail,
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  evidence(
    ownerId: string,
    rawId: unknown,
    rawReference: unknown,
    raw: unknown,
    access: AiResearchReportAccess,
  ) {
    const id = researchReportIdSchema.parse(rawId);
    const referenceId = researchReportIdSchema.parse(rawReference);
    const locator = researchReportLocatorSchema.parse(raw);
    return this.prisma.$transaction(
      async (transaction) => {
        const read = await this.read(transaction, ownerId, id, locator, access);
        if (read.detail.availability !== 'available')
          throw new NotFoundException('研究引用不存在或不可访问');
        const result = read.detail.result;
        if (result?.version === 2 && read.frozen) {
          const binding = result.evidenceBindings.find(
            (entry) => entry.audit.evidenceId === referenceId,
          );
          const evidence = read.frozen.evidence.find(
            (entry) => entry.audit.evidenceId === referenceId && entry.usable,
          );
          if (!binding || !evidence) throw new NotFoundException('研究引用不存在或不可访问');
          return researchReportEvidenceSchema.parse({
            version: 2,
            runId: id,
            scopeSnapshot: result.scopeSnapshot,
            evidence,
            toolCallId: binding.toolCallId,
          });
        }
        const call = read.calls.find((entry) => entry.id === referenceId);
        if (!call) throw new NotFoundException('研究引用不存在或不可访问');
        return researchReportEvidenceSchema.parse({
          version: 1,
          runId: id,
          historicalScope: read.detail.historicalScope,
          toolCall: {
            id: call.id,
            tool: call.tool,
            permission: call.permission,
            status: call.status,
            provider: call.provider,
            marketTime: call.marketTime?.toISOString() ?? null,
            availableAt: call.availableAt?.toISOString() ?? null,
            fetchedAt: call.fetchedAt?.toISOString() ?? null,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
