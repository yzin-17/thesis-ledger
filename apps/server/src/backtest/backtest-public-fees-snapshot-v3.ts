import {
  backtestPublicFeesSnapshotV3Schema,
  publicFeesArtifactKeyV3,
  publicFeesCompositionVersionV3,
  type BacktestPublicFeesSnapshotV3,
  type BacktestSnapshotManifestV3,
  type RunConfigV3,
  type BacktestPublicFeesDisclosureV3,
} from '@thesis-ledger/schemas';
import type { DsaClient } from '../integration/dsa/dsa.client.js';
import type { ArtifactRow } from './backtest-artifact-store.js';
import { canonicalizeManifest, hashCanonicalManifest } from './backtest-snapshot.js';
import { combinePublicFeesExecutionModelV3 } from './backtest-public-fees-model-v3.js';

type FeeDsa = Partial<Pick<DsaClient, 'marketPublicFeesV3' | 'effectiveControlPolicyV3'>>;

/** 新快照仅按整窗读取；最终快照的复用在调用本函数前完成。 */
export const collectSnapshotPublicFeesV3 = async (
  runConfig: RunConfigV3,
  dsa?: FeeDsa,
): Promise<BacktestPublicFeesSnapshotV3 | undefined> => {
  const model = runConfig.executionModel;
  if (
    !model ||
    model.scope.instrumentType !== 'STOCK' ||
    !dsa?.marketPublicFeesV3 ||
    !dsa.effectiveControlPolicyV3
  )
    return undefined;
  const base = {
    compositionVersion: publicFeesCompositionVersionV3,
    modelContentHash: hashCanonicalManifest(model),
  };
  const fallback = (reason: string): BacktestPublicFeesSnapshotV3 => ({
    ...base,
    disclosure: { status: 'executionModel', reason },
  });
  const key = {
    kind: 'data',
    market: model.scope.market,
    assetType: 'STOCK',
    capability: 'HISTORICAL_PUBLIC_FEES',
  } as const;
  try {
    const policy = (await dsa.effectiveControlPolicyV3()).projection?.effective;
    const route = policy?.routes.find(
      (item) => canonicalizeManifest(item.key) === canonicalizeManifest(key),
    );
    if (!policy?.enabled || !route) return fallback('未配置公共收费路由，使用已选执行模型。');
    let failureReason = '公共收费源暂不可用，使用已选执行模型。';
    for (const target of route.targets) {
      if (!target.eligible) continue;
      try {
        const response = await dsa.marketPublicFeesV3({
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
        try {
          combinePublicFeesExecutionModelV3(model, response, runConfig.dataAsOf);
        } catch {
          failureReason = '公共收费与已选模型的范围或金额设置不兼容，使用已选执行模型。';
          continue;
        }
        return {
          ...base,
          disclosure: {
            status: 'source',
            response,
            ...(target.routeIndex > 0
              ? { fallbackReason: '主源未能提供本次可计算的公共收费，整段区间使用已配置备用源。' }
              : {}),
          },
        };
      } catch {
        // 仅在本目标失败后尝试下一个已配置目标，不拼接结果。
      }
    }
    return fallback(failureReason);
  } catch {
    return fallback('公共收费路由暂不可用，使用已选执行模型。');
  }
};

export const publicFeesArtifactRowsV3 = (fees: BacktestPublicFeesSnapshotV3): ArtifactRow[] => [
  { kind: 'public-fees-v3', payload: canonicalizeManifest(fees) },
];

/** 原 RunConfig 已通过身份校验；收费产物再绑定原模型与执行窗口。 */
export const readSnapshotPublicFeesV3 = (
  manifest: BacktestSnapshotManifestV3,
  runConfig: RunConfigV3,
  rows: readonly ArtifactRow[],
) => {
  if (!manifest.publicFees) {
    if (rows.length) throw new Error('收费产物缺少 manifest 引用');
    return undefined;
  }
  if (
    manifest.publicFees.artifactKey !== `${manifest.runId}/${publicFeesArtifactKeyV3}` ||
    rows.length !== 1 ||
    rows[0]?.kind !== 'public-fees-v3' ||
    typeof rows[0].payload !== 'string'
  ) {
    throw new Error('收费冻结产物缺失或结构无效');
  }
  const fees = backtestPublicFeesSnapshotV3Schema.parse(JSON.parse(rows[0].payload) as unknown);
  if (
    !runConfig.executionModel ||
    fees.modelContentHash !== hashCanonicalManifest(runConfig.executionModel)
  ) {
    throw new Error('收费冻结产物与原执行模型身份不一致');
  }
  if (fees.disclosure.status === 'source') {
    const response = fees.disclosure.response;
    if (response.range.start !== runConfig.startDate || response.range.end !== runConfig.endDate) {
      throw new Error('收费冻结产物与执行窗口不一致');
    }
    return {
      disclosure: fees.disclosure,
      runConfig: {
        ...runConfig,
        executionModel: combinePublicFeesExecutionModelV3(runConfig.executionModel, response, runConfig.dataAsOf),
      },
    };
  }
  return { disclosure: fees.disclosure, runConfig };
};

export const publicFeesWarningsV3 = (disclosure?: BacktestPublicFeesDisclosureV3): string[] => {
  if (!disclosure) return [];
  if (disclosure.status === 'source') {
    return ['费用已使用冻结公共费率；佣金及金额设置沿用已选模型，历史首次可见时钟未验证。'];
  }
  return [disclosure.reason];
};
