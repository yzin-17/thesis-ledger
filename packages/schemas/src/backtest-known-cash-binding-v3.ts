import { z } from 'zod';
import type { BacktestKnownCashPreparationV3 } from './backtest-known-cash-preparation-v3.js';
import type { ExecutionPriceProtocol } from './market-price-protocol.js';

export const backtestKnownCashSnapshotRefV3Schema = z.strictObject({
  version: z.literal('known-cash-snapshot-v1'),
  preparationHash: z.string().regex(/^[a-f0-9]{64}$/),
  coverageComplete: z.literal(false),
});

export function knownCashRunBindingIssuesV3(value: {
  startDate: string;
  endDate: string;
  dataAsOf: string;
  baseCurrency: string;
  executionModel?:
    | { scope: { symbol: string; market: string; instrumentType: string; currency: string } }
    | undefined;
  executionPriceProtocol: ExecutionPriceProtocol;
  knownCashPreparation?: BacktestKnownCashPreparationV3 | undefined;
  priceInputBindings?: unknown;
  frozenExecutionWindow?: unknown;
}): string[] {
  const prepared = value.knownCashPreparation;
  if (!prepared) return [];
  if (!value.priceInputBindings || !value.frozenExecutionWindow)
    return ['已知现金研究必须绑定冻结价格窗口和全部信号/基准输入'];
  const scope = prepared.input.scope;
  const model = value.executionModel?.scope;
  const consistent =
    value.startDate === scope.startDate &&
    value.endDate === scope.endDate &&
    value.dataAsOf === scope.dataAsOf &&
    value.baseCurrency === scope.currency &&
    model?.symbol === scope.symbol &&
    model.market === scope.market &&
    model.instrumentType === scope.instrumentType &&
    model.currency === scope.currency &&
    JSON.stringify(value.executionPriceProtocol) ===
      JSON.stringify(prepared.input.executionPriceProtocol);
  return consistent ? [] : ['现金原包与运行范围、证券、币种、截止或价格协议不一致，需重新准备'];
}
