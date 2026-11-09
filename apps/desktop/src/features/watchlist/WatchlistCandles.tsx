import { formatMarketNumber } from '@thesis-ledger/domain';
import { cn } from '@/lib/utils';
import { marketToneClass, marketToneForValue } from '../../ui/market-color.js';
import type { TrendCandle } from './watchlist-trend.js';

export function WatchlistCandles({ candles }: { candles: TrendCandle[] }) {
  const valid = candles.filter(
    (p) =>
      [p.open, p.high, p.low, p.close].every(Number.isFinite) &&
      p.low <= Math.min(p.open, p.close) &&
      p.high >= Math.max(p.open, p.close),
  );
  if (!valid.length) return null;
  const low = Math.min(...valid.map((p) => p.low));
  const high = Math.max(...valid.map((p) => p.high));
  const y = (value: number) => (high === low ? 30 : 56 - ((value - low) / (high - low)) * 50);
  const step = 152 / valid.length;
  const bodyWidth = Math.min(5, step * 0.65);
  return (
    <svg
      viewBox="0 0 160 62"
      className="size-full h-16"
      role="img"
      aria-label={`日K线，${valid.length}个交易日，前复权`}
    >
      {valid.map((p, index) => {
        const x = 4 + step * (index + 0.5);
        const top = y(Math.max(p.open, p.close));
        const bottom = y(Math.min(p.open, p.close));
        return (
          <g
            key={p.at}
            className={cn('text-foreground', marketToneClass(marketToneForValue(p.close - p.open)))}
          >
            <title>{`${p.at.slice(0, 10)} 开 ${formatMarketNumber(p.open)} 高 ${formatMarketNumber(p.high)} 低 ${formatMarketNumber(p.low)} 收 ${formatMarketNumber(p.close)}`}</title>
            <line
              x1={x}
              x2={x}
              y1={y(p.high)}
              y2={y(p.low)}
              stroke="currentColor"
              strokeWidth="1"
            />
            <rect
              x={x - bodyWidth / 2}
              y={top}
              width={bodyWidth}
              height={Math.max(1, bottom - top)}
              fill="currentColor"
            />
          </g>
        );
      })}
    </svg>
  );
}
