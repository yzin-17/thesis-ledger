import { formatRatioPercent as formatCoverage } from '@thesis-ledger/domain';
import { useEffect, useRef, useState } from 'react';

import { money } from '../shared/display.js';
import { performanceTrendGeometry } from './performance-trend-model.js';
import { pnlReasonLabels, type PnlChartPoint } from './performance-pnl-model.js';
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

const performanceSeriesQualityLabel = (quality: PerformanceSeriesPoint['dataQuality']) => {
  if (quality === 'LOW_COVERAGE') return '低覆盖估值';
  if (quality === 'PARTIAL') return '部分估值';
  if (quality === 'UNAVAILABLE') return '数据不可用';
  return '数据完整';
};

export function PerformanceTrendChart({
  seriesPoints,
  interval,
  pnlPoints,
  pnlCurrency = 'CNY',
}: {
  seriesPoints: PerformanceSeriesPoint[];
  interval: PerformanceSeriesInterval;
  pnlPoints?: PnlChartPoint[] | undefined;
  pnlCurrency?: Currency | undefined;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  useEffect(() => {
    const element = container.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => setActiveIndex(null), [seriesPoints, pnlPoints]);
  const geometry = performanceTrendGeometry(seriesPoints, pnlPoints ?? [], width);
  const active = activeIndex === null ? undefined : geometry.timeline[activeIndex];
  const currency = seriesPoints[0]?.currency ?? pnlCurrency;
  const combined = pnlPoints !== undefined;
  const axisMoney = (value: number, unit: Currency) =>
    new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: unit,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  const pickPoint = (clientX: number, svg: SVGSVGElement) => {
    const bounds = svg.getBoundingClientRect();
    if (!bounds.width || !geometry.timeline.length) return;
    const x = ((clientX - bounds.left) / bounds.width) * width;
    let nearest = 0;
    geometry.timeline.forEach((point, index) => {
      if (Math.abs(point.x - x) < Math.abs(geometry.timeline[nearest]!.x - x)) nearest = index;
    });
    setActiveIndex(nearest);
  };
  return (
    <div
      ref={container}
      className="relative min-w-0 rounded-lg bg-muted/30 p-3"
      aria-label={combined ? '资产总值与累计盈亏走势' : '资产走势'}
    >
      <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-4 bg-chart-1" />
          资产总值 · {currency} · 左轴
        </span>
        {combined && (
          <span className="inline-flex items-center gap-2">
            <span className="w-4 border-t-2 border-dashed border-chart-4" />
            累计盈亏 · {pnlCurrency} · 右轴
          </span>
        )}
      </div>
      <svg
        className="h-64 w-full touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-ring"
        viewBox={`0 0 ${width} ${geometry.height}`}
        role="application"
        tabIndex={0}
        aria-label={`${combined ? '资产总值与累计盈亏' : '资产价值'}走势图，可使用左右方向键逐点查看，按 Escape 关闭详情`}
        onFocus={() => setActiveIndex(geometry.timeline.length - 1)}
        onPointerMove={(event) => pickPoint(event.clientX, event.currentTarget)}
        onPointerDown={(event) => pickPoint(event.clientX, event.currentTarget)}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') setActiveIndex(null);
        }}
        onBlur={() => setActiveIndex(null)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setActiveIndex(null);
            return;
          }
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          const direction = event.key === 'ArrowLeft' ? -1 : 1;
          setActiveIndex(
            Math.max(
              0,
              Math.min(
                geometry.timeline.length - 1,
                (activeIndex ?? geometry.timeline.length - 1) + direction,
              ),
            ),
          );
        }}
      >
        <title>{combined ? '资产总值与累计盈亏走势' : '资产走势'}</title>
        {geometry.assetAxis.ticks.map((tick) => (
          <g key={tick.value}>
            <line
              x1={geometry.padding.left}
              x2={width - geometry.padding.right}
              y1={tick.y}
              y2={tick.y}
              className="stroke-border/50"
              strokeDasharray="3 5"
            />
            {seriesPoints.length > 0 && (
              <text x={0} y={tick.y + 4} className="fill-muted-foreground text-chart">
                {axisMoney(tick.value, currency)}
              </text>
            )}
          </g>
        ))}
        {combined &&
          geometry.pnlAxis.ticks.map((tick) => (
            <text
              key={tick.value}
              x={width}
              y={tick.y + 4}
              textAnchor="end"
              className="fill-muted-foreground text-chart"
            >
              {axisMoney(tick.value, pnlCurrency)}
            </text>
          ))}
        {combined && (
          <line
            x1={geometry.padding.left}
            x2={width - geometry.padding.right}
            y1={geometry.pnlAxis.y(0)}
            y2={geometry.pnlAxis.y(0)}
            className="stroke-chart-4/50"
            strokeDasharray="3 5"
          />
        )}
        <polyline
          points={geometry.assetCoordinates.map((point) => `${point.x},${point.y}`).join(' ')}
          fill="none"
          className="stroke-chart-1"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        {interval !== '1min' &&
          interval !== '1h' &&
          geometry.assetCoordinates.map((point, index) => (
            <circle
              key={seriesPoints[index]!.at}
              cx={point.x}
              cy={point.y}
              r="2.5"
              className="fill-chart-1"
            />
          ))}
        {geometry.segments.map((segment, index) => (
          <polyline
            key={index}
            points={segment.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="none"
            className="stroke-chart-4"
            strokeDasharray="6 4"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        ))}
        {geometry.pnlCoordinates.map(
          (point, index) =>
            point.y !== null && (
              <circle
                key={pnlPoints![index]!.at}
                cx={point.x}
                cy={point.y}
                r={pnlPoints![index]!.current ? 4 : 2.5}
                className="fill-chart-4"
              />
            ),
        )}
        {active && (
          <line
            x1={active.x}
            x2={active.x}
            y1={geometry.padding.top}
            y2={geometry.height - geometry.padding.bottom}
            className="stroke-muted-foreground"
            strokeDasharray="3 4"
          />
        )}
        <text
          x={geometry.padding.left}
          y={geometry.height - 5}
          className="fill-muted-foreground text-chart"
        >
          {geometry.timeline[0]
            ? new Date(geometry.timeline[0].at).toLocaleDateString('zh-CN')
            : ''}
        </text>
        <text
          x={width - geometry.padding.right}
          y={geometry.height - 5}
          textAnchor="end"
          className="fill-muted-foreground text-chart"
        >
          {geometry.timeline.length > 1
            ? new Date(geometry.timeline.at(-1)!.at).toLocaleDateString('zh-CN')
            : ''}
        </text>
      </svg>
      {active && (
        <div
          className="pointer-events-none absolute top-9 right-3 max-w-[calc(100%-1.5rem)] rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
          role="status"
          aria-live="polite"
        >
          <p className="m-0 font-medium">{formatDate(active.at)}</p>
          <p className="m-0 mt-2 font-semibold">
            资产总值{' '}
            {active.asset ? formatMoney(active.asset.value, active.asset.currency) : '该时点无记录'}
          </p>
          {active.asset && (
            <>
              <p className="m-0 mt-1 text-muted-foreground">
                {active.asset.valuationBasis === 'OFFICIAL' ? '正式估值' : '估算值'} ·{' '}
                {performanceSeriesQualityLabel(active.asset.dataQuality)}
              </p>
              <p className="m-0 text-muted-foreground">
                披露覆盖 {formatCoverage(active.asset.disclosureCoverage)} · 可定价覆盖{' '}
                {formatCoverage(active.asset.pricedCoverage)}
              </p>
            </>
          )}
          {combined && (
            <>
              <p className="m-0 mt-2 font-semibold">
                累计盈亏{' '}
                {active.pnl?.value !== null && active.pnl?.value !== undefined
                  ? formatMoney(active.pnl.value, pnlCurrency)
                  : '—'}
              </p>
              {!active.pnl && <p className="m-0 text-muted-foreground">该时点无盈亏记录</p>}
              {active.pnl && (
                <>
                  <p className="m-0 text-muted-foreground">
                    {active.pnl.current ? '当前估值' : '历史收盘记录'}
                  </p>
                  {active.pnl.reason ? (
                    <p className="m-0 text-muted-foreground">
                      {pnlReasonLabels[active.pnl.reason]}
                    </p>
                  ) : (
                    <p className="m-0 text-muted-foreground">
                      已实现{' '}
                      {active.pnl.realizedPnl === null
                        ? '—'
                        : formatMoney(active.pnl.realizedPnl, pnlCurrency)}{' '}
                      · 未实现{' '}
                      {active.pnl.unrealizedPnl === null
                        ? '—'
                        : formatMoney(active.pnl.unrealizedPnl, pnlCurrency)}
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
