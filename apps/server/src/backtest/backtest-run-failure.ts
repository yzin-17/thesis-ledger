import { BadRequestException } from '@nestjs/common';
import { BacktestSnapshotUnavailableError } from './backtest-v3-run-lifecycle.js';

export function classifyBacktestRunFailure(
  error: unknown,
  execution?: { attempt: number; maxAttempts: number },
) {
  let code = 'INTERNAL_ERROR';
  if (error instanceof BacktestSnapshotUnavailableError) code = 'DATA_UNAVAILABLE';
  else if (error instanceof BadRequestException) code = 'RULE_REJECTED';
  return {
    code,
    summary: error instanceof Error ? error.message.slice(0, 500) : 'Run 执行失败',
    retryable:
      execution !== undefined &&
      execution.attempt < execution.maxAttempts &&
      !(error instanceof BadRequestException) &&
      !(error instanceof BacktestSnapshotUnavailableError),
  };
}
