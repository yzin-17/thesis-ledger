export type BacktestChartFill = {
  id: string;
  time: number;
  occurredAt: string;
  side: 'buy' | 'sell';
  symbol: string;
  quantity: string | null;
  price: string | null;
};

export type BacktestTradeMarker = {
  id: string;
  time: number;
  side: 'buy' | 'sell';
  fills: BacktestChartFill[];
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const decimalText = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const amount = asRecord(value)?.amount;
  return typeof amount === 'string' ? amount : null;
};

/** 仅投影到已有序列时点；显示日期不是交易日或会话判定。 */
export function projectBacktestTradeMarkers(
  rawFills: unknown,
  points: readonly { time: number }[],
  timezone: string,
  alignment: 'at-or-after' | 'same-date' = 'at-or-after',
) {
  const groups = new Map<string, BacktestTradeMarker>();
  let unmappedFillCount = 0;
  if (!Array.isArray(rawFills)) return { tradeMarkers: [], unmappedFillCount };
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const pointsByDate = new Map<string, { time: number } | null>();
  if (alignment === 'same-date') for (const point of points) {
    const key = date.format(point.time);
    pointsByDate.set(key, pointsByDate.has(key) ? null : point);
  }
  rawFills.forEach((raw, index) => {
    const fill = asRecord(raw);
    const occurredAt = fill?.occurredAt ?? fill?.date;
    const time = typeof occurredAt === 'string' ? Date.parse(occurredAt) : NaN;
    const side = typeof fill?.side === 'string' ? fill.side.toLowerCase() : '';
    if (!fill || !Number.isFinite(time) || (side !== 'buy' && side !== 'sell')) {
      unmappedFillCount++;
      return;
    }
    let point: { time: number } | null | undefined;
    if (alignment === 'same-date') {
      point = pointsByDate.get(date.format(time));
    } else {
      let from = 0, to = points.length;
      while (from < to) {
        const middle = Math.floor((from + to) / 2);
        if (points[middle]!.time < time) from = middle + 1;
        else to = middle;
      }
      point = points[from];
    }
    if (!point || date.format(point.time) !== date.format(time)) {
      unmappedFillCount++;
      return;
    }
    const id = `${point.time}:${side}`;
    const group: BacktestTradeMarker = groups.get(id) ?? { id, time: point.time, side, fills: [] };
    const symbol = fill.executionSymbol ?? fill.symbol;
    group.fills.push({
      id: typeof fill.fillId === 'string' ? fill.fillId : `fill-${index}`,
      time,
      occurredAt: occurredAt as string,
      side,
      symbol: typeof symbol === 'string' ? symbol : '标的未记录',
      quantity: decimalText(fill.quantity),
      price: decimalText(fill.price),
    });
    groups.set(id, group);
  });
  const tradeMarkers = [...groups.values()].sort((a, b) => a.time - b.time || a.side.localeCompare(b.side));
  for (const group of tradeMarkers) group.fills.sort((a, b) => a.time - b.time);
  return { tradeMarkers, unmappedFillCount };
}
