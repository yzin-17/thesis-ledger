import {
  backtestPreflightResultV3Schema,
  backtestRunPreparationResultV3Schema,
  type BacktestRunPreflightRequestV3,
  type BacktestRunPreparationRequestV3,
} from '@thesis-ledger/schemas';

type PostParsed = <T>(path: string, body: unknown,
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
) => Promise<T>;

/** 配置准备与只读运行预检共享客户端传输，分别验证各自的响应合同。 */
export function backtestRunConfigClient(post: PostParsed) {
  return {
    prepareRunConfig: (input: BacktestRunPreparationRequestV3) =>
      post('/backtests/run-config/prepare', input, backtestRunPreparationResultV3Schema),
    preflightRunConfig: (input: BacktestRunPreflightRequestV3) =>
      post('/backtests/run-config/preflight', input, backtestPreflightResultV3Schema),
  };
}
