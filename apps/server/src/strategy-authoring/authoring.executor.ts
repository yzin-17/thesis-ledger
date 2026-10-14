import { ConflictException, Injectable } from '@nestjs/common';
import { AiInvocationStore } from '../ai/ai-invocation.store.js';
import { AiProviderService } from '../ai/ai-provider.service.js';
import { AiProviderRegistry } from '../ai/provider-registry.js';
import { AiSdkGenerationAdapter } from '../ai/ai-sdk-generation.adapter.js';
import {
  AuthoringOperationRepository,
  type AuthoringOperation,
} from './authoring-operation.repository.js';
import { AuthoringAttemptRunner } from './authoring-attempt.js';

@Injectable()
export class AuthoringExecutor {
  private readonly active = new Map<string, AbortController>();
  constructor(
    private readonly operations: AuthoringOperationRepository,
    private readonly providers: AiProviderService,
    private readonly registry: AiProviderRegistry,
    private readonly audit: AiInvocationStore,
    private readonly sdk: AiSdkGenerationAdapter,
  ) {}
  abortAll() {
    for (const controller of this.active.values())
      controller.abort(new Error('AUTHORING_EXECUTOR_STOPPED'));
  }
  private async claim(id: string) {
    const queued = await this.operations.lookupForExecution(id);
    if (!queued || queued.status !== 'queued') return null;
    try {
      return await this.operations.claim(queued.ownerId, id);
    } catch (error) {
      if (error instanceof ConflictException) return null;
      throw error;
    }
  }
  private startHeartbeat(operation: AuthoringOperation, controller: AbortController) {
    let busy = false;
    const heartbeat = setInterval(() => {
      if (busy) return;
      busy = true;
      void this.operations
        .renew(operation.ownerId, operation.id, operation.attempt)
        .then(
          (renewed) => {
            if (!renewed) controller.abort(new Error('AUTHORING_LEASE_LOST'));
          },
          () => controller.abort(new Error('AUTHORING_LEASE_LOST')),
        )
        .finally(() => {
          busy = false;
        });
    }, 20_000);
    heartbeat.unref?.();
    return heartbeat;
  }
  async execute(id: string) {
    const operation = await this.claim(id);
    if (!operation) return;
    const controller = new AbortController();
    this.active.set(id, controller);
    const heartbeat = this.startHeartbeat(operation, controller);
    const runner = new AuthoringAttemptRunner(operation, controller.signal, {
      operations: this.operations,
      providers: this.providers,
      registry: this.registry,
      audit: this.audit,
      sdk: this.sdk,
    });
    let result;
    try {
      result = await runner.run();
    } finally {
      clearInterval(heartbeat);
      this.active.delete(id);
    }
    const latest = await this.operations.read(operation.ownerId, id);
    const cancelled = latest.cancelRequestedAt !== null;
    let status: 'succeeded' | 'failed' | 'cancelled' = 'succeeded';
    if (cancelled) status = 'cancelled';
    else if (result.errorCode) status = 'failed';
    try {
      await this.operations.finish(operation.ownerId, id, {
        ...result,
        attempt: operation.attempt,
        status,
        errorCode: cancelled ? 'AUTHORING_CANCELLED' : result.errorCode,
      });
    } catch {
      await this.operations.expire(operation.ownerId, id, operation.attempt);
    }
  }
}
