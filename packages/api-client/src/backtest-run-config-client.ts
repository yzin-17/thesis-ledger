import {
  backtestPreflightResultV3Schema,
  backtestRunPreparationResultV3Schema,
  backtestRunPreflightRequestV3Schema,
  backtestRunPreparationRequestV3Schema,
  backtestModelResolutionRequestSchema,
  backtestModelResolutionResultSchema,
  executionModelAccountingIssuesV3,
  type BacktestModelResolutionRequest,
  type BacktestRunPreflightRequestV3,
  type BacktestRunPreparationRequestV3,
} from '@thesis-ledger/schemas';
import type { ParsedPost } from './parsed-request.js';
/** 准备和预检分别校验输入、响应与请求标识，不创建 Run。 */
export function backtestRunConfigClient(post: ParsedPost) {
  return {
    resolveExecutionModel: (input: BacktestModelResolutionRequest, signal?: AbortSignal) => {
      const body = backtestModelResolutionRequestSchema.parse(input);
      return post(
        '/backtests/run-config/execution-model',
        body,
        backtestModelResolutionResultSchema,
        signal,
      ).then((result) => {
        if (
          result.status === 'available' &&
          (result.model.scope.currency !== body.currency ||
            result.model.scope.range.start > body.startDate ||
            result.model.scope.range.end < body.endDate ||
            executionModelAccountingIssuesV3(
              result.model,
              body,
              body.adjustment === 'none' ? 'raw-events' : 'normalized-series',
            ).length > 0)
        )
          throw new Error('回测执行设置与当前日期、币种或价格口径不一致，请重新读取。');
        return result;
      });
    },
    prepareRunConfig: (input: BacktestRunPreparationRequestV3, signal?: AbortSignal) => {
      const body = backtestRunPreparationRequestV3Schema.parse(input);
      return post(
        '/backtests/run-config/prepare',
        body,
        backtestRunPreparationResultV3Schema,
        signal,
      ).then((result) => {
        if (result.requestId !== body.requestId) throw Error('配置准备响应与当前请求不一致');
        return result;
      });
    },
    preflightRunConfig: (input: BacktestRunPreflightRequestV3, signal?: AbortSignal) => {
      const body = backtestRunPreflightRequestV3Schema.parse(input);
      return post(
        '/backtests/run-config/preflight',
        body,
        backtestPreflightResultV3Schema,
        signal,
      ).then((result) => {
        if (result.requestId !== body.requestId) throw Error('运行预检响应与当前请求不一致');
        return result;
      });
    },
  };
}
