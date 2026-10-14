import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../platform/prisma.service.js';
import type { AiProviderLifecycleOptions } from './ai-provider.contracts.js';

export type StoredProviderLifecycleAction =
  { kind: 'set-enabled'; enabled: boolean } | { kind: 'delete' };

/** Default selection and configuration mutations share one cross-process transaction fence. */
export const withAiProviderConfigurationTransaction = <T>(
  prisma: PrismaService,
  work: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> =>
  prisma.$transaction(async (transaction) => {
    // A stable two-part PostgreSQL key also protects the first, absent global settings row.
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(72411, 1)`;
    return work(transaction);
  });

export const mutateAiProviderLifecycle = async (
  transaction: Prisma.TransactionClient,
  name: string,
  action: StoredProviderLifecycleAction,
  options: AiProviderLifecycleOptions,
) => {
  const expectedRevision = options.expectedRevision!;
  const current = await transaction.providerConfig.findUnique({ where: { name } });
  if (!current || current.type !== 'ai') throw new NotFoundException('AI Provider 配置不存在');
  if (current.updatedAt.toISOString() !== expectedRevision)
    throw new ConflictException('Provider 配置已变化，请刷新后重试');
  const settings = await transaction.aiRoutingSettings.findUnique({ where: { id: 'global' } });
  if (settings?.researchDefaultProvider === name) {
    if (!options.clearResearchDefault)
      throw new ConflictException('该 Provider 是研究默认模型，请先更换或清除研究默认模型');
    if (
      !options.expectedSettingsRevision ||
      options.expectedSettingsRevision !== String(settings.revision)
    )
      throw new ConflictException('AI 默认模型设置已变化，请刷新后重试');
    const cleared = await transaction.aiRoutingSettings.updateMany({
      where: { id: 'global', revision: settings.revision },
      data: {
        researchDefaultProvider: null,
        researchDefaultModel: null,
        revision: settings.revision + 1,
      },
    });
    if (cleared.count !== 1) throw new ConflictException('AI 默认模型设置已变化，请刷新后重试');
  } else if (options.clearResearchDefault) {
    throw new ConflictException('当前 Provider 不是研究默认模型，不能清除默认路由');
  }
  const where = { name, updatedAt: new Date(expectedRevision) };
  if (action.kind === 'set-enabled') {
    const updated = await transaction.providerConfig.updateMany({
      where,
      data: { enabled: action.enabled },
    });
    if (updated.count !== 1) throw new ConflictException('Provider 配置已变化，请刷新后重试');
    return transaction.providerConfig.findUnique({ where: { name } });
  }
  const deleted = await transaction.providerConfig.deleteMany({ where });
  if (deleted.count !== 1) throw new ConflictException('Provider 配置已变化，请刷新后重试');
  return null;
};
