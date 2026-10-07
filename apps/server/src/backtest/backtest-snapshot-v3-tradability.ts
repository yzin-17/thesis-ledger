import {
  backtestDailyTradabilityEvidenceV3Schema,
  marketCoverageProofV3Schema,
  marketDataBarRouteKeyV3Schema,
  marketDataRouteTargetPinV3Schema,
  observedTradabilityDatesV3,
  type BacktestDailyTradabilityEvidenceV3,
  type BacktestInstrumentFactsResponse,
  type MarketCoverageProofV3,
  type MarketDataBarRouteKeyV3,
  type MarketDataBarSeriesResponseV3,
  type RunConfigV3,
} from '@thesis-ledger/schemas';
import type { ArtifactRow } from './backtest-artifact-store.js';
import { canonicalizeManifest } from './backtest-snapshot.js';
import { SnapshotDependencyV3Error } from './backtest-snapshot-v3-dependency-error.js';
import { isBacktestEvidenceAfterDataAsOfV3 } from './backtest-v3-evidence-clock.js';

/** 来源身份、独立日历/上市边界和本次实际冻结的交易日。 */
export interface SnapshotTradabilityWindowV3 {
  symbol: string;
  routeKey: MarketDataBarRouteKeyV3;
  target: { providerId: string; upstreamSource: string; routeIndex: number };
  coverageProof: MarketCoverageProofV3;
  barDates: readonly string[];
  historicalTradabilityWindows?: readonly BacktestDailyTradabilityEvidenceV3[];
}

const same = (left: unknown, right: unknown) =>
  canonicalizeManifest(left) === canonicalizeManifest(right);

export const hasExecutableBacktestWindowV3 = (
  response: MarketDataBarSeriesResponseV3,
  range: { startDate: string; endDate: string },
): boolean =>
  response.bars.some(
    (bar) =>
      bar.timestamp.slice(0, 10) >= range.startDate && bar.timestamp.slice(0, 10) <= range.endDate,
  ) && response.bars.every((bar) => Math.min(bar.open, bar.high, bar.low, bar.close) > 0);

function fail(message: string): never {
  throw new SnapshotDependencyV3Error('fact_unavailable', message);
}

export const tradabilityWindowFromResponseV3 = (
  response: MarketDataBarSeriesResponseV3,
): SnapshotTradabilityWindowV3 => ({
  symbol: response.symbol,
  routeKey: response.routeKey,
  target: {
    providerId: response.provenance.providerId,
    upstreamSource: response.provenance.upstreamSource,
    routeIndex: response.provenance.routeIndex,
  },
  coverageProof: response.coverageProof,
  barDates: response.bars.map((bar) => bar.timestamp.slice(0, 10)),
  ...(response.historicalTradabilityWindows
    ? { historicalTradabilityWindows: response.historicalTradabilityWindows }
    : {}),
});

/** 从已校验物理摘要的产物重建，离线路径不请求 DSA。 */
export const tradabilityWindowFromArtifactsV3 = (
  symbol: string,
  evidence: ArtifactRow,
  bars: readonly ArtifactRow[],
): SnapshotTradabilityWindowV3 => {
  const json = (key: string): unknown => {
    if (typeof evidence[key] !== 'string') fail(`冻结行情缺少 ${key}`);
    return JSON.parse(evidence[key]) as unknown;
  };
  return {
    symbol,
    routeKey: marketDataBarRouteKeyV3Schema.parse(json('routeKey')),
    target: marketDataRouteTargetPinV3Schema.parse(json('target')),
    coverageProof: marketCoverageProofV3Schema.parse(json('coverageProof')),
    ...(evidence.historicalTradabilityWindows === undefined
      ? {}
      : {
          historicalTradabilityWindows: JSON.parse(
            String(evidence.historicalTradabilityWindows),
          ) as BacktestDailyTradabilityEvidenceV3[],
        }),
    barDates: bars.map((bar) => {
      if (typeof bar.occurredAt !== 'string') fail('冻结 Bar 缺少交易日');
      return bar.occurredAt.slice(0, 10);
    }),
  };
};

export const tradabilityRequestSourceV3 = (window: SnapshotTradabilityWindowV3) => ({
  barAdjustment: window.routeKey.adjustment,
  barProviderId: window.target.providerId,
  barUpstreamSource: window.target.upstreamSource,
  barRouteIndex: window.target.routeIndex,
  ...(window.historicalTradabilityWindows ? { identityOnly: true as const } : {}),
});

