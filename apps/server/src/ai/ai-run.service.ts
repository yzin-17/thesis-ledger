import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  aiContextSchema,
  aiResearchStartInputSchema,
  researchResultSchema,
} from '@thesis-ledger/schemas';
import type { z } from 'zod';
import { PrismaService } from '../platform/prisma.service.js';
import type { AiToolCallAuditInput } from './tool-runtime.js';
import { AiProviderRegistry, completeWithFallback } from './provider-registry.js';

export interface ProviderCompletionRequest {
  model: string;
  messages: unknown[];
  tools: string[];
  preferred?: string;
  toolCallIds?: readonly string[];
}

type AiResearchStartInput = z.infer<typeof aiResearchStartInputSchema>;

export interface AiRunPage<T = unknown> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface ResearchFinishRoute {
  provider?: string;
  model?: string;
  fallbackErrors?: readonly string[];
  toolCallIds?: readonly string[];
}

const fallbackSummary = (metadata: unknown) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const errors = (metadata as { fallbackErrors?: unknown }).fallbackErrors;
  if (!Array.isArray(errors)) return null;
  const safeErrors = errors
    .filter((error): error is string => typeof error === 'string')
    .slice(0, 3)
    .map((error) => error.slice(0, 160));
  return safeErrors.length > 0 ? safeErrors.join('；') : null;
};

const encodeCursor = (createdAt: Date | string, id: string) => {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  return Buffer.from(JSON.stringify({ createdAt: date.toISOString(), id })).toString('base64url');
};

const decodeCursor = (cursor?: string) => {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      createdAt?: unknown;
      id?: unknown;
    };
    if (typeof value.createdAt !== 'string' || typeof value.id !== 'string') return null;
    const createdAt = new Date(value.createdAt);
    return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id: value.id };
  } catch {
    return null;
  }
};

const sanitizeError = (error: unknown) => {
  let message = '未知错误';
  if (error instanceof Error) message = error.message;
  else if (typeof error === 'string') message = error;
  if (message === '未知错误') return message;
  return message
    .replace(/Bearer\s+\S+/giu, 'Bearer [REDACTED]')
    .replace(/(?:sk-|api[_-]?key[=:])\S+/giu, '[REDACTED]')
    .slice(0, 500);
};

type ModelWithFindUnique = {
  findUnique?: (args: unknown) => Promise<unknown>;
};

@Injectable()
export class AiRunService {
  constructor(private readonly prisma: PrismaService) {}

  start(
    provider: string,
    model: string,
    promptVersion: string,
    context?: unknown,
    modelMetadata?: unknown,
    question?: string,
    retryOfRunId?: string,
  ) {
    const parsedContext = context === undefined ? undefined : aiContextSchema.parse(context);
    return this.prisma.aiRun.create({
      data: {
        provider,
        model,
        promptVersion,
        status: 'running',
        startedAt: new Date(),
        ...(question === undefined ? {} : { question }),
        ...(retryOfRunId === undefined ? {} : { retryOfRunId }),
        ...(parsedContext === undefined ? {} : { context: parsedContext }),
        ...(modelMetadata === undefined
          ? {}
          : { modelMetadata: modelMetadata as Prisma.InputJsonValue }),
      },
    });
  }

  private async assertResearchContext(parsed: AiResearchStartInput) {
    const models = this.prisma as unknown as {
      account?: ModelWithFindUnique;
      position?: ModelWithFindUnique;
      strategyVersion?: ModelWithFindUnique;
      aiRun?: ModelWithFindUnique;
    };
    const context = parsed.context;

    if (context.accountId && models.account?.findUnique) {
      const account = (await models.account.findUnique({
        where: { id: context.accountId },
        select: { id: true, active: true },
      })) as { id?: string; active?: boolean } | null;
      if (!account) throw new NotFoundException(`账户不存在: ${context.accountId}`);
      if (account.active === false) throw new BadRequestException('账户已停用，不能创建研究任务');
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
      if (!position)
        throw new NotFoundException(`持仓不存在: ${context.accountId}/${context.symbol}`);
    }

    if (context.strategyVersionId && models.strategyVersion?.findUnique) {
      const version = await models.strategyVersion.findUnique({
        where: { id: context.strategyVersionId },
        select: { id: true },
      });
      if (!version) throw new NotFoundException(`策略版本不存在: ${context.strategyVersionId}`);
    }

    if (parsed.retryOfRunId && models.aiRun?.findUnique) {
      const source = await models.aiRun.findUnique({
        where: { id: parsed.retryOfRunId },
        select: { id: true },
      });
      if (!source) throw new NotFoundException(`原研究任务不存在: ${parsed.retryOfRunId}`);
    }
  }

