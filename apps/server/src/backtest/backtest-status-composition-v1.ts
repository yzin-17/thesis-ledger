import {
  backtestStatusCompositionV1Schema,
  statusCompositionFreezeVersionV1,
  statusCompositionArtifactKeyV1,
  evaluateStatusCompositionV1,
  type BacktestStatusCompositionV1,
  type BacktestSnapshotManifestV3,
  type RunConfigV3,
  type StatusCompositionDemandV1,
  type StatusCapabilityNameV1,
} from '@thesis-ledger/schemas';
import type { DsaClient } from '../integration/dsa/dsa.client.js';
import { DsaV3ProtocolError } from '../integration/dsa/dsa-v3-protocol.js';
import { readMarketStatusCompositionV1, sameStatusCompositionPolicyV1 } from '../market/market-status-composition-reader-v1.js';
import type { ArtifactRow } from './backtest-artifact-store.js';
import { canonicalizeManifest, hashCanonicalManifest } from './backtest-snapshot.js';
import { collectSnapshotTradingStatusV3 } from './backtest-trading-status-snapshot-v3.js';

type Dsa = Partial<
  Pick<DsaClient, 'effectiveControlPolicyV3' | 'dataCapabilities' | 'marketTradingStatusV3'>
>;

/** 新交易状态被明确选择才替代旧聚合；其他新事实不删除已有交易约束。 */
export async function collectSnapshotStatusInputsV1(config: RunConfigV3, dsa?: Dsa) {
  const statusComposition = await collectSnapshotStatusCompositionV1(config, dsa);
  const ownsTrading = statusComposition?.composition.entries.some(
    (item) => item.query.routeKey.capability === 'DAILY_TRADING_STATUS',
  );
  const tradingStatus = ownsTrading ? undefined : await collectSnapshotTradingStatusV3(config, dsa);
  if (statusComposition && dsa?.effectiveControlPolicyV3) {
    const after = (await dsa.effectiveControlPolicyV3()).projection?.effective;
    if (!sameStatusCompositionPolicyV1(after, statusComposition.composition.policy))
      throw new DsaV3ProtocolError('冻结状态读取期间政策变化', 'stale-revision');
  }
  return { statusComposition, tradingStatus };
}

/** 普通快照只采用原已知停牌规则；其他独立能力作为观察事实分别冻结。 */
export async function collectSnapshotStatusCompositionV1(
  config: RunConfigV3,
  dsa?: Dsa,
): Promise<BacktestStatusCompositionV1 | undefined> {
  const scope = config.executionModel?.scope;
  if (
    !scope ||
    scope.instrumentType !== 'STOCK' ||
    config.lifecyclePreparation ||
    config.executionPriceProtocol.history.basis !== 'fixed-provider-snapshot' ||
    !dsa?.dataCapabilities ||
    !dsa.effectiveControlPolicyV3
  )
    return undefined;
  const readPolicy = () =>
    dsa.effectiveControlPolicyV3!().then((result) => result.projection?.effective ?? null);
  const policy = await readPolicy();
  if (!policy?.enabled) return undefined;
  const enabled = new Set(
    policy.routes
      .filter(
        (route) =>
          route.enabled === true &&
          route.key.market === scope.market &&
          route.key.assetType === 'STOCK',
      )
      .map((route) => route.key.capability),
  );
  const demands: StatusCompositionDemandV1[] = [];
  for (const capability of [
    'DAILY_TRADING_STATUS',
    'RISK_WARNING',
    'DAILY_PRICE_RULE',
    'LISTING_PHASE',
    'SECURITY_BASIC_DATES',
  ] as const) {
    if (!enabled.has(capability)) continue;
    const base = {
      contractVersion: 3,
      capabilityVersion: 1,
      consumer: 'thesis-ledger',
      requestId: crypto.randomUUID(),
      symbol: scope.symbol,
      routeKey: { kind: 'data', market: scope.market, assetType: 'STOCK', capability },
    } as const;
    let query: StatusCompositionDemandV1['query'];
    const range = { start: config.startDate, end: config.endDate };
    if (capability === 'SECURITY_BASIC_DATES')
      query = { ...base, routeKey: { ...base.routeKey, capability } };
    else if (capability === 'RISK_WARNING')
      query = {
        ...base,
        routeKey: { ...base.routeKey, capability },
        range,
        detail: { kind: 'riskCategories', categories: ['delisting', 'other'] },
      };
    else if (capability === 'DAILY_PRICE_RULE')
      query = {
        ...base,
        routeKey: { ...base.routeKey, capability },
        range,
        representation: 'rule',
      };
    else if (capability === 'DAILY_TRADING_STATUS')
      query = { ...base, routeKey: { ...base.routeKey, capability }, range };
    else query = { ...base, routeKey: { ...base.routeKey, capability: 'LISTING_PHASE' }, range };
    demands.push({ query, requirement: 'optional' });
  }
  if (!demands.length) return undefined;
  const composition = await readMarketStatusCompositionV1(
    demands,
    dsa.dataCapabilities,
    readPolicy,
  );
  if (!sameStatusCompositionPolicyV1(policy, composition.policy))
    throw new DsaV3ProtocolError('冻结前独立功能选择变化', 'stale-revision');
  return backtestStatusCompositionV1Schema.parse({
    freezeVersion: statusCompositionFreezeVersionV1,
    runConfigChecksum: hashCanonicalManifest(config),
    frozenAt: new Date().toISOString(),
    composition,
    adoption: {
      policy: 'known-suspensions-only-v1',
      suspendedDates: evaluateStatusCompositionV1(composition.entries).suspendedDates,
      observedAfterPriceCutoff: composition.entries.some(
        (item) =>
          item.status === 'included' &&
          Date.parse(item.result.clock.observedAt) > Date.parse(config.dataAsOf),
      ),
    },
  });
}

