import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { aiContextSchema } from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import type { AiToolCallAuditInput } from './tool-runtime.js';
import { AiProviderRegistry, completeWithFallback } from './provider-registry.js';

export interface ProviderCompletionRequest {
  model: string;
  messages: unknown[];
  tools: string[];
  preferred?: string;
}

@Injectable()
export class AiRunService {
  constructor(private readonly prisma: PrismaService) {}

  start(
    provider: string,
    model: string,
    promptVersion: string,
    context?: unknown,
    modelMetadata?: unknown,
  ) {
    const parsedContext = context === undefined ? undefined : aiContextSchema.parse(context);
    return this.prisma.aiRun.create({
      data: {
        provider,
        model,
        promptVersion,
        status: 'running',
        ...(parsedContext === undefined ? {} : { context: parsedContext }),
        ...(modelMetadata === undefined
          ? {}
          : { modelMetadata: modelMetadata as Prisma.InputJsonValue }),
      },
    });
  }

  checkpoint(id: string, checkpoint: object) {
    return this.prisma.aiRun.update({ where: { id }, data: { checkpoint } });
  }

  /** Server-internal compatibility method. HTTP clients cannot call this directly. */
  finish(
    id: string,
    result: unknown,
    usage: { inputTokens: number; outputTokens: number; cost: number },
    durationMs?: number,
  ) {
    return this.prisma.aiRun.update({
      where: { id },
      data: {
        status: 'succeeded',
        result: result as Prisma.InputJsonValue,
        ...usage,
        ...(durationMs === undefined ? {} : { durationMs }),
      },
    });
  }

  async completeWithProvider(
    id: string,
    registry: AiProviderRegistry,
    input: ProviderCompletionRequest,
  ) {
    const startedAt = Date.now();
    try {
      const completion = await completeWithFallback(registry, input);
      const durationMs = Date.now() - startedAt;
      const run = await this.prisma.aiRun.update({
        where: { id },
        data: {
          provider: completion.provider,
          model: input.model,
          status: 'succeeded',
          result: completion.content as Prisma.InputJsonValue,
          inputTokens: completion.inputTokens,
          outputTokens: completion.outputTokens,
          cost: completion.cost,
          durationMs,
        },
      });
      return { run, completion, durationMs };
    } catch (error) {
      await this.prisma.aiRun.update({
        where: { id },
        data: { status: 'failed', durationMs: Date.now() - startedAt },
      });
      throw error;
    }
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

  resume(id: string) {
    return this.prisma.aiRun.findUnique({ where: { id } });
  }

  list(limit = 50) {
    return this.prisma.aiRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(limit, 100)),
      select: {
        id: true,
        provider: true,
        model: true,
        promptVersion: true,
        status: true,
        context: true,
        createdAt: true,
        updatedAt: true,
      },
    });
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
        ...(input.context === undefined
          ? {}
          : { context: input.context as Prisma.InputJsonValue }),
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