  private async assertStoredRunAccess(contextValue: unknown) {
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

  async startResearch(input: AiResearchStartInput) {
    const parsed = aiResearchStartInputSchema.parse(input);
    await this.assertResearchContext(parsed);
    return this.prisma.aiRun.create({
      data: {
        provider: 'pending',
        model: 'pending',
        promptVersion: 'research-v1',
        status: 'queued',
        question: parsed.question,
        context: parsed.context,
        ...(parsed.templateId === undefined
          ? {}
          : { modelMetadata: { templateId: parsed.templateId } }),
        ...(parsed.retryOfRunId === undefined ? {} : { retryOfRunId: parsed.retryOfRunId }),
      },
    });
  }

  checkpoint(id: string, checkpoint: object) {
    return this.prisma.aiRun.update({ where: { id }, data: { checkpoint } });
  }

  /** Server-internal compatibility method; it still crosses the ResearchResult boundary. */
  finish(
    id: string,
    result: unknown,
    usage: { inputTokens: number; outputTokens: number; cost: number },
    durationMs?: number,
  ) {
    return this.finishResearch(id, result, usage, durationMs);
  }

  private persistValidatedResult(
    id: string,
    result: unknown,
    usage: { inputTokens: number; outputTokens: number; cost: number },
    durationMs?: number,
    route?: ResearchFinishRoute,
  ) {
    return this.prisma.aiRun.update({
      where: { id },
      data: {
        status: 'succeeded',
        result: result as Prisma.InputJsonValue,
        completedAt: new Date(),
        claimedAt: null,
        leaseUntil: null,
        ...(route?.provider ? { provider: route.provider } : {}),
        ...(route?.model ? { model: route.model } : {}),
        ...(route?.fallbackErrors && route.fallbackErrors.length > 0
          ? { modelMetadata: { fallbackErrors: [...route.fallbackErrors] } }
          : {}),
        ...usage,
        ...(durationMs === undefined ? {} : { durationMs }),
      },
    });
  }

  /** Persist research only after it crosses the structured ResearchResult V1 boundary. */
  finishResearch(
    id: string,
    result: unknown,
    usage: { inputTokens: number; outputTokens: number; cost: number },
    durationMs?: number,
    route?: ResearchFinishRoute,
  ) {
    const parsed = researchResultSchema.parse(result);
    if (parsed.evidence.length === 0) throw new Error('研究结果缺少证据');
    if (route?.toolCallIds) {
      const expectedIds = new Set(route.toolCallIds);
      const citationIds = parsed.evidence.flatMap((item) =>
        item.citations.map((citation) => citation.toolCallId),
      );
      if (citationIds.some((toolCallId) => !toolCallId || !expectedIds.has(toolCallId)))
        throw new Error('研究结论的每条证据必须关联本次执行的 Tool call');
      const toolCalls = this.prisma.aiToolCall;
      if (!toolCalls?.findMany) throw new Error('缺少本次研究的 Tool 审计记录');
      return toolCalls
        .findMany({
          where: { aiRunId: id, id: { in: [...expectedIds] } },
          select: { id: true },
        })
        .then((calls) => {
          if (calls.length !== expectedIds.size)
            throw new Error('研究结论引用了不属于本任务的 Tool call');
          return this.persistValidatedResult(id, parsed, usage, durationMs, route);
        });
    }
    return this.persistValidatedResult(id, parsed, usage, durationMs, route);
  }

  async completeWithProvider(
    id: string,
    registry: AiProviderRegistry,
    input: ProviderCompletionRequest,
  ) {
    const startedAt = Date.now();
    try {
      const completion = await completeWithFallback(registry, input);
      const parsed = researchResultSchema.parse(completion.content);
      const durationMs = Date.now() - startedAt;
      const run = await this.finishResearch(
        id,
        parsed,
        {
          inputTokens: completion.inputTokens,
          outputTokens: completion.outputTokens,
          cost: completion.cost,
        },
        durationMs,
        {
          provider: completion.provider,
          model: input.model,
          fallbackErrors: completion.fallbackErrors,
          toolCallIds: input.toolCallIds ?? [],
        },
      );
      return { run, completion: { ...completion, content: parsed }, durationMs };
    } catch (error) {
      await this.fail(
        id,
        'provider_completion_failed',
        sanitizeError(error),
        Date.now() - startedAt,
      );
      throw error;
    }
  }

  /** Atomically claims one queued run and assigns a short lease to the worker. */
  async claim(id: string, leaseMs = 60_000) {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + leaseMs);
    const updateMany = (
      this.prisma.aiRun as unknown as {
        updateMany?: (args: unknown) => Promise<{ count: number }>;
      }
    ).updateMany;
    if (!updateMany) return null;
    const result = await updateMany({
      where: { id, status: 'queued' },
      data: {
        status: 'running',
        startedAt: now,
        claimedAt: now,
        leaseUntil,
        executionAttempt: { increment: 1 },
        errorCode: null,
        errorSummary: null,
      },
    });
    if (result.count !== 1) return null;
    return this.prisma.aiRun.findUnique({ where: { id } });
  }

