import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  aiExecutionSummarySchema,
  aiGenerationContracts,
  type AiResearchStartInput,
} from '@thesis-ledger/schemas';
import type { PrismaService } from '../platform/prisma.service.js';
import type { AiProviderRegistry } from './provider-registry.js';
import type { AiRoutingSettingsService } from './ai-routing-settings.service.js';
import { freezeAiResearchRoutes, loadAiResearchPolicy } from './ai-research-policy.js';
import { withAiProviderConfigurationTransaction } from './ai-provider-configuration-transaction.js';
import { aiFrozenResearchSchema, type AiFrozenResearch } from './ai-frozen-research.js';

function assertRoutingSettings(
  configured: boolean,
  routing: { researchDefault?: unknown; revision: string } | null,
  parsed: AiResearchStartInput,
) {
  if (configured && !routing?.researchDefault)
    throw new BadRequestException('请先选择研究默认模型');
  if (
    configured &&
    parsed.researchSettingsRevision !== undefined &&
    parsed.researchSettingsRevision !== routing?.revision
  )
    throw new ConflictException('研究默认模型已变化，请刷新选择后重新提交');
}

export class AiResearchSubmission {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers?: AiProviderRegistry,
    private readonly routingSettings?: AiRoutingSettingsService,
  ) {}
  start(parsed: AiResearchStartInput, source?: AiFrozenResearch) {
    const frozen =
      source === undefined ? undefined : aiFrozenResearchSchema.parse(structuredClone(source));
    const frozenJson =
      frozen === undefined
        ? undefined
        : (JSON.parse(JSON.stringify(frozen)) as Prisma.InputJsonValue);
    const policy = loadAiResearchPolicy();
    const createdAt = new Date();
    const deadlineAt = new Date(
      createdAt.getTime() + policy.maxDurationSeconds * 1_000,
    ).toISOString();
    const sdkExecution = aiExecutionSummarySchema.parse({
      version: 'sdk-execution-v1',
      contract: aiGenerationContracts.research.ref,
      frozenPolicy: policy,
      deadlineAt,
      generationStatus: 'pending',
      usageCompleteness: 'unknown',
      requests: [],
      continuationBlockedReason: null,
    });
    const persist = async (transaction?: Prisma.TransactionClient) => {
      const routing = this.routingSettings ? await this.routingSettings.read(transaction) : null;
      assertRoutingSettings(this.routingSettings !== undefined, routing, parsed);
      const routeSnapshot = freezeAiResearchRoutes(
        this.providers,
        policy,
        routing?.researchDefault,
      );
      if (this.routingSettings && routeSnapshot.provider === 'pending')
        throw new BadRequestException(
          '研究默认模型当前不可执行，请检查 Provider、模型和研究用途配置',
        );
      return (transaction ?? this.prisma).aiRun.create({
        data: {
          provider: routeSnapshot.provider,
          model: routeSnapshot.model,
          promptVersion: frozen?.prompt.version ?? 'research-v1',
          status: 'queued',
          question: parsed.question,
          context: parsed.context,
          createdAt,
          modelMetadata: {
            ...(parsed.templateId === undefined ? {} : { templateId: parsed.templateId }),
            researchPolicy: policy,
            researchRoutes: routeSnapshot.routes,
            ...(routing?.researchDefault === undefined
              ? {}
              : { researchDefault: routing.researchDefault }),
            ...(routing ? { researchSettingsRevision: routing.revision } : {}),
            sdkExecution,
            ...(frozen === undefined ? {} : { frozenResearch: frozenJson }),
          },
          ...(parsed.retryOfRunId === undefined ? {} : { retryOfRunId: parsed.retryOfRunId }),
        },
      });
    };
    if (this.routingSettings) return withAiProviderConfigurationTransaction(this.prisma, persist);
    return persist();
  }
}
