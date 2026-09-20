import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  aiContextSchema,
  aiResearchListQuerySchema,
  classifyAiResearchTask,
  resolveAiResearchResultStatus,
} from '@thesis-ledger/schemas';
import type {
  AiResearchDisplayProjection,
  AiResearchListQuery,
  AiResearchSourceType,
} from '@thesis-ledger/schemas';
import type { z } from 'zod';
import type { PrismaService } from '../platform/prisma.service.js';
import {
  aiExecutionReadModel,
  safeDiagnosticSummary,
  safeFallbackSummary,
} from './ai-execution-read-model.js';

interface ResearchQueryRow {
  id: string;
  provider: string;
  model: string;
  promptVersion: string;
  status: string;
  question: string | null;
  inputTokens: number;
  outputTokens: number;
  cost: Prisma.Decimal;
  result: unknown;
  context: unknown;
  modelMetadata: unknown;
  errorCode: string | null;
  errorSummary: string | null;
  durationMs: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  retryOfRunId: string | null;
  createdAt: Date;
  updatedAt: Date;
  relationExperimentId: string | null;
}

type ResearchContext = z.infer<typeof aiContextSchema>;

type ModelWithFindUnique = {
  findUnique?: (args: unknown) => Promise<unknown>;
};

const encodeCursor = (updatedAt: Date | string, id: string) => {
  const date = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  return Buffer.from(JSON.stringify({ version: 1, updatedAt: date.toISOString(), id })).toString(
    'base64url',
  );
};

const decodeCursor = (cursor?: string) => {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      version?: unknown;
      updatedAt?: unknown;
      id?: unknown;
    };
    if (value.version !== 1 || typeof value.updatedAt !== 'string' || typeof value.id !== 'string')
      return null;
    const updatedAt = new Date(value.updatedAt);
    return Number.isNaN(updatedAt.getTime()) ? null : { updatedAt, id: value.id };
  } catch {
    return null;
  }
};

const metadataExperimentId = (metadata: unknown) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = (metadata as { optimizationExperimentId?: unknown }).optimizationExperimentId;
  return typeof value === 'string' && value.length > 0 ? value : null;
};

const contextSourceType = (context: ResearchContext | null): AiResearchSourceType => {
  if (!context) return 'unknown';
  return context.scope;
};

const dataVersion = (facts: unknown) =>
  createHash('sha256').update(JSON.stringify(facts)).digest('hex').slice(0, 24);

export class AiResearchQuery {
  constructor(private readonly prisma: PrismaService) {}

  private where(query: AiResearchListQuery, cursor: ReturnType<typeof decodeCursor>) {
    const conditions: Prisma.Sql[] = [];
    if (query.status) conditions.push(Prisma.sql`r."status"=${query.status}`);
    if (query.search) conditions.push(Prisma.sql`r."question" ILIKE ${`%${query.search}%`}`);
    if (cursor) {
      conditions.push(Prisma.sql`(
        r."updatedAt" < ${cursor.updatedAt}
        OR (r."updatedAt" = ${cursor.updatedAt} AND r."id" < ${cursor.id}::uuid)
      )`);
    }

    const verifiedInternal = Prisma.sql`(
      relation."experimentId" IS NOT NULL
      AND (
        r."modelMetadata"->>'optimizationExperimentId' IS NULL
        OR r."modelMetadata"->>'optimizationExperimentId'=relation."experimentId"::text
      )
    )`;
    if (!query.includeInternal) conditions.push(Prisma.sql`NOT ${verifiedInternal}`);

    if (query.source === 'strategy_experiment') {
      conditions.push(verifiedInternal);
    } else if (query.source === 'unknown') {
      conditions.push(Prisma.sql`(
        NOT ${verifiedInternal}
        AND COALESCE(r."context"->>'scope', '') NOT IN ('portfolio', 'account', 'position', 'strategy')
      )`);
    } else if (query.source !== 'all') {
      conditions.push(Prisma.sql`NOT ${verifiedInternal}`);
      conditions.push(Prisma.sql`r."context"->>'scope'=${query.source}`);
    }
    return conditions.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
      : Prisma.empty;
  }

