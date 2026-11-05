import {
  isMarketMinuteTimeframe,
  type Currency,
  type TradeChartMarker,
} from '@thesis-ledger/schemas';
import type { MarketChartBar } from './market-chart-types.js';
import type { MarketDetailPosition } from './market-detail.types.js';
import { chartPointKey } from './market-chart-time.js';

export type PlacedTradeMarker = TradeChartMarker & { key: string };
export type TradingOverlayModel = {
  markers: PlacedTradeMarker[];
  lines: Array<{ price: number; title: string; kind: 'cost' | 'risk' }>;
  measurement?: { from: string; to: string; fromPrice: number; toPrice: number } | undefined;
};
export const overlayTimezone = (symbol: string) => {
  if (symbol.endsWith('.US')) return 'America/New_York';
  if (symbol.endsWith('.HK')) return 'Asia/Hong_Kong';
  return 'Asia/Shanghai';
};
function dateAt(timestamp: string, symbol: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: overlayTimezone(symbol),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date(timestamp))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export const overlayTradingDate = (bar: MarketChartBar) =>
  bar.tradingDate ?? dateAt(bar.timestamp, bar.symbol ?? '');

function overlayCurrency(symbol: string): Currency | undefined {
  if (symbol.endsWith('.US')) return 'USD';
  if (/^(?:[0134568]\d{5})\.(SH|SZ|BJ)$/.test(symbol)) return 'CNY';
  const hk = /^(\d{5})\.HK$/.exec(symbol);
  if (!hk) return undefined;
  const code = Number(hk[1]);
  // 港交所2026-03-12代码分配表；特殊海外证券柜台缺少币种事实时保留未知。
  if (code >= 80000 && code <= 89999) return 'CNY';
  if ((code >= 9000 && code <= 9599) || (code >= 9700 && code <= 9849) ||
      (code >= 41500 && code <= 41599)) return 'USD';
  if (code < 1 || code > 9999 || (code >= 4330 && code <= 4399) ||
      (code >= 6200 && code <= 6399)) return undefined;
  return 'HKD';
}

export function overlayPriceScope(
  bars: readonly MarketChartBar[],
  position?: MarketDetailPosition,
) {
  const first = bars[0];
  const currency = overlayCurrency(first?.symbol ?? '');
  const comparable = Boolean(
    first &&
    currency &&
    bars.every(
      (bar) =>
        bar.symbol === first.symbol &&
        bar.timeframe === first.timeframe &&
        bar.adjustment === 'none',
    ) &&
    (!position || position.symbol === first.symbol) &&
    (!position?.currency || position.currency === currency),
  );
  const cost =
    comparable &&
    position?.currency === currency &&
    Number.isFinite(position?.costPrice) &&
    (position?.costPrice ?? 0) > 0
      ? position?.costPrice
      : undefined;
  return { currency, comparable, cost };
}

export function placeTradeMarkers(
  bars: readonly MarketChartBar[],
  markers: readonly TradeChartMarker[],
  currency: Currency,
) {
  const placed: PlacedTradeMarker[] = [];
  let omitted = 0;
  for (const marker of markers) {
    if (marker.currency !== currency) {
      omitted++;
      continue;
    }
    const time = Date.parse(marker.occurredAt);
    const matched = bars.find((bar, index) => {
      const observedAt = bar.observedAt ?? bar.availableAt;
      if (!observedAt) return false;
      if (marker.timePrecision === 'INSTANT' && time > Date.parse(observedAt)) return false;
      if (
        marker.timePrecision === 'DATE' &&
        marker.tradingDate > dateAt(observedAt, bar.symbol ?? '')
      )
        return false;
      if (bar.calculationCutoffAt && time > Date.parse(bar.calculationCutoffAt)) return false;
      if (!isMarketMinuteTimeframe(bar.timeframe)) {
        const start = bar.bucketStartDate ?? overlayTradingDate(bar);
        const end = bar.bucketEndDate ? bar.observedTradingDates?.at(-1) : start;
        if (!end) return false;
        return start <= marker.tradingDate && marker.tradingDate <= end;
      }
      if (marker.timePrecision !== 'INSTANT' || overlayTradingDate(bar) !== marker.tradingDate)
        return false;
      const stamp = Date.parse(bar.timestamp),
        next = bars[index + 1];
      if (bar.bucketEndAt) {
        const end = Math.min(
          Date.parse(bar.bucketEndAt),
          Date.parse(bar.observedEndAt ?? bar.bucketEndAt),
        );
        const boundary = time === end && (!next || Date.parse(next.timestamp) !== end);
        return time >= stamp && (time < end || boundary);
      }
      if (bar.upstreamSource !== 'futu' || bar.session !== 'regular') return false;
      const boundary = time === stamp && (!next || Date.parse(next.timestamp) - stamp > 60_000);
      if (index === 0 && bar.symbol?.endsWith('.HK') && time === stamp) return true;
      return time >= stamp - 60_000 && (time < stamp || boundary);
    });
    if (matched)
      placed.push({ ...marker, key: chartPointKey(matched.timestamp, matched.timeframe) });
    else omitted++;
  }
  placed.sort(
    (left, right) =>
      left.key.localeCompare(right.key) ||
      left.occurredAt.localeCompare(right.occurredAt) ||
      left.id.localeCompare(right.id),
  );
  return { markers: placed, omitted };
}

export function measureChartRange(
  bars: readonly MarketChartBar[],
  from: string | null,
  to: string | null,
) {
  const first = bars.findIndex((bar) => chartPointKey(bar.timestamp, bar.timeframe) === from);
  const last = bars.findIndex((bar) => chartPointKey(bar.timestamp, bar.timeframe) === to);
  if (first < 0 || last < 0) return undefined;
  const start = bars[first]!,
    end = bars[last]!;
  return {
    from: from!,
    to: to!,
    fromPrice: start.close,
    toPrice: end.close,
    difference: end.close - start.close,
    percent: start.close > 0 ? (end.close / start.close - 1) * 100 : null,
    bars: Math.abs(last - first) + 1,
  };
}
