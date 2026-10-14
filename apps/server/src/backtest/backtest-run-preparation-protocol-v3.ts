import {
  executionPriceProtocolSchema,
  type BacktestRunPreparationRequestV3,
  type ExecutionPriceProtocol,
  type BacktestKnownCashPreparationV3,
  type MarketDataBarSeriesResponseV3,
  type RunConfigV3,
  runConfigSchemaV3,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { verifyKnownCashPreparationV3 } from './backtest-known-cash-preparation-v3.js';
import { collectEventTypes } from './backtest-dependency-events.js';

export function knownCashStrategyIssueV3(
  request: BacktestRunPreparationRequestV3,
  strategy: Pick<BacktestStrategy, 'entry' | 'exit'>,
) {
  return request.knownCashResearch && collectEventTypes(strategy).length > 0
    ? '已知现金研究不能使用公司行动策略信号'
    : undefined;
}

export type KnownCashAcquisitionInputV3 = {
  request: BacktestRunPreparationRequestV3;
  executionPriceProtocol: ExecutionPriceProtocol;
  revisions: { desiredRevision: number; effectivePolicyRevision: number; catalogRevision: number };
};
export type KnownCashAcquisitionPortV3 = (
  input: KnownCashAcquisitionInputV3,
) => Promise<BacktestKnownCashPreparationV3>;

export function backtestPreparationPriceOptionsV3(request: BacktestRunPreparationRequestV3) {
  return {
    ...(request.cashEventResearch ? { cashEventResearch: request.cashEventResearch } : {}),
    ...(request.marketRuleResearch ? { marketRuleResearch: request.marketRuleResearch } : {}),
    ...(request.knownCashResearch
      ? { priceWarmupPolicy: 'cash-reference-calendar-buffer-v1' as const }
      : {}),
  };
}

export function preparedRunConfigV3(
  request: BacktestRunPreparationRequestV3,
  resolved: Pick<
    RunConfigV3,
    | 'dataAsOf'
    | 'executionPriceProtocol'
    | 'knownCashPreparation'
    | 'frozenExecutionWindow'
    | 'lifecyclePreparation'
  >,
  signalIds: string[],
) {
  const { knownCashPreparation, lifecyclePreparation, ...required } = resolved;
  return runConfigSchemaV3.safeParse({
    ...request.runConfig,
    ...required,
    ...(knownCashPreparation ? { knownCashPreparation } : {}),
    ...(request.knownCashResearch
      ? { frozenPriceWarmupPolicy: 'cash-reference-calendar-buffer-v1' }
      : {}),
    ...(lifecyclePreparation ? { lifecyclePreparation } : {}),
    schemaVersion: '3',
    ...(request.warmupBudgetSessions !== undefined
      ? { frozenWarmupBudgetSessions: request.warmupBudgetSessions }
      : {}),
    priceInputBindings: {
      signals: signalIds.map((sourceId) => ({ sourceId, binding: 'execution-series' })),
      benchmark: { binding: 'execution-series' },
    },
  });
}

/** 来源已取得后的协议组装；控制/供应商读取仅通过注入的领域端口进行。 */
export async function resolveBacktestPreparationProtocolV3(input: {
  request: BacktestRunPreparationRequestV3;
  response: MarketDataBarSeriesResponseV3;
  revisions: KnownCashAcquisitionInputV3['revisions'];
  knownCash?: KnownCashAcquisitionPortV3;
}) {
  const { request, response } = input;
  const blocked = (message: string) => ({ status: 'blocked' as const, message });
  const protocol = executionPriceProtocolSchema.safeParse({
    protocolVersion: 'execution-price-v1',
    priceBasis: {
      ...response.sourcePriceBasis,
      quantityBasis: request.accountingBasis === 'raw-events' ? 'actual-units' : 'normalized-units',
    },
    accountingBasis: request.accountingBasis,
    history: request.history,
    ...(request.cashEventResearch ? { cashEventResearch: request.cashEventResearch } : {}),
    ...(request.marketRuleResearch ? { marketRuleResearch: request.marketRuleResearch } : {}),
  });
  if (!protocol.success) return blocked('实际来源价格事实与所选记账方式或执行模型不兼容。');
  if (protocol.data.priceBasis.adjustment !== request.adjustment)
    return blocked('实际来源口径与请求不一致，拒绝替换用户选择。');
  let knownCashPreparation: BacktestKnownCashPreparationV3 | undefined;
  if (request.knownCashResearch) {
    if (!input.knownCash) return blocked('已知现金资料取得端口不可用');
    try {
      const acquired = await input.knownCash({
        request,
        executionPriceProtocol: protocol.data,
        revisions: input.revisions,
      });
      knownCashPreparation = verifyKnownCashPreparationV3(acquired, acquired.contentHash);
    } catch (error) {
      return blocked(error instanceof Error ? error.message : '已知现金资料取得失败');
    }
  }
  const dataAsOf =
    knownCashPreparation?.input.scope.dataAsOf ??
    (request.freezeTimePolicy === 'after-acquisition'
      ? new Date().toISOString()
      : request.runConfig.dataAsOf);
  const asOf = Date.parse(dataAsOf);
  if (
    Date.parse(response.sourcePriceBasis.observedAt) > asOf ||
    response.bars.some((bar) => Date.parse(bar.availableAt) > asOf)
  )
    return blocked('实际来源或行情的观察时间晚于dataAsOf；请明确更新冻结时点后重新准备。');
  return {
    status: 'prepared' as const,
    dataAsOf,
    executionPriceProtocol: protocol.data,
    knownCashPreparation,
  };
}
