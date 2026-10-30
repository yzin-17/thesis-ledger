import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  aiExecutionSummarySchema,
  researchGenerationV2Contract,
  type AiFrozenResearchV2,
  type ResearchSubmissionV2,
} from '@thesis-ledger/schemas';
import type { PrismaService } from '../platform/prisma.service.js';
import type { AiProviderRegistry } from './provider-registry.js';
import type { AiRoutingSettingsService } from './ai-routing-settings.service.js';
import { withAiProviderConfigurationTransaction } from './ai-provider-configuration-transaction.js';
import { freezeAiResearchRoutes, loadAiResearchPolicy } from './ai-research-policy.js';
import {
  AiResearchSubmissionV2Store,
  type AiResearchSubmissionV2Access,
} from './ai-research-submission-v2.store.js';
import { verifyAiFrozenResearchV2 } from './ai-research-frozen-integrity-v2.js';
import { assertResearchV2WritesEnabled } from './ai-research-v2-write-policy.js';
import { buildFrozenResearchMessagesV2 } from './ai-research-messages-v2.js';
import { researchInputTokenEstimate } from './ai-research-sdk-reservation.js';
import { currentAiTraceReference } from './trace/ai-trace-context.js';
import { queuedResearchClock } from './timeout/ai-execution-clock.js';
import { aiTimeoutProfileFor } from './timeout/ai-timeout-policy.js';

/** V2 的受控创建入口；找回原提交不依赖当前写入开关或重新取数。 */
export class AiResearchSubmissionV2 {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers?: AiProviderRegistry,
    private readonly settings?: AiRoutingSettingsService,
  ) {}

  find(ownerId: string, input: ResearchSubmissionV2, access: AiResearchSubmissionV2Access) {
    return new AiResearchSubmissionV2Store(this.prisma, access).find(ownerId, input);
  }

  cancel(ownerId: string, input: ResearchSubmissionV2, access: AiResearchSubmissionV2Access) {
    return new AiResearchSubmissionV2Store(this.prisma, access).cancel(ownerId, input);
  }

  inspectDefault(revision: string) {
    assertResearchV2WritesEnabled();
    return withAiProviderConfigurationTransaction(this.prisma, async (transaction) => {
      const ready = await this.defaultExecution(transaction, revision);
      return {
        researchSettingsRevision: ready.routing.revision,
        provider: ready.routes.provider,
        model: ready.routes.model,
      };
    });
  }

  async start(
    ownerId: string,
    source: AiFrozenResearchV2,
    access: AiResearchSubmissionV2Access,
    signal?: AbortSignal,
  ) {
    const store = new AiResearchSubmissionV2Store(this.prisma, access);
    const existing = await store.find(ownerId, source.request);
    if (existing) return { run: existing, reused: true };
    assertResearchV2WritesEnabled();
    const frozen = verifyAiFrozenResearchV2(source);
    return store.submit(
      ownerId,
      frozen,
      async (transaction) => {
        signal?.throwIfAborted();
        assertResearchV2WritesEnabled();
        const ready = await this.defaultExecution(transaction, frozen.researchSettingsRevision);
        signal?.throwIfAborted();
        if (
          researchInputTokenEstimate(buildFrozenResearchMessagesV2(frozen)) >
          ready.policy.maxInputTokens
        )
          throw new BadRequestException({
            code: 'RESEARCH_INPUT_BUDGET_EXCEEDED',
            message: '研究材料超过当前输入预算，请缩小研究范围',
          });
        const sdkExecution = aiExecutionSummarySchema.parse({
          version: 'sdk-execution-v1',
          contract: researchGenerationV2Contract.ref,
          frozenPolicy: ready.policy,
          deadlineAt: null,
          timing: queuedResearchClock(ready.policy, ready.routes.routes[0]),
          generationStatus: 'pending',
          usageCompleteness: 'unknown',
          requests: [],
          continuationBlockedReason: null,
        });
        return {
          provider: ready.routes.provider,
          model: ready.routes.model,
          sdkExecution,
          metadata: {
            researchPolicy: ready.policy,
            researchRoutes: ready.routes.routes,
            researchDefault: ready.routing.researchDefault,
            ...(currentAiTraceReference() ? { diagnosticTrace: currentAiTraceReference() } : {}),
          },
        };
      },
      () => signal?.throwIfAborted(),
    );
  }

  private async defaultExecution(transaction: Prisma.TransactionClient, revision: string) {
    if (!this.settings || !this.providers) throw new BadRequestException('研究默认模型配置不可用');
    const routing = await this.settings.read(transaction);
    if (!routing.researchDefault) throw new BadRequestException('请先选择研究默认模型');
    if (routing.revision !== revision)
      throw new ConflictException({
        code: 'RESEARCH_SETTINGS_REVISION_CHANGED',
        message: '研究默认模型已变化，请刷新选择后重新提交',
      });
    const policy = loadAiResearchPolicy();
    const routes = freezeAiResearchRoutes(
      this.providers,
      policy,
      routing.researchDefault,
      researchGenerationV2Contract.ref,
    );
    if (routes.provider === 'pending' || routes.routes.length === 0)
      throw new BadRequestException('研究默认模型尚无可执行的 V2 合同路由');
    return {
      routing,
      policy: loadAiResearchPolicy(aiTimeoutProfileFor(routes.routes[0] ?? {})),
      routes,
    };
  }
}
