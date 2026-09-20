import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  aiContextSchema,
  aiResearchRetryPrefillSchema,
  aiResearchTemplateIdSchema,
  classifyAiResearchTask,
} from '@thesis-ledger/schemas';
import type { aiResearchStartInputSchema } from '@thesis-ledger/schemas';
import type { z } from 'zod';
import type { PrismaService } from '../platform/prisma.service.js';

type AiResearchStartInput = z.infer<typeof aiResearchStartInputSchema>;

type ModelWithFindUnique = {
  findUnique?: (args: unknown) => Promise<unknown>;
};

type RetrySourceRun = {
  id: string;
  promptVersion: string;
  status: string;
  question: string | null;
  context: unknown;
  modelMetadata: unknown;
  errorCode: string | null;
};

const metadataRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const sameResearchContext = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

export class AiResearchRetry {
  constructor(private readonly prisma: PrismaService) {}

  private async source(id: string): Promise<RetrySourceRun> {
    const source = (await this.prisma.aiRun.findUnique({
      where: { id },
      select: {
        id: true,
        promptVersion: true,
        status: true,
        question: true,
        context: true,
        modelMetadata: true,
        errorCode: true,
      },
    })) as RetrySourceRun | null;
    if (!source) throw new NotFoundException(`原研究任务不存在: ${id}`);
    const metadata = metadataRecord(source.modelMetadata);
    const taskKind = classifyAiResearchTask({
      promptVersion: source.promptVersion,
      context: source.context,
      optimizationExperimentId:
        typeof metadata.optimizationExperimentId === 'string'
          ? metadata.optimizationExperimentId
          : null,
      experimentRelation: 'unchecked',
    });
    if (taskKind !== 'research') throw new BadRequestException('来源任务不是可再次生成的研究任务');
    if (source.status !== 'failed') throw new BadRequestException('只有失败的研究任务可以再次生成');
    if (!source.question?.trim()) throw new BadRequestException('来源任务缺少可预填的研究问题');
    return source;
  }

  private async contextState(contextValue: unknown): Promise<'valid' | 'missing' | 'forbidden'> {
    const parsed = aiContextSchema.safeParse(contextValue);
    if (!parsed.success) return 'missing';
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
      if (!account) return 'missing';
      if (account.active === false) return 'forbidden';
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
      if (!position) return 'missing';
    }
    if (context.strategyVersionId && models.strategyVersion?.findUnique) {
      const version = await models.strategyVersion.findUnique({
        where: { id: context.strategyVersionId },
        select: { id: true },
      });
      if (!version) return 'missing';
    }
    return 'valid';
  }

  async prefill(id: string) {
    const source = await this.source(id);
    const context = aiContextSchema.parse(source.context);
    const metadata = metadataRecord(source.modelMetadata);
    const sourceOutcome = source.errorCode === 'research_unknown_outcome' ? 'unknown' : 'failed';
    const templateId = aiResearchTemplateIdSchema.safeParse(metadata.templateId);
    return aiResearchRetryPrefillSchema.parse({
      sourceRunId: source.id,
      question: source.question,
      context,
      templateId: templateId.success ? templateId.data : null,
      sourceOutcome,
      contextState: await this.contextState(context),
      requiresUnknownOutcomeAcknowledgement: sourceOutcome === 'unknown',
    });
  }

  async assertRetry(parsed: AiResearchStartInput) {
    if (!parsed.retryOfRunId) return;
    const confirmation = parsed.retryConfirmation;
    if (!confirmation) throw new BadRequestException('再次生成前必须确认预填内容和风险');
    const source = await this.source(parsed.retryOfRunId);
    const sourceContext = aiContextSchema.parse(source.context);
    const contextState = await this.contextState(sourceContext);
    if (contextState === 'forbidden') {
      throw new BadRequestException('来源任务上下文已不可访问，不能再次生成');
    }
    if (contextState === 'missing' && sameResearchContext(sourceContext, parsed.context)) {
      throw new BadRequestException('来源任务上下文已失效，请显式重新选择研究对象');
    }
    const unknown = source.errorCode === 'research_unknown_outcome';
    if (unknown && !confirmation.acknowledgeUnknownOutcomeRisk) {
      throw new BadRequestException('未知外部结果可能仍在执行，必须确认风险后才能再次生成');
    }
    if (!unknown && confirmation.acknowledgeUnknownOutcomeRisk) {
      throw new BadRequestException('普通失败来源不需要确认未知结果风险');
    }
  }
}