  private async rows(query: AiResearchListQuery) {
    const decoded = decodeCursor(query.cursor);
    if (query.cursor && !decoded) throw new BadRequestException('研究任务游标无效');
    const where = this.where(query, decoded);
    return this.prisma.$queryRaw<ResearchQueryRow[]>(Prisma.sql`
      SELECT
        r."id", r."provider", r."model", r."promptVersion", r."status", r."question",
        r."inputTokens", r."outputTokens", r."cost", r."result", r."context",
        r."modelMetadata", r."errorCode", r."errorSummary", r."durationMs",
        r."startedAt", r."completedAt", r."retryOfRunId", r."createdAt", r."updatedAt",
        relation."experimentId" AS "relationExperimentId"
      FROM "AiRun" AS r
      LEFT JOIN LATERAL (
        SELECT attempt."experimentId"
        FROM "OptimizationAttempt" AS attempt
        WHERE attempt."aiRunId"=r."id"
        ORDER BY attempt."createdAt" DESC, attempt."id" DESC
        LIMIT 1
      ) AS relation ON TRUE
      ${where}
      ORDER BY r."updatedAt" DESC, r."id" DESC
      LIMIT ${query.limit + 1}
    `);
  }

  private async projections(rows: ResearchQueryRow[]) {
    const ids = rows.map((row) => row.id);
    const contexts = rows.map((row) => aiContextSchema.safeParse(row.context));
    const accountIds = new Set<string>();
    const symbols = new Set<string>();
    const strategyVersionIds = new Set<string>();
    for (const parsed of contexts) {
      if (!parsed.success) continue;
      if (parsed.data.accountId) accountIds.add(parsed.data.accountId);
      if (parsed.data.symbol) symbols.add(parsed.data.symbol);
      if (parsed.data.strategyVersionId) strategyVersionIds.add(parsed.data.strategyVersionId);
    }

    const [toolCalls, accounts, assets, strategyVersions] = await Promise.all([
      ids.length > 0
        ? this.prisma.aiToolCall.findMany({
            where: { aiRunId: { in: ids } },
            select: { id: true, aiRunId: true },
          })
        : [],
      accountIds.size > 0
        ? this.prisma.account.findMany({
            where: { id: { in: [...accountIds] }, active: true },
            select: { id: true, name: true, updatedAt: true },
          })
        : [],
      symbols.size > 0
        ? this.prisma.asset.findMany({
            where: { symbol: { in: [...symbols] } },
            select: { symbol: true, name: true, updatedAt: true },
          })
        : [],
      strategyVersionIds.size > 0
        ? this.prisma.strategyVersion.findMany({
            where: { id: { in: [...strategyVersionIds] } },
            select: {
              id: true,
              version: true,
              createdAt: true,
              strategy: { select: { name: true, updatedAt: true } },
            },
          })
        : [],
    ]);

    const toolIdsByRun = new Map<string, string[]>();
    for (const call of toolCalls) {
      const current = toolIdsByRun.get(call.aiRunId) ?? [];
      current.push(call.id);
      toolIdsByRun.set(call.aiRunId, current);
    }
    const accountById = new Map(accounts.map((account) => [account.id, account]));
    const assetBySymbol = new Map(assets.map((asset) => [asset.symbol, asset]));
    const strategyByVersionId = new Map(strategyVersions.map((version) => [version.id, version]));

    return rows.map((row, index) => {
      const parsedContext = contexts[index];
      const context = parsedContext?.success ? parsedContext.data : null;
      const metadataId = metadataExperimentId(row.modelMetadata);
      let experimentRelation: 'verified' | 'missing' | 'conflict' | 'unchecked' = 'missing';
      if (row.relationExperimentId) {
        experimentRelation =
          metadataId && metadataId !== row.relationExperimentId ? 'conflict' : 'verified';
      } else if (metadataId) {
        experimentRelation = 'unchecked';
      }
      const taskKind = classifyAiResearchTask({
        promptVersion: row.promptVersion,
        context: row.context,
        optimizationExperimentId: row.relationExperimentId ?? metadataId,
        experimentRelation,
      });
      const ownedToolCallIds = toolIdsByRun.get(row.id) ?? [];
      const resultStatus = resolveAiResearchResultStatus({
        executionStatus: row.status,
        taskKind,
        result: row.result,
        toolCallOwnership: 'verified',
        ownedToolCallIds,
      });

      const account = context?.accountId ? accountById.get(context.accountId) : undefined;
      const asset = context?.symbol ? assetBySymbol.get(context.symbol) : undefined;
      const strategyVersion = context?.strategyVersionId
        ? strategyByVersionId.get(context.strategyVersionId)
        : undefined;

      let object: AiResearchDisplayProjection['object'] = {
        type: 'unknown',
        label: '研究对象',
      };
      if (context?.scope === 'portfolio') {
        object = { type: 'portfolio', label: '当前投资组合' };
      } else if (context?.scope === 'account') {
        object = {
          type: 'account',
          label: '账户',
          ...(account?.name ? { name: account.name } : {}),
        };
      } else if (context?.scope === 'position') {
        object = {
          type: 'position',
          label: '持仓',
          ...(asset?.name ? { name: asset.name } : {}),
          ...(context.symbol ? { code: context.symbol } : {}),
        };
      } else if (context?.scope === 'strategy') {
        object = {
          type: 'strategy_version',
          label: '策略版本',
          ...(strategyVersion?.strategy.name ? { name: strategyVersion.strategy.name } : {}),
          ...(strategyVersion ? { version: `v${strategyVersion.version}` } : {}),
        };
      }

      let sourceType = contextSourceType(context);
      let sourceLabel = '来源未识别';
      let sourceName: string | undefined;
      let sourceHref: string | undefined;
      if (taskKind === 'experiment_internal') {
        sourceType = 'strategy_experiment';
        sourceLabel = '策略实验';
        sourceName = strategyVersion?.strategy.name;
        sourceHref = '/strategy?tab=optimization';
      } else if (context?.scope === 'portfolio') {
        sourceLabel = '组合研究';
      } else if (context?.scope === 'account') {
        sourceLabel = '账户研究';
        sourceName = account?.name;
      } else if (context?.scope === 'position') {
        sourceLabel = '持仓研究';
        sourceName = asset?.name;
      } else if (context?.scope === 'strategy') {
        sourceLabel = '策略研究';
        sourceName = strategyVersion?.strategy.name;
        if (strategyVersion) sourceHref = '/strategy';
      }

      const version = dataVersion({
        run: row.updatedAt.toISOString(),
        relation: row.relationExperimentId,
        toolCallIds: [...ownedToolCallIds].sort(),
        account: account ? [account.name, account.updatedAt.toISOString()] : null,
        asset: asset ? [asset.name, asset.updatedAt.toISOString()] : null,
        strategy: strategyVersion
          ? [
              strategyVersion.version,
              strategyVersion.createdAt.toISOString(),
              strategyVersion.strategy.name,
              strategyVersion.strategy.updatedAt.toISOString(),
            ]
          : null,
      });

      return {
        id: row.id,
        question: row.question,
        taskKind,
        object,
        source: {
          type: sourceType,
          label: sourceLabel,
          ...(sourceName ? { name: sourceName } : {}),
          ...(sourceHref ? { href: sourceHref } : {}),
        },
        executionStatus: row.status,
        ...resultStatus,
        dataVersion: version,
        updatedAt: row.updatedAt.toISOString(),
        capabilities: {
          canRead: true,
          canReload: true,
          canRetry: taskKind === 'research' && row.status === 'failed',
          canCancel: false,
          canOpenSource: sourceHref !== undefined,
        },
      } satisfies AiResearchDisplayProjection;
    });
  }

