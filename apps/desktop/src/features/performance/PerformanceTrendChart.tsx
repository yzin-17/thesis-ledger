import { useState } from 'react';

import { money } from '../shared/display.js';
import type {
  Currency,
  PerformanceSeriesInterval,
  PerformanceSeriesPoint,
} from './performance.types.js';

const moneyByCurrency: Record<Currency, Intl.NumberFormat> = {
  CNY: money,
  HKD: new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'HKD' }),
  USD: new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'USD' }),
};

const formatMoney = (value: number, currency: Currency) => moneyByCurrency[currency].format(value);

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '尚无数据时点' : date.toLocaleString('zh-CN');
};

const formatCoverage = (value: number) => `${(value * 100).toFixed(2)}%`;

export const performanceSeriesQualityLabel = (quality: PerformanceSeriesPoint['dataQuality']) => {
  if (quality === 'LOW_COVERAGE') return '低覆盖估值';
  if (quality === 'PARTIAL') return '部分估值';
  if (quality === 'UNAVAILABLE') return '数据不可用';
  return '数据完整';
};

export function PerformanceTrendChart({
  seriesPoints,
  interval,
}: {
  seriesPoints: PerformanceSeriesPoint[];
  interval: PerformanceSeriesInterval;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const values = seriesPoints.map((point) => point.value);
  const width = 640;
  const height = 220;
  const padding = { top: 18, right: 18, bottom: 28, left: 18 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = Math.max(maxValue - minValue, 1);
  const times = seriesPoints.map((point) => new Date(point.at).getTime());
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const timeRange = Math.max(maxTime - minTime, 1);
  const points = values.map((value, index) => {
    let x = padding.left + (((times[index] ?? minTime) - minTime) / timeRange) * chartWidth;
    if (seriesPoints.length === 1) x = padding.left + chartWidth / 2;
    const y = padding.top + (1 - (value - minValue) / valueRange) * chartHeight;
    return { x, y };
  });
  const pointsValue = points.map((point) => `${point.x},${point.y}`).join(' ');
  const first = seriesPoints[0];
  const last = seriesPoints.at(-1);
  const activePoint = activeIndex === null ? undefined : points[activeIndex];
  const activeValue = activeIndex === null ? undefined : seriesPoints[activeIndex];
  const dense = interval === '1min' || interval === '1h';

  const activateNearest = (clientX: number, target: SVGSVGElement) => {
    const bounds = target.getBoundingClientRect();
    if (bounds.width === 0) return;
    const viewX = ((clientX - bounds.left) / bounds.width) * width;
    let nearest = 0;
    let distance = Number.POSITIVE_INFINITY;
    points.forEach((point, index) => {
      const nextDistance = Math.abs(point.x - viewX);
      if (nextDistance < distance) {
        nearest = index;
        distance = nextDistance;
      }
    });
    setActiveIndex(nearest);
  };

  return (
    <div className="relative rounded-lg bg-muted/30 px-3 py-3" aria-label="资产走势">
      <svg
        className="h-52 w-full touch-none text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
        viewBox={`0 0 ${width} ${height}`}
        role="application"
        tabIndex={0}
        aria-label="资产价值走势图，可使用左右方向键逐点查看"
        onFocus={() => setActiveIndex((current) => current ?? seriesPoints.length - 1)}
        onPointerMove={(event) => activateNearest(event.clientX, event.currentTarget)}
        onPointerDown={(event) => activateNearest(event.clientX, event.currentTarget)}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') setActiveIndex(null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setActiveIndex(null);
            return;
          }
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          const current = activeIndex ?? seriesPoints.length - 1;
          const direction = event.key === 'ArrowLeft' ? -1 : 1;
          setActiveIndex(Math.max(0, Math.min(seriesPoints.length - 1, current + direction)));
        }}
      >
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={height - padding.bottom}
          y2={height - padding.bottom}
          className="stroke-border"
          strokeWidth="1"
        />
        <polyline
          points={pointsValue}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
        {!dense
          ? points.map((point, index) => (
              <circle
                key={`${seriesPoints[index]?.sourceSnapshotId ?? seriesPoints[index]?.at ?? index}`}
                cx={point.x}
                cy={point.y}
                r="3"
                fill="currentColor"
              />
            ))
          : null}
        {activePoint ? (
          <>
            <line
              x1={activePoint.x}
              x2={activePoint.x}
              y1={padding.top}
              y2={height - padding.bottom}
              className="stroke-muted-foreground/60"
              strokeDasharray="4 4"
            />
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={activePoint.y}
              y2={activePoint.y}
              className="stroke-muted-foreground/60"
              strokeDasharray="4 4"
            />
            <circle cx={activePoint.x} cy={activePoint.y} r="5" fill="currentColor" />
          </>
        ) : null}
      </svg>
      {activePoint && activeValue ? (
        <div
          className="pointer-events-none absolute top-3 z-10 min-w-52 -translate-x-1/2 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
          style={{ left: `${Math.max(18, Math.min(82, (activePoint.x / width) * 100))}%` }}
          role="status"
          aria-live="polite"
        >
          <p className="m-0 font-medium">{formatDate(activeValue.at)}</p>
          <p className="m-0 mt-1 text-sm font-semibold">
            {formatMoney(activeValue.value, activeValue.currency)}
          </p>
          <p className="m-0 mt-1 text-muted-foreground">
            {activeValue.valuationBasis === 'OFFICIAL' ? '正式估值' : '估算值'} ·{' '}
            {performanceSeriesQualityLabel(activeValue.dataQuality)}
          </p>
          <p className="m-0 text-muted-foreground">
            披露覆盖 {formatCoverage(activeValue.disclosureCoverage)} · 可定价覆盖{' '}
            {formatCoverage(activeValue.pricedCoverage)}
          </p>
        </div>
      ) : null}
      <div className="flex justify-between gap-3 text-xs text-muted-foreground">
        <span>{first ? formatDate(first.at) : '尚无数据时点'}</span>
        <span>
          {last ? `${formatDate(last.at)} · ${formatMoney(last.value, last.currency)}` : ''}
        </span>
      </div>
    </div>
  );
}
