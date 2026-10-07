import type { MarketDataBarSeriesResponseV3 } from '@thesis-ledger/schemas';
import { compareMarketPitEvidenceInstantStringsV1 } from './market-pit-evidence-instant-v1.js';

type ArchiveClockInput = {
  fetchedAt: Date;
  response: MarketDataBarSeriesResponseV3;
  dataAsOf: string;
  contractVersion: 1 | 2;
};

/** 两版均核验完整归档的原始时钟；Date 仅保留实际捕获的毫秒精度。 */
export const marketPitArchiveExceedsCutoffV3 = (input: ArchiveClockInput): boolean => {
  if (!Number.isFinite(input.fetchedAt.getTime())) return true;
  const clocks = [
    input.fetchedAt.toISOString(),
    input.response.sourcePriceBasis.observedAt,
    ...input.response.bars.flatMap((bar) => [bar.timestamp, bar.availableAt]),
  ];
  return clocks.some((clock) => {
    const order = compareMarketPitEvidenceInstantStringsV1(clock, input.dataAsOf);
    return order === undefined || order > 0;
  });
};
