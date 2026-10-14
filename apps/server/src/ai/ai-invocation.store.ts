import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { aiInvocationFactSchema, aiInvocationPreparationSchema } from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { canAppendInvocationFact } from './ai-invocation-policy.js';

const conflict = (message: string): never => { throw new ConflictException({ code: 'AI_INVOCATION_CONFLICT', message }); };
const canonical = (value: unknown) => JSON.stringify(value);

/** Internal AI facts; business lease changes must not prevent recording a received response. */
@Injectable()
export class AiInvocationStore {
  constructor(private readonly database: PrismaService) {}

  prepare(input: unknown) {
    const preparation = aiInvocationPreparationSchema.parse(input);
    return this.database.$transaction(async (tx) => {
      // Unique intent key serializes concurrent preparations without creating a second paid request.
      await tx.aiInvocation.createMany({ data: preparation, skipDuplicates: true });
      const existing = await tx.aiInvocation.findUniqueOrThrow({ where: { consumer_referenceId_executionAttempt: {
        consumer: preparation.consumer, referenceId: preparation.referenceId, executionAttempt: preparation.executionAttempt,
      } } });
      const parsed = aiInvocationPreparationSchema.parse({
        requestId: existing.requestId, consumer: existing.consumer, referenceId: existing.referenceId,
        ownerId: existing.ownerId, executionAttempt: existing.executionAttempt, providerId: existing.providerId,
        requestedModel: existing.requestedModel, inputFingerprint: existing.inputFingerprint,
      });
      if (canonical(parsed) !== canonical(preparation)) return conflict('同一调用意图不能更换请求或模型输入');
      return existing;
    });
  }

  append(requestId: string, input: unknown) {
    z.uuid().parse(requestId);
    const fact = aiInvocationFactSchema.parse(input);
    return this.database.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ requestId: string }[]>(Prisma.sql`
        SELECT "requestId" FROM "AiInvocation" WHERE "requestId"=${requestId}::uuid FOR UPDATE`);
      if (!rows[0]) throw new NotFoundException({ code: 'AI_INVOCATION_NOT_FOUND', message: '调用记录不存在' });
      const previousEvent = await tx.aiInvocationFact.findUnique({ where: { requestId_eventKey: { requestId, eventKey: fact.eventKey } } });
      if (previousEvent) {
        if (canonical(aiInvocationFactSchema.parse(previousEvent.details)) !== canonical(fact))
          return conflict('同一事实修订不能覆盖已有内容');
        return previousEvent;
      }
      const latest = await tx.aiInvocationFact.findFirst({ where: { requestId }, orderBy: { sequence: 'desc' } });
      const kind = latest ? aiInvocationFactSchema.parse(latest.details).kind : null;
      if (!canAppendInvocationFact(kind, fact.kind)) return conflict('调用事实状态转换无效');
      return tx.aiInvocationFact.create({ data: { requestId, eventKey: fact.eventKey, sequence: (latest?.sequence ?? 0) + 1,
        kind: fact.kind, details: fact } });
    });
  }

  read(ownerId: string, requestId: string) {
    z.uuid().parse(ownerId); z.uuid().parse(requestId);
    return this.database.aiInvocation.findFirst({ where: { requestId, ownerId }, include: { facts: { orderBy: { sequence: 'asc' } } } });
  }
  forReference(ownerId: string, referenceId: string) {
    z.uuid().parse(ownerId); z.uuid().parse(referenceId);
    return this.database.aiInvocation.findMany({ where: { ownerId, referenceId, consumer: 'strategy_authoring' }, take: 5,
      orderBy: { executionAttempt: 'asc' }, include: { facts: { orderBy: { sequence: 'asc' } } } });
  }
}
