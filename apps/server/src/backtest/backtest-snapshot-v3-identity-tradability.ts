import { type BacktestInstrumentFactsResponse } from '@thesis-ledger/schemas';
import type {
  SnapshotDependencyV3Input,
  DependencyRequest,
} from './backtest-snapshot-v3-dependencies.js';
import { SnapshotDependencyV3Error } from './backtest-snapshot-v3-dependency-error.js';

/** 身份事实与已取得行情证据组合；原始身份响应由调用方另行冻结。 */
export const composeSnapshotIdentityTradabilityV3 = (
  input: SnapshotDependencyV3Input,
  request: Extract<DependencyRequest, { purpose: 'instrumentFacts' }>,
  response: BacktestInstrumentFactsResponse,
): BacktestInstrumentFactsResponse => {
  if (!request.request.identityOnly) return response;
  const windows = input.tradabilityWindow?.historicalTradabilityWindows;
  if (
    !windows?.length ||
    response.historicalTradability ||
    response.historicalTradabilityWindows ||
    response.facts.some((fact) => fact.tradable)
  ) {
    throw new SnapshotDependencyV3Error(
      'response_contract_invalid',
      '身份响应不能包含未经绑定的可交易性断言',
    );
  }
  const tradable = windows.some((window) =>
    window.days.some((day) => day.state === 'observed-traded'),
  );
  return {
    ...response,
    historicalTradabilityWindows: [...windows],
    facts: response.facts.map((fact) => ({ ...fact, tradable })),
  };
};
