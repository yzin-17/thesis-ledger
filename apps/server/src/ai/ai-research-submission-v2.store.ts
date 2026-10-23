import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  aiExecutionSummarySchema,
  aiFrozenResearchV2Schema,
  researchScopeSnapshotV2Schema,
  type AiExecutionSummary,
  type AiFrozenResearchV2,
  type ResearchScopeSnapshotV2,
  type ResearchSubmissionV2,
} from '@thesis-ledger/schemas';
import { z } from 'zod';
import type { PrismaService } from '../platform/prisma.service.js';
import { withAiProviderConfigurationTransaction } from './ai-provider-configuration-transaction.js';
import { cancelledResearchMetadataV2 } from './ai-research-cancellation-v2.js';
import {
  normalizeResearchSubmissionV2,
  researchSubmissionDigestV2,
} from './ai-research-submission-identity-v2.js';

/** 必须由持有已验证身份和领域权限的调用方实现，不能由请求数据提供。 */
export interface AiResearchSubmissionV2Access {
  assertSubmission(
    transaction: Prisma.TransactionClient,
    ownerId: string,
    input: ResearchSubmissionV2,
  ): Promise<void>;
  assertSnapshot(
    transaction: Prisma.TransactionClient,
    ownerId: string,
    snapshot: ResearchScopeSnapshotV2,
  ): Promise<void>;
}
export interface AiResearchSubmissionV2Execution {
  provider: string;
  model: string;
  sdkExecution: AiExecutionSummary;
  metadata?: Prisma.InputJsonObject;
}

/** 只负责持久化；模型准备、默认关闭的写入控制和 HTTP 接线由提交层负责。 */
export class AiResearchSubmissionV2Store {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AiResearchSubmissionV2Access,
  ) {}

  find(ownerValue: string, value: unknown) {
    const ownerId = z.uuid().parse(ownerValue).toLowerCase();
    const input = normalizeResearchSubmissionV2(value);
    return this.prisma.$transaction((transaction) => this.existing(transaction, ownerId, input));
  }

  cancel(ownerValue: string, value: unknown) {
    const ownerId = z.uuid().parse(ownerValue).toLowerCase();
    const input = normalizeResearchSubmissionV2(value);
    return this.prisma.$transaction(async (transaction) => {
      // 与请求结算锁同一行，取消与完成只能有一个先成为终态。
      await transaction.$queryRaw`SELECT "id" FROM "AiRun" WHERE "researchOwnerId" = ${ownerId}::uuid AND "researchSubmissionId" = ${input.submissionId}::uuid FOR UPDATE`;
      const run = await this.existing(transaction, ownerId, input);
      if (!run) throw new NotFoundException('研究提交不存在');
      if (run.status !== 'queued' && run.status !== 'running') return run;
      const now = new Date();
      return transaction.aiRun.update({
        where: { id: run.id },
        data: {
          status: 'cancelled',
          completedAt: now,
          claimedAt: null,
          leaseUntil: null,
          errorCode: 'research_cancelled',
          errorSummary: '用户取消了研究任务',
          modelMetadata: cancelledResearchMetadataV2(run.modelMetadata, now),
        },
      });
    });
  }

  submit(
    ownerValue: string,
    source: AiFrozenResearchV2,
    prepareExecution: (
      transaction: Prisma.TransactionClient,
    ) => Promise<AiResearchSubmissionV2Execution>,
    assertActive: () => void = () => {},
  ) {
    const ownerId = z.uuid().parse(ownerValue).toLowerCase();
    const frozen = aiFrozenResearchV2Schema.parse(structuredClone(source));
    const input = normalizeResearchSubmissionV2(frozen.request);
    return withAiProviderConfigurationTransaction(this.prisma, async (transaction) => {
      const existing = await this.existing(transaction, ownerId, input);
      if (existing) return { run: existing, reused: true };
      assertActive();
      await this.access.assertSnapshot(transaction, ownerId, frozen.scopeSnapshot);
      const seed = await prepareExecution(transaction);
      const execution = aiExecutionSummarySchema.parse(seed.sdkExecution);
      if (
        execution.contract.id !== 'research' ||
        execution.contract.version !== 'research-generation-v2' ||
        execution.generationStatus !== 'pending' ||
        execution.requests.length !== 0
      )
        throw new ConflictException('新研究必须保存尚未执行的 V2 配置');
      const run = await transaction.aiRun.create({
        data: {
          provider: z.string().trim().min(1).parse(seed.provider),
          model: z.string().trim().min(1).parse(seed.model),
          promptVersion: frozen.prompt.version,
          status: 'queued',
          question: input.question,
          context: frozen.scopeSnapshot,
          researchOwnerId: ownerId,
          researchSubmissionId: input.submissionId,
          researchInputDigest: researchSubmissionDigestV2(input),
          researchScopeSnapshot: frozen.scopeSnapshot,
          modelMetadata: {
            ...seed.metadata,
            researchSettingsRevision: frozen.researchSettingsRevision,
            sdkExecution: execution,
            frozenResearch: frozen,
          },
        },
      });
      assertActive();
      return { run, reused: false };
    });
  }

  private async existing(
    transaction: Prisma.TransactionClient,
    ownerId: string,
    input: ResearchSubmissionV2,
  ) {
    await this.access.assertSubmission(transaction, ownerId, input);
    const row = await transaction.aiRun.findUnique({
      where: {
        researchOwnerId_researchSubmissionId: {
          researchOwnerId: ownerId,
          researchSubmissionId: input.submissionId,
        },
      },
    });
    if (!row) return null;
    const scope = researchScopeSnapshotV2Schema.safeParse(row.researchScopeSnapshot);
    if (!scope.success) throw new ConflictException('已保存的研究范围无效，不能找回任务');
    await this.access.assertSnapshot(transaction, ownerId, scope.data);
    if (row.researchInputDigest !== researchSubmissionDigestV2(input))
      throw new ConflictException('提交标识已用于其他研究输入，请使用新的提交标识');
    return row;
  }
}
