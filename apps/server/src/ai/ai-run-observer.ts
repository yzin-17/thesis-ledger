import { aiExecutionReadModelSchema, type AiExecutionReadModel } from '@thesis-ledger/schemas';

export type ObservedAiRun = { id: string; status: string; execution?: AiExecutionReadModel | null };
export type AiRunObservation = {
  kind: 'settled' | 'pending';
  runId: string;
  status: string | null;
  reason: string;
  execution: AiExecutionReadModel | null;
};

const observationDeadline = (
  status: string,
  execution: AiExecutionReadModel | null,
  manual: number | undefined,
) => {
  const cutoff =
    status === 'queued'
      ? execution?.timing?.queueExpiresAt
      : (execution?.timing?.taskDeadlineAt ?? execution?.deadlineAt);
  return cutoff ? Math.min(Date.parse(cutoff), manual ?? Infinity) : null;
};
const observedRun = (run: ObservedAiRun, runId: string) => {
  if (
    !run ||
    run.id !== runId ||
    !['queued', 'running', 'completed', 'failed', 'cancelled'].includes(run.status)
  )
    throw new Error('观察响应的任务身份或状态无效');
  const parsed = aiExecutionReadModelSchema.safeParse(run.execution);
  return { ...run, execution: parsed.success ? parsed.data : null };
};

/** 只读持久化任务；观察停止不会提交任务终态或发送取消。 */
export async function observeAiRun(input: {
  runId: string;
  read: (signal: AbortSignal) => Promise<ObservedAiRun>;
  signal?: AbortSignal;
  observationDeadlineAt?: number;
  now?: () => number;
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
}) {
  const now = input.now ?? Date.now;
  const wait =
    input.wait ??
    ((ms, signal) =>
      new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', done);
          resolve();
        };
        const timer = setTimeout(done, ms);
        signal?.addEventListener('abort', done, { once: true });
        if (signal?.aborted) done();
      }));
  let status: string | null = null,
    execution: AiExecutionReadModel | null = null;
  const receipt = (kind: 'settled' | 'pending', reason: string): AiRunObservation => ({
    kind,
    runId: input.runId,
    status,
    execution,
    reason,
  });
  for (;;) {
    if (input.signal?.aborted) return receipt('pending', 'observer_stopped');
    if (input.observationDeadlineAt !== undefined && now() >= input.observationDeadlineAt)
      return receipt('pending', 'observation_timeout');
    let run: ObservedAiRun;
    try {
      run = observedRun(
        await input.read(input.signal ?? new AbortController().signal),
        input.runId,
      );
    } catch {
      return receipt('pending', input.signal?.aborted ? 'observer_stopped' : 'read_unavailable');
    }
    status = run.status;
    execution = run.execution ?? null;
    if (!['queued', 'running'].includes(status)) return receipt('settled', 'persisted_terminal');
    const deadline = observationDeadline(status, execution, input.observationDeadlineAt);
    if (deadline === null) return receipt('pending', 'execution_clock_missing');
    const remaining = deadline - now();
    if (remaining <= 0) return receipt('pending', 'observation_timeout');
    await wait(Math.min(1500, remaining), input.signal);
  }
}
