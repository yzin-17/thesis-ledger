export function backtestRunnerIdentity(previous: string | null, current: string | undefined, hasExecuted = false) {
  if (!current?.trim()) return 'unavailable' as const;
  if (previous === current) return 'same' as const;
  if (!previous) return hasExecuted ? 'unknown-executed' as const : 'unbound-new' as const;
  return 'changed' as const;
}

export function backtestHasExecutionHistory(job: { executionAttempt: number; input: unknown; startedAt?: Date | null; result?: unknown; resultChecksum?: string | null }) {
  if (job.executionAttempt > 0 || job.startedAt || job.resultChecksum || (job.result !== null && job.result !== undefined)) return true;
  const input = job.input && typeof job.input === 'object' ? job.input as Record<string, unknown> : undefined;
  return input?.retryAttemptBase !== undefined && input.retryAttemptBase !== 0;
}

/** 历史调用名保留；判断不再依赖股票前缀。 */
export const indicatorEngineChanged = (previous: string | null, current?: string, executionAttempt = 0) =>
  !['same', 'unbound-new'].includes(backtestRunnerIdentity(previous, current, executionAttempt > 0));

export const indicatorEngineVersionMessage =
  '回测执行版本已变化；此Run保留原身份，请使用已冻结输入创建关联的新Run';
