import {
  backtestRunPreparationResultV3Schema,
  type BacktestRunPreparationRequestV3,
  type BacktestRunPreparationResultV3,
} from '@thesis-ledger/schemas';
import type { backtestRunConfigClient } from './backtest-run-config-client.js';
export function checkedBacktestPreparation(
  config: ReturnType<typeof backtestRunConfigClient>,
): (
  input: BacktestRunPreparationRequestV3,
  signal?: AbortSignal,
) => Promise<BacktestRunPreparationResultV3> {
  return async (input: BacktestRunPreparationRequestV3, signal?: AbortSignal) => {
    const result = await config.prepareRunConfig(input, signal);
    if (result.status !== 'prepared') return result;
    if (signal?.aborted) {
      const error = new Error('配置准备请求已取消');
      error.name = 'AbortError';
      throw error;
    }
    const preflight = await config.preflightRunConfig(
      {
        contractVersion: 3,
        requestId: input.requestId,
        strategyVersionId: input.strategyVersionId,
        runConfig: result.runConfig,
      },
      signal,
    );
    if (signal?.aborted) {
      const error = new Error('配置准备请求已取消');
      error.name = 'AbortError';
      throw error;
    }
    if (preflight.status !== 'ready')
      return backtestRunPreparationResultV3Schema.parse({
        contractVersion: 3,
        requestId: input.requestId,
        checkedAt: preflight.checkedAt,
        scope: 'execution-window',
        status: 'blocked',
        diagnostics: preflight.diagnostics,
      });
    if (
      JSON.stringify(preflight.revisionStamp) !==
      JSON.stringify(result.executionPreflight.revisionStamp)
    )
      throw Error('准备与运行预检之间策略或路由已经改变，请重新准备');
    return { ...result, executionPreflight: preflight };
  };
}
