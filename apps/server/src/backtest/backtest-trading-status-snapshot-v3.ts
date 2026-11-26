import {
  backtestTradingStatusSnapshotV3Schema,
  backtestTradingStatusSnapshotRefV3Schema,
  tradingStatusArtifactKeyV3,
  type BacktestTradingStatusSnapshotV3,
  type BacktestTradingStatusSnapshotRefV3,
  type RunConfigV3,
} from '@thesis-ledger/schemas';
import type { ArtifactRow } from './backtest-artifact-store.js';
import { canonicalizeManifest, hashCanonicalManifest } from './backtest-snapshot.js';
import { statusPriceExecutionModelV3 } from './backtest-status-price-model-v3.js';
import {
  freezeStructuredStatusV3,
  validateFrozenStructuredStatusV3,
} from './backtest-structured-status-v3.js';

export function freezePreparedTradingStatusV3(
  config: RunConfigV3,
): BacktestTradingStatusSnapshotV3 | undefined {
  const response = config.lifecyclePreparation?.response;
  if (!response || 'composition' in response) return undefined;
  const { freezeVersion, structuredResearch } = freezeStructuredStatusV3(config, response);
  return backtestTradingStatusSnapshotV3Schema.parse({
    freezeVersion,
    runConfigChecksum: hashCanonicalManifest(config),
    disclosure: { status: 'source', response, structuredResearch },
  });
}

export const tradingStatusArtifactRowsV3 = (
  status: BacktestTradingStatusSnapshotV3,
): ArtifactRow[] => [{ kind: 'trading-status-v3', payload: canonicalizeManifest(status) }];

/** 产物读取不依赖 DSA；无引用的历史快照保持原行为。 */
export const readSnapshotTradingStatusV3 = (
  context: { runId: string; tradingStatus?: BacktestTradingStatusSnapshotRefV3 },
  runConfig: RunConfigV3,
  rows: readonly ArtifactRow[],
): BacktestTradingStatusSnapshotV3 | undefined => {
  if (!context.tradingStatus) {
    if (rows.length) throw new Error('停复牌产物缺少快照引用');
    return undefined;
  }
  const ref = backtestTradingStatusSnapshotRefV3Schema.parse(context.tradingStatus);
  if (
    ref.artifactKey !== `${context.runId}/${tradingStatusArtifactKeyV3}` ||
    rows.length !== 1 ||
    rows[0]?.kind !== 'trading-status-v3' ||
    typeof rows[0].payload !== 'string'
  )
    throw new Error('停复牌冻结产物缺失或结构无效');
  const status = backtestTradingStatusSnapshotV3Schema.parse(
    JSON.parse(rows[0].payload) as unknown,
  );
  if (status.freezeVersion !== ref.freezeVersion)
    throw new Error('状态产物冻结版本与快照引用不一致');
  if (status.runConfigChecksum !== hashCanonicalManifest(runConfig))
    throw new Error('停复牌冻结产物与原运行配置身份不一致');
  if (status.disclosure.status === 'source') {
    validateTradingStatusSourceV3(runConfig, status.disclosure);
  }
  return status;
};

const validateTradingStatusSourceV3 = (
  runConfig: RunConfigV3,
  disclosure: Extract<BacktestTradingStatusSnapshotV3['disclosure'], { status: 'source' }>,
) => {
  const response = disclosure.response;
  const model = runConfig.executionModel;
  if (
    !model ||
    response.routeKey.market !== model.scope.market ||
    model.scope.instrumentType !== 'STOCK' ||
    response.symbol !== model.scope.symbol ||
    response.range.start !==
      (runConfig.lifecyclePreparation?.response.range.start ?? runConfig.startDate) ||
    response.range.end !== runConfig.endDate ||
    runConfig.executionPriceProtocol.history.basis !== 'fixed-provider-snapshot'
  )
    throw new Error('停复牌冻结产物与执行标的或窗口不一致');
  if (
    runConfig.lifecyclePreparation &&
    canonicalizeManifest(response) !== canonicalizeManifest(runConfig.lifecyclePreparation.response)
  )
    throw new Error('冻结生命周期响应不是准备取得的版本');
  statusPriceExecutionModelV3(runConfig, response);
  validateFrozenStructuredStatusV3(runConfig, disclosure);
};