  async renewLease(id: string, leaseMs = 60_000) {
    return this.prisma.aiRun.updateMany({
      where: { id, status: 'running' },
      data: { leaseUntil: new Date(Date.now() + leaseMs) },
    });
  }

  async fail(id: string, errorCode: string, errorSummary: string, durationMs?: number) {
    return this.prisma.aiRun.update({
      where: { id },
      data: {
        status: 'failed',
        errorCode: errorCode.slice(0, 100),
        errorSummary: errorSummary.slice(0, 500),
        completedAt: new Date(),
        claimedAt: null,
        leaseUntil: null,
        ...(durationMs === undefined ? {} : { durationMs }),
      },
    });
  }

  async recoverStaleRuns(now = new Date(), maxAttempts = 3) {
    const stale = await this.prisma.aiRun.updateMany({
      where: { status: 'running', leaseUntil: { lt: now }, executionAttempt: { lt: maxAttempts } },
      data: {
        status: 'queued',
        claimedAt: null,
        leaseUntil: null,
        errorCode: 'worker_lease_expired',
        errorSummary: '执行 Worker 租约已过期，任务已重新排队',
      },
    });
    const exhausted = await this.prisma.aiRun.updateMany({
      where: { status: 'running', leaseUntil: { lt: now }, executionAttempt: { gte: maxAttempts } },
      data: {
        status: 'failed',
        claimedAt: null,
        leaseUntil: null,
        errorCode: 'worker_lease_exhausted',
        errorSummary: '执行 Worker 多次租约过期，已停止自动重试',
        completedAt: now,
      },
    });
    return { requeued: stale.count, failed: exhausted.count };
  }

  /** Server runtime only; callers must derive audit facts from actual execution. */
  recordToolCall(input: AiToolCallAuditInput) {
    return this.prisma.aiToolCall.create({
      data: {
        aiRunId: input.runId,
        tool: input.tool,
        permission: input.permission,
        status: input.status,
        inputSummary: input.inputSummary,
        ...(input.outputSummary === undefined ? {} : { outputSummary: input.outputSummary }),
        ...(input.provider === undefined ? {} : { provider: input.provider }),
        ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
        ...(input.marketTime === undefined ? {} : { marketTime: new Date(input.marketTime) }),
        ...(input.availableAt === undefined ? {} : { availableAt: new Date(input.availableAt) }),
        ...(input.fetchedAt === undefined ? {} : { fetchedAt: new Date(input.fetchedAt) }),
      },
    });
  }

  async resume(id: string) {
    const run = await this.prisma.aiRun.findUnique({
      where: { id },
      select: {
        id: true,
        provider: true,
        model: true,
        promptVersion: true,
        status: true,
        question: true,
        inputTokens: true,
        outputTokens: true,
        cost: true,
        checkpoint: true,
        result: true,
        context: true,
        errorCode: true,
        errorSummary: true,
        durationMs: true,
        startedAt: true,
        completedAt: true,
        retryOfRunId: true,
        createdAt: true,
        updatedAt: true,
        modelMetadata: true,
      },
    });
    if (!run) return null;
    await this.assertStoredRunAccess(run.context);
    const { modelMetadata, ...safeRun } = run;
    return { ...safeRun, fallbackSummary: fallbackSummary(modelMetadata) };
  }

