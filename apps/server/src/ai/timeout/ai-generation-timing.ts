import {
  AI_TIMEOUT_POLICY_VERSION,
  aiGenerationErrorSchema,
  type AiGenerationError,
  type AiTimeoutDiagnostic,
  type AiTimeoutStage,
} from '@thesis-ledger/schemas';
import type { AiSdkGenerationRequest } from '../ai-sdk-generation.adapter.js';
import { AiExecutionTimeoutError } from './ai-timeout-scope.js';
import { aiTimeoutProfileFor } from './ai-timeout-policy.js';

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

export const generationErrorChain = (error: unknown) => {
  const chain: unknown[] = [];
  while (error && !chain.includes(error) && chain.length < 10) {
    chain.push(error);
    error = record(error)?.cause;
  }
  return chain;
};

export const generationHttpErrorStatus = (error: unknown) => {
  for (const item of generationErrorChain(error)) {
    const value = record(item),
      status = value?.statusCode ?? value?.status;
    if (typeof status === 'number' && status >= 400 && status <= 599) return status;
  }
  return undefined;
};

const timeoutCodes = {
  connection: 'provider_connect_timeout',
  first_output: 'provider_first_output_timeout',
  output_idle: 'provider_output_idle_timeout',
  completion: 'provider_completion_timeout',
  tool: 'tool_timeout',
  task_budget: 'task_budget_exhausted',
} as const;

/** 仅收集时间与进展类型，不缓存模型正文。 */
export class AiGenerationTiming {
  private readonly startedAt = Date.now();
  private readonly startedMono = performance.now();
  private firstMs: number | null = null;
  private lastMono: number | null = null;
  private lastAt: number | null = null;
  private maxGapMs = 0;

  constructor(private readonly input: AiSdkGenerationRequest<unknown>) {}

  progress() {
    const now = performance.now();
    this.firstMs ??= now - this.startedMono;
    if (this.lastMono !== null) this.maxGapMs = Math.max(this.maxGapMs, now - this.lastMono);
    this.lastMono = now;
    this.lastAt = Date.now();
  }

  hasProgress() {
    return this.firstMs !== null;
  }

  interruption(error: unknown): AiGenerationError | null {
    if (generationHttpErrorStatus(error) !== undefined) return null;
    const timed = this.timeout(error);
    if (timed) return timed;
    const chain = generationErrorChain(error);
    const interrupted =
      chain.some((item) => ['AbortError', 'TimeoutError'].includes(String(record(item)?.name))) ||
      (this.input.signal.aborted && chain.includes(this.input.signal.reason));
    if (!interrupted || !this.input.signal.aborted) return null;
    const parent = this.timeout(this.input.signal.reason);
    if (parent) return parent;
    const leaseLost = ['lease_lost', 'lease_renewal_failed', 'worker_shutdown'].includes(
      String(this.input.signal.reason),
    );
    return aiGenerationErrorSchema.parse({
      code: leaseLost ? 'execution_lease_lost' : 'cancelled',
      phase: 'cancellation',
      summary: leaseLost ? '研究执行所有权已失效，外部结果未知' : '用户取消了生成请求',
      externalResult: 'unknown',
      requestId: this.input.requestId,
    });
  }

  snapshot(complete: boolean) {
    const ended = performance.now();
    return {
      firstMs: this.firstMs,
      maxGapMs:
        this.lastMono === null
          ? null
          : Math.max(this.maxGapMs, complete ? ended - this.lastMono : 0),
      completionMs: ended - this.startedMono,
      complete,
    };
  }

  timeout(error: unknown): AiGenerationError | null {
    const chain = generationErrorChain(error);
    if (generationHttpErrorStatus(error) !== undefined) return null;
    let diagnostic: AiTimeoutDiagnostic | null = null;
    for (const item of chain) {
      if (item instanceof AiExecutionTimeoutError) {
        diagnostic = {
          ...item.diagnostic,
          lastProgressAt: this.lastAt === null ? null : new Date(this.lastAt).toISOString(),
        };
        break;
      }
      const value = record(item),
        message = typeof value?.message === 'string' ? value.message : '';
      const match = /\b(First chunk|Chunk) timeout of (\d+)ms exceeded\b/u.exec(message);
      if (match && ['TimeoutError', 'AbortError'].includes(String(value?.name))) {
        diagnostic = this.diagnostic(
          match[1] === 'First chunk' ? 'first_output' : 'output_idle',
          Number(match[2]),
          'sdk',
        );
        break;
      }
      if (value?.code === 'UND_ERR_CONNECT_TIMEOUT') {
        diagnostic = this.diagnostic('connection', null, 'transport');
        break;
      }
      if (value?.name === 'TimeoutError' && this.input.timeout.totalMs !== undefined) {
        diagnostic = this.diagnostic('completion', this.input.timeout.totalMs, 'sdk');
        break;
      }
    }
    if (!diagnostic) return null;
    return aiGenerationErrorSchema.parse({
      code: timeoutCodes[diagnostic.stage],
      phase:
        diagnostic.stage === 'connection' || this.input.transport === 'single'
          ? 'request'
          : 'stream',
      summary:
        diagnostic.stage === 'task_budget'
          ? '任务执行预算已耗尽，已进入预留收尾阶段'
          : `AI ${diagnostic.stage} 阶段超时`,
      externalResult: 'unknown',
      requestId: this.input.requestId,
      timeout: diagnostic,
    });
  }

  private diagnostic(
    stage: AiTimeoutStage,
    limitMs: number | null,
    authority: AiTimeoutDiagnostic['authority'],
  ): AiTimeoutDiagnostic {
    const decision = this.input.timeoutDecision,
      idle = stage === 'output_idle';
    const startAt = idle ? (this.lastAt ?? this.startedAt) : this.startedAt;
    return {
      version: AI_TIMEOUT_POLICY_VERSION,
      profile: decision?.profile ?? aiTimeoutProfileFor(this.input),
      stage,
      authority,
      startedAt: stage === 'connection' ? null : new Date(startAt).toISOString(),
      elapsedMs:
        stage === 'connection'
          ? null
          : Math.max(
              0,
              performance.now() - (idle ? (this.lastMono ?? this.startedMono) : this.startedMono),
            ),
      limitMs,
      deadlineAt: limitMs === null ? null : new Date(startAt + limitMs).toISOString(),
      taskDeadlineAt: decision ? new Date(decision.taskDeadlineAt).toISOString() : null,
      remainingMs: decision ? Math.max(0, decision.executionDeadlineAt - Date.now()) : null,
      lastProgressAt: this.lastAt === null ? null : new Date(this.lastAt).toISOString(),
      runId: this.input.executionIdentity?.runId ?? null,
      executionAttempt: this.input.executionIdentity?.executionAttempt ?? null,
    };
  }
}
