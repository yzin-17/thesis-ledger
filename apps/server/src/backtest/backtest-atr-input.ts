import {
  mergeBacktestAvailability,
  sourceSeriesKey,
  type BacktestSeries,
  type BacktestSeriesPoint,
} from '@thesis-ledger/domain';

/** ATR 用同坐标、同根的完整 OHLC；缺字段不能退化为收盘价的变动幅度。 */
export function atrInputSeries(
  close: BacktestSeries,
  sources: ReadonlyMap<string, BacktestSeries>,
  sourceId: string,
): BacktestSeries {
  const index = (field: 'high' | 'low') =>
    new Map(
      sources.get(sourceSeriesKey(sourceId, field))?.points.map((p) => [p.occurredAt, p]) ?? [],
    );
  const highs = index('high'),
    lows = index('low');
  const points = close.points.map((point): BacktestSeriesPoint => {
    const high = highs.get(point.occurredAt),
      low = lows.get(point.occurredAt);
    if ([point, high, low].some((p) => !p || p.status === 'unavailable' || p.value === undefined))
      return {
        occurredAt: point.occurredAt,
        availableAt: point.availableAt,
        status: 'unavailable',
        reason: 'ATR缺少同根可见high/low/close',
      };
    return {
      ...point,
      high: high!.value!,
      low: low!.value!,
      close: point.value!,
      ...mergeBacktestAvailability([point, high!, low!]),
    };
  });
  return { ...close, points };
}
