import type { BacktestRunDetailRead, BacktestNavRunResponseV3 } from '@thesis-ledger/schemas';
export type MobileBacktestRun = BacktestRunDetailRead | BacktestNavRunResponseV3;
export const backtestStatusLabels = {
  queued: '排队中',
  running: '运行中',
  succeeded: '已成功',
  failed: '已失败',
  cancelled: '已取消',
} as const;
export const isBacktestActive = (status: string) => status === 'queued' || status === 'running';
export function backtestActionControls(run: MobileBacktestRun | undefined, state: {busy:boolean;readFailed:boolean;pending:boolean;pendingKnown:boolean;reading:boolean}) {
  if (!run || state.busy || state.readFailed || state.pending || !state.pendingKnown || state.reading) return { cancel: false, retry: false };
  return {
    cancel: isBacktestActive(run.status),
    retry: run.status === 'failed' && run.executionAttempt !== undefined,
  };
}
export type PendingBacktestAction = {
  id: string;
  kind: 'ordinary' | 'nav';
  action: 'retry' | 'cancel';
  expectedAttempt: number | null;
};
export function parseBacktestAction(value: unknown): PendingBacktestAction {
  if (!value || typeof value !== 'object') throw Error('回测操作凭据无效。');
  const row = value as PendingBacktestAction;
  if (
    typeof row.id !== 'string' ||
    !row.id ||
    !['ordinary', 'nav'].includes(row.kind) ||
    !['retry', 'cancel'].includes(row.action) ||
    (row.expectedAttempt !== null &&
      (!Number.isSafeInteger(row.expectedAttempt) || row.expectedAttempt < 0))
  )
    throw Error('回测操作凭据无效。');
  return row;
}
/** 响应丢失后先读取原 Run；已推进的 attempt 不再投递。 */
export function backtestActionRecovered(pending: PendingBacktestAction, run: MobileBacktestRun) {
  if (run.id !== pending.id) throw Error('Run 身份不一致。');
  if (pending.action === 'cancel') return !isBacktestActive(run.status);
  if (pending.expectedAttempt === null || run.executionAttempt === undefined)
    throw Error('缺少执行轮次，不能安全重试。');
  if (run.executionAttempt < pending.expectedAttempt) throw Error('执行轮次回退，请重新读取。');
  return run.executionAttempt > pending.expectedAttempt || run.status === 'succeeded';
}
