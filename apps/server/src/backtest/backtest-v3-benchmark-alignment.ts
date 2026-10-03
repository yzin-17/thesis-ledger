import { compareMarketPitEvidenceInstantStringsV1 } from '@thesis-ledger/schemas';

/** 缺日只沿用既有收盘价用于估值，不创建缺日行情或买卖时刻。 */
export const alignBacktestBenchmarkClosesV3 = <
  T extends {
    occurredAt: string;
    decisionAt: string;
    tradingDate: string;
  },
>(input: {
  closes: readonly T[];
  equity: readonly { occurredAt: string }[];
  dateFor: (instant: string) => string;
  skippedTradingDates?: readonly string[];
}) => {
  const skipped = new Set(input.skippedTradingDates);
  const first = input.closes[0];
  const equity = input.equity.filter(
    (point) =>
      !(
        first &&
        skipped.has(input.dateFor(point.occurredAt)) &&
        input.dateFor(point.occurredAt) < first.tradingDate
      ),
  );
  const byIdentity = new Map(input.closes.map((point) => [point.tradingDate, point]));
  const aligned: T[] = [];
  for (const point of equity) {
    const date = input.dateFor(point.occurredAt);
    let close = byIdentity.get(date);
    if (!close && skipped.has(date)) {
      close = [...input.closes].reverse().find((candidate) => {
        const occurred = compareMarketPitEvidenceInstantStringsV1(
          candidate.occurredAt,
          point.occurredAt,
        );
        const available = compareMarketPitEvidenceInstantStringsV1(
          candidate.decisionAt,
          point.occurredAt,
        );
        return occurred !== undefined && occurred <= 0 && available !== undefined && available <= 0;
      });
    }
    const order = close
      ? compareMarketPitEvidenceInstantStringsV1(close.decisionAt, point.occurredAt)
      : undefined;
    if (!close || order === undefined || order > 0) break;
    aligned.push(close);
  }
  return { aligned, expectedCount: equity.length };
};