/** 当前采集证据只用于固定来源快照；不授予历史 PIT 资格。 */
export const validateSnapshotTradabilityV3 = (
  window: SnapshotTradabilityWindowV3,
  config: RunConfigV3,
  range: { start: string; end: string },
  response: BacktestInstrumentFactsResponse,
): void => {
  let windows: BacktestDailyTradabilityEvidenceV3[];
  try {
    windows = (response.historicalTradabilityWindows ?? [response.historicalTradability]).map(
      (value) => backtestDailyTradabilityEvidenceV3Schema.parse(value),
    );
  } catch {
    throw new SnapshotDependencyV3Error('response_contract_invalid', '缺少有效的逐日可交易性证据');
  }
  if (
    window.routeKey.market !== 'CN' ||
    window.routeKey.adjustment !== config.executionPriceProtocol.priceBasis.adjustment ||
    !same(range, {
      start: window.coverageProof.window.requestedStart,
      end: window.coverageProof.window.requestedEnd,
    }) ||
    (window.historicalTradabilityWindows && !same(windows, window.historicalTradabilityWindows))
  ) {
    fail('逐日可交易性身份、范围或来源与冻结行情不一致');
  }
  for (const evidence of windows) {
    for (const timestamp of [
      evidence.barSource.observedAt,
      evidence.calendar.source.availableAt,
      evidence.listing.source.availableAt,
    ]) {
      if (isBacktestEvidenceAfterDataAsOfV3(timestamp, config.dataAsOf)) {
        throw new SnapshotDependencyV3Error('future_fact', '逐日可交易性证据晚于 dataAsOf');
      }
    }
  }
  if (config.executionPriceProtocol.history.basis === 'point-in-time') {
    fail('当前采集的逐日可交易性证据未证明历史决策可见性');
  }
  let observed: string[];
  try {
    observed = observedTradabilityDatesV3(windows, window);
  } catch (error) {
    fail(String(error));
  }
  if (!same(observed, window.barDates)) fail('逐日可交易性状态与实际冻结 Bar 日期不一致');
  if (response.facts.some((fact) => fact.tradable !== observed.length > 0)) {
    fail('标的 tradable 汇总与逐日状态不一致');
  }
};

/** 与现有标的事实一起冻结；完整 envelope 仍受依赖响应指纹约束。 */
export const freezeTradabilityRowsV3 = (
  rows: ArtifactRow[],
  response: BacktestInstrumentFactsResponse,
): void => {
  if (response.historicalTradabilityWindows) {
    for (const row of rows)
      row.historicalTradabilityWindows = canonicalizeManifest(
        response.historicalTradabilityWindows,
      );
  } else if (response.historicalTradability) {
    for (const row of rows)
      row.historicalTradability = canonicalizeManifest(response.historicalTradability);
  }
};

/** 将证券状态分区与独立冻结交易日历相互核对。 */
export const tradabilityExpectedBarDatesV3 = (
  facts: readonly ArtifactRow[],
  expectedDates: readonly string[],
): readonly string[] => {
  const values = facts
    .map((fact) => fact.historicalTradabilityWindows ?? fact.historicalTradability)
    .filter((value) => value !== undefined);
  if (!values.length) return expectedDates;
  const evidence = values.map((value) => {
    if (typeof value !== 'string') fail('冻结逐日可交易性不是有效 JSON');
    const parsed: unknown = JSON.parse(value);
    return (Array.isArray(parsed) ? parsed : [parsed]).map((entry) =>
      backtestDailyTradabilityEvidenceV3Schema.parse(entry),
    );
  });
  if (
    evidence.some(
      (value) =>
        !same(value, evidence[0]) ||
        !same(
          [...new Set(value.flatMap((window) => window.calendar.expectedSessions))].sort(),
          expectedDates,
        ),
    )
  ) {
    fail('冻结逐日可交易性与独立交易日历不一致');
  }
  return [
    ...new Set(
      evidence[0]!.flatMap((window) =>
        window.days.filter((day) => day.state === 'observed-traded').map((day) => day.date),
      ),
    ),
  ].sort();
};
export const assertActualWarmupBarsV3 = (
  response: { bars: readonly { timestamp: string }[] },
  startDate: string,
  minimum: number,
): void => {
  const actual = response.bars.filter((bar) => bar.timestamp.slice(0, 10) < startDate).length;
  if (actual < minimum) throw new Error('执行行情缺少策略要求的实际预热 Bar');
};
