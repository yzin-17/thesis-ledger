import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { RedisService } from '../platform/redis.service.js';
import { AiInvocationStore } from '../ai/ai-invocation.store.js';
import { aiInvocationFactSchema } from '@thesis-ledger/schemas';
import { AuthoringOperationRepository } from './authoring-operation.repository.js';
import { AuthoringExecutor } from './authoring.executor.js';
import { unknownAuthoringCost } from './authoring-model-policy.js';
import {
  AuthoringQueue,
  AUTHORING_QUEUE_NAME,
  AUTHORING_QUEUE_PREFIX,
  AUTHORING_HEARTBEAT_KEY,
  type AuthoringQueueData,
} from './authoring-queue.js';

@Injectable()
export class AuthoringWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker<AuthoringQueueData> | undefined;
  private connection: Redis | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private reconciling = false;
  private closing = false;
  constructor(
    private readonly redis: RedisService,
    private readonly queue: AuthoringQueue,
    private readonly operations: AuthoringOperationRepository,
    private readonly executor: AuthoringExecutor,
    private readonly audit: AiInvocationStore,
  ) {}
  onModuleInit() {
    if (process.env.NODE_ENV !== 'test') void this.start().catch(() => undefined);
  }
  async start() {
    if (this.worker) return;
    if (process.env.NODE_ENV === 'test' && !process.env.AUTHORING_TEST_SCOPE)
      throw new Error('测试 Worker 缺少独立队列范围');
    this.connection = this.redis.client.duplicate({ maxRetriesPerRequest: null });
    this.connection.on('error', () => undefined);
    this.worker = new Worker(
      AUTHORING_QUEUE_NAME,
      async (job) => {
        const data = z.object({ operationId: z.uuid() }).strict().parse(job.data);
        await this.executor.execute(data.operationId);
      },
      {
        connection: this.connection,
        prefix: AUTHORING_QUEUE_PREFIX,
        concurrency: 1,
        lockDuration: 180_000,
      },
    );
    this.worker.on('error', () => undefined);
    await this.worker.waitUntilReady();
    if (this.closing) return;
    this.timer = setInterval(() => {
      void this.beat().catch(() => undefined);
      void this.reconcile().catch(() => undefined);
    }, 15_000);
    this.timer.unref?.();
    await this.beat();
    await this.reconcile();
  }
  private async beat() {
    await this.redis.client.set(AUTHORING_HEARTBEAT_KEY, new Date().toISOString(), 'PX', 45_000);
  }
  async reconcile() {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      for (const operation of await this.operations.pending()) {
        if (operation.status === 'running') {
          const expired = await this.operations.expire(
            operation.ownerId,
            operation.id,
            operation.attempt,
          );
          if (!expired) continue;
          for (const request of await this.audit.forReference(operation.ownerId, operation.id)) {
            const latest = request.facts.at(-1);
            if (latest && aiInvocationFactSchema.parse(latest.details).kind !== 'dispatching')
              continue;
            await this.audit.append(request.requestId, {
              eventKey: randomUUID(),
              kind: latest ? 'unknown' : 'not_sent',
              actualModel: null,
              usage: null,
              cost: unknownAuthoringCost(),
              errorCode: 'AUTHORING_WORKER_INTERRUPTED',
              outputFingerprint: null,
            });
          }
        } else if (
          operation.attempt === 0 &&
          Date.now() - operation.updatedAt.getTime() >= 15_000
        ) {
          // attempt=0 is persisted proof that no executor reached Provider dispatch.
          const delivery = await this.queue.deliveryState(operation.id);
          if (delivery === 'present') continue;
          const reserved = await this.operations.reserveRedelivery(operation.ownerId, operation.id);
          if (!reserved) {
            await this.operations.exhaustDelivery(operation.ownerId, operation.id);
            continue;
          }
          if (delivery === 'finished') await this.queue.removeFinished(operation.id);
          await this.queue.enqueue(operation.id);
        }
      }
    } finally {
      this.reconciling = false;
    }
  }
  async onModuleDestroy() {
    this.closing = true;
    if (this.timer) clearInterval(this.timer);
    this.executor.abortAll();
    await this.worker?.close();
    if (this.connection?.status !== 'end') await this.connection?.quit();
  }
}
