import { createHash } from 'node:crypto';
import {
  canonicalMarketMultiWindowEncodingV3,
  sliceTradabilityWindowsV3,
  type MarketDataBarSeriesResponseV3,
  type MarketDataMultiWindowResponseV3,
} from '@thesis-ledger/schemas';

export const makeMultiWindowResponseV3 = (
  base: MarketDataBarSeriesResponseV3,
): MarketDataMultiWindowResponseV3 => {
  if (base.bars.length < 3) throw new Error('多窗口样本至少需要三条 Bar');
  const middle = Math.floor(base.bars.length / 2);
  const windowObservations = [
    [0, middle + 1],
    [middle, base.bars.length],
  ].map(([start, end]) => {
    const child = structuredClone(base);
    child.bars = child.bars.slice(start, end);
    const first =
      start === 0 ? base.coverage.requestedStart : child.bars[0]!.timestamp.slice(0, 10);
    const last =
      end === base.bars.length
        ? base.coverage.requestedEnd
        : child.bars.at(-1)!.timestamp.slice(0, 10);
    const dates = base.coverageProof.calendar.expectedSessionDates.filter(
      (date) => date >= first && date <= last,
    );
    child.coverageProof.calendar.expectedSessionDates = dates;
    child.coverageProof.window.requestedStart = dates[0]!;
    child.coverageProof.window.requestedEnd = dates.at(-1)!;
    child.coverage.requestedStart = dates[0]!;
    child.coverage.requestedEnd = dates.at(-1)!;
    child.coverage.actualStart = child.bars[0]!.timestamp;
    child.coverage.actualEnd = child.bars.at(-1)!.timestamp;
    child.coverage.latestCompleteTradingDate = dates.at(-1)!;
    if (child.historicalTradabilityWindows) {
      child.historicalTradabilityWindows = sliceTradabilityWindowsV3(
        child.historicalTradabilityWindows,
        { start: first, end: last },
      );
    }
    return {
      startedAt: '2026-05-20T07:00:00Z',
      completedAt: '2026-05-20T07:02:00Z',
      response: child,
    };
  });
  const response: MarketDataMultiWindowResponseV3 = {
    ...base,
    windowObservations,
    ...(base.historicalTradabilityWindows
      ? {
          historicalTradabilityWindows: windowObservations.flatMap(
            (window) => window.response.historicalTradabilityWindows!,
          ),
        }
      : {}),
    sourcePriceBasis: {
      ...base.sourcePriceBasis,
      basisScope: 'request-window',
      observedAt: '2026-05-20T07:02:00Z',
      revision: { origin: 'local-observation', contentHash: '0'.repeat(64) },
    },
  };
  const contentHash = createHash('sha256')
    .update(canonicalMarketMultiWindowEncodingV3(response))
    .digest('hex');
  response.inputFingerprint = contentHash;
  response.sourcePriceBasis.revision = { origin: 'local-observation', contentHash };
  return response;
};
