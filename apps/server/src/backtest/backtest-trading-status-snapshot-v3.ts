import {
  backtestTradingStatusSnapshotV3Schema,
  backtestTradingStatusSnapshotRefV3Schema,
  tradingStatusArtifactKeyV3,
  tradingStatusFreezeVersionV3,
  type BacktestTradingStatusSnapshotV3,
  type BacktestTradingStatusSnapshotRefV3,
  type RunConfigV3,
} from '@thesis-ledger/schemas';
import type { DsaClient } from '../integration/dsa/dsa.client.js';
import type { ArtifactRow } from './backtest-artifact-store.js';
import { canonicalizeManifest, hashCanonicalManifest } from './backtest-snapshot.js';
import { statusPriceExecutionModelV3 } from './backtest-status-price-model-v3.js';
import { extendedStatusFreezeVersion } from './backtest-listing-status-v3.js';
import {
  freezeStructuredStatusV3,
  validateFrozenStructuredStatusV3,
} from './backtest-structured-status-v3.js';

type StatusDsa = Partial<Pick<DsaClient, 'marketTradingStatusV3' | 'effectiveControlPolicyV3'>>;

/** 仅新建普通固定来源快照调用；状态与原价格、执行模型分别冻结。 */
export const collectSnapshotTradingStatusV3 = async (
  runConfig: RunConfigV3,
  dsa?: StatusDsa,
): Promise<BacktestTradingStatusSnapshotV3 | undefined> => {
  const model = runConfig.executionModel;
  if (
    !model ||
    model.scope.instrumentType !== 'STOCK' ||
    runConfig.executionPriceProtocol.history.basis !== 'fixed-provider-snapshot'
  )
    return undefined;
  const base = {
    freezeVersion: tradingStatusFreezeVersionV3,
    runConfigChecksum: hashCanonicalManifest(runConfig),
  };
  if (runConfig.lifecyclePreparation) {
    const response = runConfig.lifecyclePreparation.response;
    const { freezeVersion, structuredResearch } = freezeStructuredStatusV3(runConfig, response);
    return backtestTradingStatusSnapshotV3Schema.parse({ ...base, freezeVersion, disclosure: { status: 'source', response, structuredResearch } });
  }
  const fallback = (reason: string): BacktestTradingStatusSnapshotV3 => ({
    ...base,
    disclosure: { status: 'notIncluded', reason },
  });
  if (!dsa?.marketTradingStatusV3 || !dsa.effectiveControlPolicyV3)
    return fallback('停复牌读取不可用，未纳入真实状态约束，沿用已选普通研究假设。');
  const key = {
    kind: 'data',
    market: model.scope.market,
    assetType: 'STOCK',
    capability: 'HISTORICAL_TRADING_STATUS',
  } as const;
  try {
    const policy = (await dsa.effectiveControlPolicyV3()).projection?.effective;
    const route = policy?.routes.find(
      (item) => canonicalizeManifest(item.key) === canonicalizeManifest(key),
    );
    if (!policy?.enabled || !route)
      return fallback('未配置停复牌路由，未纳入真实状态约束，沿用已选普通研究假设。');
    for (const target of route.targets) {
      if (!target.eligible) continue;
      try {
        const response = await dsa.marketTradingStatusV3({
          contractVersion: 3,
          consumer: 'thesis-ledger',
          requestId: crypto.randomUUID(),
          routeKey: key,
          routeTarget: {
            providerId: target.providerId,
            upstreamSource: target.upstreamSource,
            routeIndex: target.routeIndex,
          },
          symbol: model.scope.symbol,
          range: { start: runConfig.startDate, end: runConfig.endDate },
        });
        statusPriceExecutionModelV3(runConfig, response);
        const { structuredResearch, ...structuredVersion } = freezeStructuredStatusV3(
          runConfig,
          response,
        );
        return {
          ...base,
          ...extendedStatusFreezeVersion(response),
          ...structuredVersion,
          disclosure: {
            status: 'source',
            response,
            ...(structuredResearch ? { structuredResearch } : {}),
            ...(target.routeIndex > 0
              ? { fallbackReason: '主源未能提供本次停复牌状态，整段区间使用已配置备用源。' }
              : {}),
          },
        };
      } catch {
        // 来源失败才尝试下个已配置目标；unknown 本身不触发逐日补读。
      }
    }
    return fallback('已配置停复牌源暂不可用，未纳入真实状态约束，沿用已选普通研究假设。');
  } catch {
    return fallback('停复牌路由暂不可用，未纳入真实状态约束，沿用已选普通研究假设。');
  }
};

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
    const response = status.disclosure.response;
    const model = runConfig.executionModel;
    if (
      !model ||
      response.routeKey.market !== model.scope.market ||
      model.scope.instrumentType !== 'STOCK' ||
      response.symbol !== model.scope.symbol ||
      response.range.start !== (runConfig.lifecyclePreparation?.response.range.start ?? runConfig.startDate) ||
      response.range.end !== runConfig.endDate ||
      runConfig.executionPriceProtocol.history.basis !== 'fixed-provider-snapshot'
    )
      throw new Error('停复牌冻结产物与执行标的或窗口不一致');
    if (runConfig.lifecyclePreparation && canonicalizeManifest(response) !== canonicalizeManifest(runConfig.lifecyclePreparation.response)) throw new Error('冻结生命周期响应不是准备取得的版本');
    statusPriceExecutionModelV3(runConfig, response);
    validateFrozenStructuredStatusV3(runConfig, status.disclosure);
  }
  return status;
};
