import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { requireNewStrategyDefinition } from './strategy-definition-write.js';
import type { PrismaService } from '../platform/prisma.service.js';

/** 所有正式版本发布共用同一策略锁；实验内部的非正版本另行分配。 */
export async function lockStrategyVersionPublication(
  transaction: Prisma.TransactionClient,
  strategyId: string,
) {
  await transaction.$executeRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtextextended(${strategyId}, 1))
  `);
}

export async function publishManualStrategyVersion(
  prisma: PrismaService,
  strategyId: string,
  schema: unknown,
) {
  if (!schema || typeof schema !== 'object' || !('entryTrigger' in schema) || schema.entryTrigger === undefined)
    throw new BadRequestException({ code: 'STRATEGY_ENTRY_TRIGGER_REQUIRED', message: '请先按原版本物化并核对入场政策，再发布新版本。' });
  const parsed = requireNewStrategyDefinition(schema);
  return prisma.$transaction(async (transaction) => {
    await lockStrategyVersionPublication(transaction, strategyId);
    const owner = await transaction.strategy.findUnique({
      where: { id: strategyId }, select: { schemaVersion: true },
    });
    if (!owner) throw new NotFoundException('策略不存在');
    if (owner.schemaVersion !== 1) {
      throw new ConflictException({
        code: 'UNSUPPORTED_CONTRACT_VERSION', message: '旧策略不支持创建现行版本',
      });
    }
    const latest = await transaction.strategyVersion.aggregate({
      where: { strategyId }, _max: { version: true },
    });
    return transaction.strategyVersion.create({ data: {
      strategyId, version: Math.max(latest._max.version ?? 0, 0) + 1,
      schemaVersion: 1, schema: parsed,
      source: { kind: 'manual' },
    } });
  });
}
