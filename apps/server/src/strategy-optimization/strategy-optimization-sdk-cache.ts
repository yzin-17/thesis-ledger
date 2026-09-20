import { aiExecutionSummarySchema } from '@thesis-ledger/schemas';
import type { PrismaService } from '../platform/prisma.service.js';
import { toRecord } from './strategy-optimization-common.js';

export type OptimizationSdkCacheIdentity = {
  adapter: string;
  mode: string;
  contract: { id: string; version: string };
  configurationFingerprint: string;
};

export const reusableOptimizationSdkCache = async (
  prisma: PrismaService,
  aiRunId: string,
  identity: OptimizationSdkCacheIdentity | null,
) => {
  if (identity === null) return null;
  const run = await prisma.aiRun.findUnique({
    where: { id: aiRunId },
    select: { status: true, modelMetadata: true },
  });
  if (!run || run.status !== 'succeeded') throw new Error('优化缓存缺少已成功 AiRun');
  const metadata = toRecord(run.modelMetadata);
  const savedIdentity = toRecord(metadata.sdkCacheIdentity);
  const savedContract = toRecord(savedIdentity.contract);
  const sameIdentity =
    savedIdentity.adapter === identity.adapter &&
    savedIdentity.mode === identity.mode &&
    savedIdentity.configurationFingerprint === identity.configurationFingerprint &&
    savedContract.id === identity.contract.id &&
    savedContract.version === identity.contract.version;
  if (!sameIdentity)
    throw new Error('AI Provider 执行配置已变更，禁止复用旧缓存');
  const execution = aiExecutionSummarySchema.safeParse(metadata.sdkExecution);
  const accepted = execution.success
    ? execution.data.requests.some(
        (request) =>
          request.state === 'completed' &&
          request.outcome?.status === 'complete' &&
          request.outcome.schemaAccepted,
      )
    : false;
  if (!execution.success || execution.data.generationStatus !== 'complete' || !accepted)
    throw new Error('AI Provider 缓存不是完整且合法的结果');
  return execution.data.continuationBlockedReason;
};