export function statusCompositionArtifactRowsV1(value: BacktestStatusCompositionV1): ArtifactRow[] {
  return [{ kind: 'status-composition-v1', payload: canonicalizeManifest(value) }];
}

/** 离线读取只验证冻结身份、时钟和采用事实；不查询当前政策/凭据。 */
export function readSnapshotStatusCompositionV1(
  manifest: Pick<BacktestSnapshotManifestV3, 'runId' | 'statusComposition' | 'tradingStatus'>,
  config: RunConfigV3,
  rows: readonly ArtifactRow[],
) {
  if (!manifest.statusComposition) {
    if (rows.length) throw new Error('组合产物没有 manifest 引用');
    return undefined;
  }
  if (
    manifest.statusComposition.artifactKey !==
      `${manifest.runId}/${statusCompositionArtifactKeyV1}` ||
    rows.length !== 1 ||
    rows[0]?.kind !== 'status-composition-v1' ||
    typeof rows[0].payload !== 'string'
  )
    throw new Error('组合冻结产物缺失或身份无效');
  const value = backtestStatusCompositionV1Schema.parse(JSON.parse(rows[0].payload));
  if (
    manifest.tradingStatus &&
    value.composition.entries.some(
      (item) => item.query.routeKey.capability === 'DAILY_TRADING_STATUS',
    )
  )
    throw new Error('交易状态重复登记');
  const scope = config.executionModel?.scope;
  if (
    value.runConfigChecksum !== hashCanonicalManifest(config) ||
    !scope ||
    config.lifecyclePreparation ||
    scope.instrumentType !== 'STOCK' ||
    config.executionPriceProtocol.history.basis !== 'fixed-provider-snapshot' ||
    value.freezeVersion !== manifest.statusComposition.freezeVersion ||
    value.composition.entries.some(
      (item) =>
        item.query.symbol !== scope.symbol ||
        item.query.routeKey.market !== scope.market ||
        ('range' in item.query &&
          (item.query.range.start !== config.startDate || item.query.range.end !== config.endDate)),
    ) ||
    value.adoption.observedAfterPriceCutoff !==
      value.composition.entries.some(
        (item) =>
          item.status === 'included' &&
          Date.parse(item.result.clock.observedAt) > Date.parse(config.dataAsOf),
      )
  )
    throw new Error('组合冻结与运行配置或采用时钟不一致');
  return value;
}

export function statusCompositionWarningsV1(value?: BacktestStatusCompositionV1) {
  if (!value) return [];
  const evaluation = evaluateStatusCompositionV1(value.composition.entries);
  const failed: StatusCapabilityNameV1[] = value.composition.entries
    .filter((item) => item.status === 'failed')
    .map((item) => item.query.routeKey.capability);
  return [
    `已分别冻结独立功能事实，仅沿原已知停牌规则采用 ${value.adoption.suspendedDates.length} 日；可选失败 ${failed.length} 项、资格冲突 ${evaluation.conflicts.length} 项。风险、价格规则、阶段和日期保持观察输入，未知沿用原研究选择。`,
  ];
}