  private async assertAccess(contextValue: unknown) {
    const parsed = aiContextSchema.safeParse(contextValue);
    if (!parsed.success) return;
    const models = this.prisma as unknown as {
      account?: ModelWithFindUnique;
      position?: ModelWithFindUnique;
      strategyVersion?: ModelWithFindUnique;
    };
    const context = parsed.data;
    if (context.accountId && models.account?.findUnique) {
      const account = (await models.account.findUnique({
        where: { id: context.accountId },
        select: { id: true, active: true },
      })) as { id?: string; active?: boolean } | null;
      if (!account || account.active === false) throw new NotFoundException('研究上下文已不可访问');
    }
    if (
      context.scope === 'position' &&
      context.accountId &&
      context.symbol &&
      models.position?.findUnique
    ) {
      const position = await models.position.findUnique({
        where: { accountId_symbol: { accountId: context.accountId, symbol: context.symbol } },
        select: { id: true },
      });
      if (!position) throw new NotFoundException('研究上下文已不可访问');
    }
    if (context.strategyVersionId && models.strategyVersion?.findUnique) {
      const version = await models.strategyVersion.findUnique({
        where: { id: context.strategyVersionId },
        select: { id: true },
      });
      if (!version) throw new NotFoundException('研究上下文已不可访问');
    }
  }

