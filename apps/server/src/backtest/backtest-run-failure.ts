import { HttpException } from '@nestjs/common';
import { ZodError } from 'zod';
import { BacktestSnapshotUnavailableError } from './backtest-v3-run-lifecycle.js';
import { BacktestHistoricalInputErrorV3 } from './backtest-reconstruction-preflight-v3.js';

export function classifyBacktestRunFailure(
  error: unknown,
  execution?: { attempt: number; maxAttempts: number },
) {
  let code = 'INTERNAL_ERROR';
  const detail = error instanceof HttpException ? error.getResponse() : error;
  const reported = detail && typeof detail === 'object' && 'code' in detail && typeof detail.code === 'string'
    ? detail.code : undefined;
  const stableCodes = new Set(['DATA_UNAVAILABLE', 'SIMULATION_LEDGER_ERROR', 'RESEARCH_DATA_SCOPE_INVALID',
    'SNAPSHOT_HASH_MISMATCH', 'SNAPSHOT_NOT_FOUND', 'ARTIFACT_CORRUPT', 'ARTIFACT_NOT_FOUND',
    'PREPARATION_STALE', 'BACKTEST_MATERIALIZATION_INVALID', 'BACKTEST_ATTEMPT_OWNERSHIP_LOST',
    'BACKTEST_RUNNER_VERSION_UNKNOWN', 'BACKTEST_RUNNER_VERSION_CHANGED', 'INDICATOR_ENGINE_VERSION_CHANGED',
    'MARKET_RULES_UNAVAILABLE', 'V3_REJECTED_ORDER_IDENTITY_UNAVAILABLE']);
  const stableHttp = error instanceof HttpException && error.getStatus() >= 400 && error.getStatus() < 500 &&
    ![408, 429].includes(error.getStatus());
  if (error instanceof BacktestSnapshotUnavailableError) code = 'DATA_UNAVAILABLE';
  else if (error instanceof ZodError) code = 'BACKTEST_INPUT_INVALID';
  else if (reported) code = reported;
  else if (stableHttp) code = 'RULE_REJECTED';
  return {
    code,
    summary: error instanceof Error ? error.message.slice(0, 500) : 'Run 执行失败',
    retryable:
      execution !== undefined &&
      execution.attempt < execution.maxAttempts &&
      !stableHttp && !(error instanceof ZodError) &&
      !(error instanceof BacktestHistoricalInputErrorV3) && !stableCodes.has(code),
  };
}
