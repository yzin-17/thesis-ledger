import {
  backtestTradingStatusSnapshotV3Schema,
  tradingStatusStructuredFreezeVersionV3,
  tradingStatusBasicLifecycleFreezeVersionV3,
  type BacktestTradingStatusDisclosureV3,
  type MarketTradingStatusResponseV3,
  type RunConfigV3,
} from '@thesis-ledger/schemas';

/** 普通固定来源研究分别保留价格截点与当前取得的状态，不赋予历史可见性。 */
export function freezeStructuredStatusV3(
  config: RunConfigV3,
  response: MarketTradingStatusResponseV3,
) {
  if (!response.sourceRecords) return {};
  if (config.executionPriceProtocol.history.basis !== 'fixed-provider-snapshot')
    throw new Error('结构化状态仅用于固定来源研究');
  const structuredResearch = {
    mode: 'fixed-source-status-research-v1' as const,
    priceDataAsOf: config.dataAsOf,
    frozenAt: new Date().toISOString(),
    observedAfterPriceCutoff: response.sourceRecords.some(
      (record) => Date.parse(record.observedAt) > Date.parse(config.dataAsOf),
    ),
  };
  const freezeVersion = response.basicLifecycle
    ? tradingStatusBasicLifecycleFreezeVersionV3
    : tradingStatusStructuredFreezeVersionV3;
  backtestTradingStatusSnapshotV3Schema.parse({
    freezeVersion,
    runConfigChecksum: '0'.repeat(64),
    disclosure: { status: 'source', response, structuredResearch },
  });
  return { freezeVersion, structuredResearch };
}

export function validateFrozenStructuredStatusV3(
  config: RunConfigV3,
  disclosure: BacktestTradingStatusDisclosureV3,
) {
  if (disclosure.status !== 'source' || !disclosure.response.sourceRecords) return;
  if (
    config.executionPriceProtocol.history.basis !== 'fixed-provider-snapshot' ||
    disclosure.structuredResearch?.priceDataAsOf !== config.dataAsOf
  )
    throw new Error('结构化状态研究声明与原价格冻结截点不一致');
}
