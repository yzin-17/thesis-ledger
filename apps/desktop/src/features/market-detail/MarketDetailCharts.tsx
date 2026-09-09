import type { BarV1, IndicatorV1 } from '@thesis-ledger/schemas';

const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 });
const chartColors = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-3)',
] as const;

type TrendSeries = {
  name: string;
  values: number[];
};

const positionFor = (
  value: number,
  index: number,
  length: number,
  minValue: number,
  range: number,
) => ({
  x: 36 + (index / Math.max(length - 1, 1)) * 648,
  y: 18 + (1 - (value - minValue) / range) * 154,
});

const linePoints = (values: number[], minValue: number, range: number, length: number) =>
  values
    .map((value, index) => {
      const point = positionFor(value, index, length, minValue, range);
      return `${point.x},${point.y}`;
    })
    .join(' ');

function TrendChart({
  label,
  series,
  rangeValues,
  ranges,
}: {
  label: string;
  series: TrendSeries[];
  rangeValues?: number[];
  ranges?: Array<{ low: number; high: number }>;
}) {
  const values = rangeValues ?? series.flatMap((item) => item.values);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = Math.max(maxValue - minValue, Math.abs(maxValue) * 0.01, 1e-6);
  const length = Math.max(...series.map((item) => item.values.length));

  return (
    <div className="rounded-lg bg-muted/30 px-3 py-3" data-market-trend-chart>
      <svg
        className="h-48 min-h-48 w-full overflow-visible"
        viewBox="0 0 720 210"
        role="img"
        aria-label={label}
      >
        <title>{label}</title>
        {[0, 0.5, 1].map((ratio) => {
          const y = 18 + ratio * 154;
          const value = maxValue - ratio * range;
          return (
            <g key={ratio}>
              <line x1="36" x2="684" y1={y} y2={y} className="stroke-border" strokeWidth="1" />
              <text x="30" y={y + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
                {number.format(value)}
              </text>
            </g>
          );
        })}
        {ranges?.map((item, index) => {
          const low = positionFor(item.low, index, length, minValue, range);
          const high = positionFor(item.high, index, length, minValue, range);
          return (
            <line
              key={`${index}-${item.low}-${item.high}`}
              x1={low.x}
              x2={high.x}
              y1={low.y}
              y2={high.y}
              stroke="var(--chart-1)"
              strokeWidth="2"
              opacity="0.28"
            />
          );
        })}
        {series.map((item, index) => (
          <polyline
            key={item.name}
            points={linePoints(item.values, minValue, range, length)}
            fill="none"
            stroke={chartColors[index % chartColors.length]}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
          />
        ))}
      </svg>
      {series.length > 1 ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {series.map((item, index) => (
            <span key={item.name} className="inline-flex items-center gap-1.5">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: chartColors[index % chartColors.length] }}
                aria-hidden="true"
              />
              {item.name} {number.format(item.values.at(-1) ?? 0)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function MarketPriceChart({ bars }: { bars: BarV1[] }) {
  const visible = bars.slice(-30);
  const first = visible[0];
  const last = visible.at(-1);
  const change = first && last && first.close !== 0 ? last.close / first.close - 1 : null;
  const label = `最近 ${visible.length} 个交易日收盘价趋势，最新 ${number.format(last?.close ?? 0)}`;

  return (
    <figure className="m-0 grid gap-2" data-market-price-chart>
      <TrendChart
        label={label}
        series={[{ name: '收盘价', values: visible.map((bar) => bar.close) }]}
        rangeValues={visible.flatMap((bar) => [bar.low, bar.high])}
        ranges={visible.map((bar) => ({ low: bar.low, high: bar.high }))}
      />
      <figcaption className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {first ? new Date(first.timestamp).toLocaleDateString('zh-CN') : '—'} 至{' '}
          {last ? new Date(last.timestamp).toLocaleDateString('zh-CN') : '—'}
        </span>
        <span>
          最新 {number.format(last?.close ?? 0)}
          {change === null ? '' : ` · 区间 ${change >= 0 ? '+' : ''}${(change * 100).toFixed(2)}%`}
        </span>
      </figcaption>
    </figure>
  );
}

function ScalarIndicatorChart({ indicator }: { indicator: IndicatorV1 }) {
  const entries = Object.entries(indicator.values).map(([name, value]) => ({
    name,
    value: Array.isArray(value) ? (value.at(-1) ?? 0) : value,
  }));
  const minValue = Math.min(0, ...entries.map((entry) => entry.value));
  const maxValue = Math.max(0, ...entries.map((entry) => entry.value));
  const range = Math.max(maxValue - minValue, 1e-6);
  const zero = ((0 - minValue) / range) * 100;

  return (
    <div
      className="grid gap-3 rounded-lg bg-muted/30 p-3"
      role="img"
      aria-label={`${indicator.name} 当前值：${entries
        .map((entry) => `${entry.name} ${number.format(entry.value)}`)
        .join('，')}`}
      data-market-indicator-chart="values"
    >
      {entries.map((entry, index) => {
        const value = ((entry.value - minValue) / range) * 100;
        const start = Math.min(zero, value);
        const width = Math.max(Math.abs(value - zero), 1);
        return (
          <div
            key={entry.name}
            className="grid grid-cols-[minmax(5rem,auto)_1fr_auto] items-center gap-3"
          >
            <span className="text-xs font-medium">{entry.name}</span>
            <span className="relative h-2 overflow-hidden rounded-full bg-border">
              <span
                className="absolute inset-y-0 rounded-full"
                style={{
                  left: `${start}%`,
                  width: `${width}%`,
                  backgroundColor: chartColors[index % chartColors.length],
                }}
              />
            </span>
            <strong className="min-w-16 text-right font-mono text-xs font-medium">
              {number.format(entry.value)}
            </strong>
          </div>
        );
      })}
    </div>
  );
}

export function IndicatorValueChart({ indicator }: { indicator: IndicatorV1 }) {
  const series = Object.entries(indicator.values)
    .filter((entry): entry is [string, number[]] => Array.isArray(entry[1]) && entry[1].length > 1)
    .map(([name, values]) => ({ name, values }));

  if (series.length === 0) return <ScalarIndicatorChart indicator={indicator} />;

  const latest = series
    .map((item) => `${item.name} ${number.format(item.values.at(-1) ?? 0)}`)
    .join('，');
  return (
    <div data-market-indicator-chart="trend">
      <TrendChart label={`${indicator.name} 趋势，最新值：${latest}`} series={series} />
    </div>
  );
}