  private async listPageInternal(
    limit = 50,
    status?: string,
    cursor?: string,
    includeLookahead = true,
  ) {
    const bounded = Math.max(1, Math.min(limit, 100));
    const decoded = decodeCursor(cursor);
    if (cursor && !decoded) throw new BadRequestException('研究任务游标无效');
    const where: Prisma.AiRunWhereInput = {
      ...(status ? { status } : {}),
      ...(decoded
        ? {
            OR: [
              { createdAt: { lt: decoded.createdAt } },
              { createdAt: decoded.createdAt, id: { lt: decoded.id } },
            ],
          }
        : {}),
    };
    const runs = await this.prisma.aiRun.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: bounded + (includeLookahead ? 1 : 0),
      select: {
        id: true,
        provider: true,
        model: true,
        promptVersion: true,
        status: true,
        question: true,
        context: true,
        errorCode: true,
        errorSummary: true,
        createdAt: true,
        updatedAt: true,
        startedAt: true,
        completedAt: true,
        retryOfRunId: true,
        modelMetadata: true,
      },
    });
    const hasMore = includeLookahead && runs.length > bounded;
    const visible = hasMore ? runs.slice(0, bounded) : runs;
    const items = visible.map(({ modelMetadata, ...run }) => ({
      ...run,
      fallbackSummary: fallbackSummary(modelMetadata),
    }));
    const tail = visible.at(-1);
    return {
      items,
      nextCursor: hasMore && tail ? encodeCursor(tail.createdAt, tail.id) : null,
      hasMore,
    } satisfies AiRunPage;
  }

  async listPage(limit = 50, status?: string, cursor?: string) {
    return this.listPageInternal(limit, status, cursor);
  }

  /** Compatibility helper for internal callers that still consume an array. */
  async list(limit = 50, status?: string) {
    const page = await this.listPageInternal(limit, status, undefined, false);
    return page.items;
  }

  async listToolCalls(runId: string, limit = 50, cursor?: string) {
    const run = await this.prisma.aiRun.findUnique({
      where: { id: runId },
      select: { id: true, context: true },
    });
    if (!run) throw new NotFoundException(`研究任务不存在: ${runId}`);
    await this.assertStoredRunAccess(run.context);
    const bounded = Math.max(1, Math.min(limit, 100));
    const decoded = decodeCursor(cursor);
    if (cursor && !decoded) throw new BadRequestException('Tool 调用游标无效');
    const calls = await this.prisma.aiToolCall.findMany({
      where: {
        aiRunId: runId,
        ...(decoded
          ? {
              OR: [
                { createdAt: { gt: decoded.createdAt } },
                { createdAt: decoded.createdAt, id: { gt: decoded.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: bounded + 1,
    });
    const hasMore = calls.length > bounded;
    const visible = hasMore ? calls.slice(0, bounded) : calls;
    const tail = visible.at(-1);
    return {
      items: visible,
      nextCursor: hasMore && tail ? encodeCursor(tail.createdAt, tail.id) : null,
      hasMore,
    };
  }

  async usageSummary(start?: Date, end?: Date) {
    const runs = await this.prisma.aiRun.findMany({
      where: {
        ...(start || end
          ? { createdAt: { ...(start ? { gte: start } : {}), ...(end ? { lt: end } : {}) } }
          : {}),
      },
    });
    return runs.reduce(
      (summary: { runs: number; inputTokens: number; outputTokens: number; cost: number }, run) => {
        summary.runs += 1;
        summary.inputTokens += run.inputTokens;
        summary.outputTokens += run.outputTokens;
        summary.cost += Number(run.cost);
        return summary;
      },
      { runs: 0, inputTokens: 0, outputTokens: 0, cost: 0 },
    );
  }

  createDecisionLog(input: {
    symbol?: string;
    accountId?: string;
    question: string;
    assumptions: unknown;
    conclusion: unknown;
    context?: unknown;
    provenance?: unknown;
  }) {
    return this.prisma.aiDecisionLog.create({
      data: {
        ...(input.symbol === undefined ? {} : { symbol: input.symbol }),
        ...(input.accountId === undefined ? {} : { accountId: input.accountId }),
        question: input.question,
        assumptions: input.assumptions as Prisma.InputJsonValue,
        conclusion: input.conclusion as Prisma.InputJsonValue,
        ...(input.context === undefined ? {} : { context: input.context as Prisma.InputJsonValue }),
        ...(input.provenance === undefined
          ? {}
          : { provenance: input.provenance as Prisma.InputJsonValue }),
      },
    });
  }

  listDecisionLogs(symbol?: string) {
    return this.prisma.aiDecisionLog.findMany({
      ...(symbol ? { where: { symbol } } : {}),
      orderBy: { createdAt: 'desc' },
    });
  }
}