  async listPage(input: unknown) {
    const query = aiResearchListQuerySchema.parse(input);
    const rows = await this.rows(query);
    const hasMore = rows.length > query.limit;
    const visible = hasMore ? rows.slice(0, query.limit) : rows;
    const projections = await this.projections(visible);
    const items = visible.map((row, index) => {
      const execution = aiExecutionReadModel(row.modelMetadata);
      return {
        id: row.id,
        provider: row.provider,
        model: row.model,
        promptVersion: row.promptVersion,
        status: row.status,
        question: row.question,
        context: row.context,
        errorCode: row.errorCode,
        errorSummary: safeDiagnosticSummary(row.errorSummary),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
        retryOfRunId: row.retryOfRunId,
        execution,
        usageCompleteness: execution?.usageCompleteness ?? 'legacy_unknown',
        fallbackSummary: safeFallbackSummary(row.modelMetadata),
        display: projections[index],
      };
    });
    const tail = visible.at(-1);
    return {
      items,
      nextCursor: hasMore && tail ? encodeCursor(tail.updatedAt, tail.id) : null,
      hasMore,
    };
  }

  async detail(id: string) {
    const rows = await this.prisma.$queryRaw<ResearchQueryRow[]>(Prisma.sql`
      SELECT
        r."id", r."provider", r."model", r."promptVersion", r."status", r."question",
        r."inputTokens", r."outputTokens", r."cost", r."result", r."context",
        r."modelMetadata", r."errorCode", r."errorSummary", r."durationMs",
        r."startedAt", r."completedAt", r."retryOfRunId", r."createdAt", r."updatedAt",
        relation."experimentId" AS "relationExperimentId"
      FROM "AiRun" AS r
      LEFT JOIN LATERAL (
        SELECT attempt."experimentId"
        FROM "OptimizationAttempt" AS attempt
        WHERE attempt."aiRunId"=r."id"
        ORDER BY attempt."createdAt" DESC, attempt."id" DESC
        LIMIT 1
      ) AS relation ON TRUE
      WHERE r."id"=${id}::uuid
      LIMIT 1
    `);
    const row = rows[0];
    if (!row) return null;
    await this.assertAccess(row.context);
    const display = (await this.projections([row]))[0];
    const execution = aiExecutionReadModel(row.modelMetadata);
    return {
      id: row.id,
      provider: row.provider,
      model: row.model,
      promptVersion: row.promptVersion,
      status: row.status,
      question: row.question,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cost: row.cost,
      result: row.result,
      context: row.context,
      errorCode: row.errorCode,
      errorSummary: safeDiagnosticSummary(row.errorSummary),
      durationMs: row.durationMs,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      retryOfRunId: row.retryOfRunId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      execution,
      usageCompleteness: execution?.usageCompleteness ?? 'legacy_unknown',
      fallbackSummary: safeFallbackSummary(row.modelMetadata),
      display,
    };
  }
}
