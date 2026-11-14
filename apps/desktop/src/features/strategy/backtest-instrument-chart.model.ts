import type { BacktestInstrumentSeries } from '@thesis-ledger/schemas';

export type BacktestInstrumentChartRequest = {
  data: BacktestInstrumentSeries | undefined;
  fetching: boolean;
  error: boolean;
};
export type BacktestInstrumentChart =
  | {
      status: 'available';
      source: Extract<BacktestInstrumentSeries, { status: 'available' }>['source'];
      points: { time: number; timestamp: string; value: number | null; close: string | null }[];
    }
  | { status: 'unavailable'; message: string };

export function projectBacktestInstrumentChart(
  runId: string,
  snapshotId: unknown,
  series?: BacktestInstrumentSeries,
  equity: readonly { time: number }[] = [],
): BacktestInstrumentChart | undefined {
  if (!series) return undefined;
  if (
    series.runId !== runId ||
    (series.status === 'available' && series.source.snapshotId !== snapshotId)
  )
    return { status: 'unavailable', message: '标的走势与当前回测快照不一致，未绘制。' };
  if (series.status === 'unavailable') return { status: 'unavailable', message: series.message };
  // 日线按来源时区的同日期权益时点展示；保留原始时间，不推断交易会话。
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: series.source.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const uniqueTimes = (times: readonly { time: number }[]) => {
    const result = new Map<string, number | null>();
    for (const point of times) {
      const key = date.format(point.time);
      result.set(key, result.has(key) ? null : point.time);
    }
    return result;
  };
  const equityDates = uniqueTimes(equity);
  const priceDates = uniqueTimes(
    series.points.map((point) => ({ time: Date.parse(point.occurredAt) })),
  );
  return {
    status: 'available',
    source: series.source,
    points: series.points.map((point) => {
      const number = point.close === null ? null : Number(point.close);
      const nonzero = point.close !== null && /[1-9]/.test(point.close.split(/[eE]/)[0]!);
      const value =
        number !== null && Number.isFinite(number) && !(number === 0 && nonzero) ? number : null;
      const rawTime = Date.parse(point.occurredAt);
      const key = date.format(rawTime);
      const alignedTime =
        series.source.timeframe === '1d' && priceDates.get(key) !== null
          ? equityDates.get(key)
          : null;
      return {
        time: alignedTime ?? rawTime,
        timestamp: point.occurredAt,
        value,
        close: point.close,
      };
    }),
  };
}

export const backtestAdjustmentLabels = { none: '不复权', qfq: '前复权', hfq: '后复权' } as const;
