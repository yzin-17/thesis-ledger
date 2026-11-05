import {
  AI_TIMEOUT_POLICY_VERSION,
  type AiExecutionTimeoutPolicy,
  type AiTimeoutDiagnostic,
} from '@thesis-ledger/schemas';

export class AiExecutionTimeoutError extends Error {
  constructor(readonly diagnostic: AiTimeoutDiagnostic) {
    super(
      diagnostic.stage === 'task_budget'
        ? '任务执行预算已耗尽，已进入预留收尾阶段'
        : `${diagnostic.stage} 超过阶段等待预算`,
    );
    this.name = 'AiExecutionTimeoutError';
  }
}
const ownedDeadlines = new WeakMap<AbortSignal, number>();

/** 只拥有任务／工具期限；模型首输出和空闲继续由锁定SDK负责。 */
export function createAiTimeoutScope(input: {
  policy: AiExecutionTimeoutPolicy;
  taskDeadlineAt: number;
  signal?: AbortSignal | undefined;
  stage?: 'task_budget' | 'tool' | 'completion' | undefined;
  stageLimitMs?: number | undefined;
  runId?: string | undefined;
  executionAttempt?: number | undefined;
}) {
  const startedAt = Date.now(),
    startedMono = performance.now();
  const remainingMs = Math.max(0, input.taskDeadlineAt - input.policy.cleanupReserveMs - startedAt);
  const requestedStage = input.stage ?? 'task_budget';
  const limitMs = Math.max(0, Math.min(input.stageLimitMs ?? remainingMs, remainingMs));
  const stage =
    requestedStage !== 'task_budget' && limitMs < remainingMs ? requestedStage : 'task_budget';
  let authority: 'tool' | 'task' | 'transport' = 'task';
  if (stage === 'tool') authority = 'tool';
  else if (stage === 'completion') authority = 'transport';
  const controller = new AbortController();
  const propagate = () => controller.abort(input.signal?.reason);
  if (input.signal?.aborted) propagate();
  else input.signal?.addEventListener('abort', propagate, { once: true });
  const expire = () => {
    if (controller.signal.aborted) return;
    controller.abort(
      new AiExecutionTimeoutError({
        version: AI_TIMEOUT_POLICY_VERSION,
        profile: input.policy.profile,
        stage,
        authority,
        startedAt: new Date(startedAt).toISOString(),
        elapsedMs: Math.max(0, performance.now() - startedMono),
        limitMs: Math.max(1, Math.ceil(limitMs)),
        deadlineAt: new Date(startedAt + limitMs).toISOString(),
        taskDeadlineAt: new Date(input.taskDeadlineAt).toISOString(),
        remainingMs: Math.max(0, input.taskDeadlineAt - input.policy.cleanupReserveMs - Date.now()),
        lastProgressAt: null,
        runId: input.runId ?? null,
        executionAttempt: input.executionAttempt ?? null,
      }),
    );
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  // 工具预算被任务裁剪时，父任务已是同一期限的权威，不再装重复timer。
  const parentDeadline = input.signal ? ownedDeadlines.get(input.signal) : undefined;
  const inherited = parentDeadline !== undefined && parentDeadline <= startedAt + limitMs;
  ownedDeadlines.set(controller.signal, inherited ? parentDeadline : startedAt + limitMs);
  if (!controller.signal.aborted && !inherited) {
    if (limitMs <= 0) expire();
    else {
      const arm = () => {
        const remaining = Math.max(0, limitMs - (performance.now() - startedMono));
        timer = setTimeout(
          remaining > 2_147_483_647 ? arm : expire,
          Math.min(remaining, 2_147_483_647),
        );
        timer.unref?.();
      };
      arm();
    }
  }
  return {
    signal: controller.signal,
    assertActive: () => {
      if (!controller.signal.aborted && Date.now() >= startedAt + limitMs) expire();
      if (controller.signal.aborted) {
        if (controller.signal.reason instanceof Error) throw controller.signal.reason;
        throw new DOMException(String(controller.signal.reason ?? 'cancelled'), 'AbortError');
      }
    },
    cancel: (reason: unknown = 'cancelled') => controller.abort(reason),
    close: () => {
      if (timer) clearTimeout(timer);
      input.signal?.removeEventListener('abort', propagate);
    },
  };
}
