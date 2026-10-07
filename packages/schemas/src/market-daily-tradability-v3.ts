import type { BacktestDailyTradabilityEvidenceV3 } from './backtest-daily-tradability.js';
import type { MarketCoverageProofV3 } from './market-coverage-proof-v3.js';
import type { MarketDataBarRouteKeyV3 } from './market-data-wire-v3.js';

const assertTradabilitySourceV3 = (
  evidence: BacktestDailyTradabilityEvidenceV3,
  scope: Parameters<typeof observedTradabilityDatesV3>[1],
  revision: string,
): void => {
  const source = evidence.barSource;
  if (
    evidence.symbol !== scope.symbol ||
    evidence.market !== scope.routeKey.market ||
    evidence.instrumentType !== scope.routeKey.assetType ||
    Object.entries(scope.routeKey).some(
      ([key, value]) => source.routeKey[key as keyof typeof source.routeKey] !== value,
    ) ||
    source.routeTarget.providerId !== scope.target.providerId ||
    source.routeTarget.upstreamSource !== scope.target.upstreamSource ||
    source.providerRevision === 'unknown' ||
    source.providerRevision !== revision
  ) {
    throw new Error('日级证据来源与行情身份不一致');
  }
};

/** 校验来源窗口的日级分区并集；每个来源原始摘要保持独立。 */
export const observedTradabilityDatesV3 = (
  windows: readonly BacktestDailyTradabilityEvidenceV3[],
  scope: {
    symbol: string;
    routeKey: MarketDataBarRouteKeyV3;
    target: { providerId: string; upstreamSource: string };
    coverageProof: MarketCoverageProofV3;
  },
): string[] => {
  const proof = scope.coverageProof;
  const expected = proof.calendar.expectedSessionDates.filter(
    (date) => date >= proof.listing.firstTradingDate,
  );
  const states = new Map<string, BacktestDailyTradabilityEvidenceV3['days'][number]['state']>();
  for (const evidence of windows) {
    assertTradabilitySourceV3(evidence, scope, windows[0]!.barSource.providerRevision);
    if (
      evidence.range.start < proof.window.requestedStart ||
      evidence.range.end > proof.window.requestedEnd ||
      evidence.listing.listedOn !== proof.listing.firstTradingDate ||
      evidence.listing.source.provider !== proof.listing.source ||
      evidence.listing.source.revision !== proof.listing.revision ||
      evidence.listing.source.availableAt !== proof.listing.knownAt ||
      evidence.calendar.source.provider !== proof.calendar.source ||
      evidence.calendar.source.revision !== proof.calendar.revision
    ) {
      throw new Error('日级证据范围、日历或上市事实不一致');
    }
    const sessionDates = expected.filter(
      (date) => date >= evidence.range.start && date <= evidence.range.end,
    );
    if (JSON.stringify(sessionDates) !== JSON.stringify(evidence.calendar.expectedSessions)) {
      throw new Error('来源窗口遗漏或新增预期交易日');
    }
    for (const day of evidence.days) {
      const previous = states.get(day.date);
      if (previous !== undefined && previous !== day.state)
        throw new Error('重叠来源窗口日级状态冲突');
      states.set(day.date, day.state);
    }
  }
  if (JSON.stringify([...states.keys()].sort()) !== JSON.stringify(expected)) {
    throw new Error('逐窗日级证据未覆盖全部预期交易日');
  }
  return expected.filter((date) => states.get(date) === 'observed-traded');
};

export const sliceTradabilityWindowsV3 = (
  windows: readonly BacktestDailyTradabilityEvidenceV3[],
  range: { start: string; end: string },
): BacktestDailyTradabilityEvidenceV3[] =>
  windows.flatMap((evidence) => {
    const days = evidence.days.filter((day) => day.date >= range.start && day.date <= range.end);
    if (!days.length) return [];
    return [
      {
        ...evidence,
        range: {
          start: evidence.range.start > range.start ? evidence.range.start : range.start,
          end: evidence.range.end < range.end ? evidence.range.end : range.end,
        },
        calendar: { ...evidence.calendar, expectedSessions: days.map((day) => day.date) },
        days,
      },
    ];
  });
