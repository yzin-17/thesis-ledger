export class BacktestRetryBudgetError extends Error {
  constructor() {
    super('回测重试预算无效');
    this.name = 'BacktestRetryBudgetError';
  }
}

export interface BacktestRetryBudget {
  retryAttemptBase: number;
  maxAttempts: number;
}

export function readBacktestRetryAttemptBase(input: unknown, executionAttempt: number): number {
  if (!Number.isSafeInteger(executionAttempt) || executionAttempt < 0) {
    throw new BacktestRetryBudgetError();
  }

  if (input === undefined) return 0;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BacktestRetryBudgetError();
  }

  const retryAttemptBase = (input as Record<string, unknown>).retryAttemptBase;
  if (retryAttemptBase === undefined) return 0;
  if (
    typeof retryAttemptBase !== 'number' ||
    !Number.isSafeInteger(retryAttemptBase) ||
    retryAttemptBase < 0 ||
    retryAttemptBase > executionAttempt
  ) {
    throw new BacktestRetryBudgetError();
  }
  return retryAttemptBase;
}

export function resolveBacktestRetryBudget(
  input: unknown,
  executionAttempt: number,
  attemptsPerCycle: number,
): BacktestRetryBudget {
  const retryAttemptBase = readBacktestRetryAttemptBase(input, executionAttempt);
  if (!Number.isSafeInteger(attemptsPerCycle) || attemptsPerCycle < 1) {
    throw new BacktestRetryBudgetError();
  }

  const maxAttempts = retryAttemptBase + attemptsPerCycle;
  if (!Number.isSafeInteger(maxAttempts)) throw new BacktestRetryBudgetError();
  return { retryAttemptBase, maxAttempts };
}

export function withBacktestRetryAttemptBase(input: unknown, retryAttemptBase: number) {
  if (
    !Number.isSafeInteger(retryAttemptBase) ||
    retryAttemptBase < 0 ||
    (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input)))
  ) {
    throw new BacktestRetryBudgetError();
  }

  return {
    ...(input as Record<string, unknown> | undefined),
    retryAttemptBase,
  };
}

export function prepareBacktestManualRetry(input: unknown, executionAttempt: number) {
  readBacktestRetryAttemptBase(input, executionAttempt);
  if (executionAttempt >= Number.MAX_SAFE_INTEGER) throw new BacktestRetryBudgetError();

  const nextExecutionAttempt = executionAttempt + 1;
  return {
    executionAttempt: nextExecutionAttempt,
    input: withBacktestRetryAttemptBase(input, nextExecutionAttempt),
  };
}
