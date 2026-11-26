export interface BacktestComputationOptions {
  signal: AbortSignal;
  batchSize?: number;
  batchMs?: number;
  yieldControl?: () => Promise<void>;
}

export function* mapBacktestComputationItems<T, U>(items: readonly T[], mapper: (item: T, index: number) => U): Generator<void, U[], void> {
  const output = new Array<U>(items.length);
  for (let index = 0; index < items.length; index++) {
    if (index in items) output[index] = mapper(items[index]!, index);
    yield;
  }
  return output;
}

/** 同一计算迭代器的同步入口；仅调度方式不同，不复制计算状态。 */
export function finishBacktestComputation<T>(work: Generator<void, T, void>): T {
  let current = work.next();
  while (!current.done) current = work.next();
  return current.value;
}

/** 只用于回测CPU计算；批间让出事件循环，使持久取消轮询能实际运行。 */
export async function advanceBacktestComputation<T>(work: Generator<void, T, void>, options: BacktestComputationOptions): Promise<T> {
  const size = options.batchSize ?? 256, budget = options.batchMs ?? 20;
  if (!Number.isSafeInteger(size) || size < 1 || !Number.isFinite(budget) || budget <= 0)
    throw new Error('回测计算批次预算必须为正值');
  const yieldControl = options.yieldControl ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  try {
    while (true) {
      const started = performance.now();
      for (let count = 0; count < size; count++) {
        options.signal.throwIfAborted();
        const current = work.next();
        if (current.done) { options.signal.throwIfAborted(); return current.value; }
        if (performance.now() - started >= budget) break;
      }
      await yieldControl();
    }
  } finally { work.return(undefined as never); }
}
