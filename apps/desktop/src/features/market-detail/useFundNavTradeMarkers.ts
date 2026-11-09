import { useEffect, type RefObject } from 'react';
import {
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type Time,
  type MouseEventParams,
} from 'lightweight-charts';
import type { FundNavTradeGroup } from './fund-nav-trade-model.js';

export function useFundNavTradeMarkers(
  chartRef: RefObject<IChartApi | null>,
  lineRef: RefObject<ISeriesApi<SeriesType, Time> | null>,
  groups: FundNavTradeGroup[],
  select: (id: string) => void,
) {
  useEffect(() => {
    const chart = chartRef.current;
    const line = lineRef.current;
    if (!chart || !line || !groups.length) return;
    const markers = createSeriesMarkers(line, [], { autoScale: true });
    const paintMarkers = () => {
      const style = getComputedStyle(document.documentElement);
      const buyColor = style.getPropertyValue('--color-market-up').trim() || '#c7393c';
      const sellColor = style.getPropertyValue('--color-market-down').trim() || '#2f7a66';
      markers.setMarkers(groups.map((group) => ({
        id: group.id,
        time: group.date,
        position: group.side === 'buy' ? ('belowBar' as const) : ('aboveBar' as const),
        color: group.side === 'buy' ? buyColor : sellColor,
        shape: group.side === 'buy' ? ('arrowUp' as const) : ('arrowDown' as const),
        text: `${group.side === 'buy' ? '买' : '卖'}${group.trades.length > 1 ? ` ${group.trades.length}笔` : ''}`,
      })));
    };
    paintMarkers();
    const observer = new MutationObserver(paintMarkers);
    observer.observe(document.documentElement, {
      attributes: true, attributeFilter: ['style', 'class', 'data-theme', 'data-market-color-scheme'],
    });
    const click = (event: MouseEventParams) => {
      if (
        typeof event.hoveredObjectId === 'string' &&
        groups.some((group) => group.id === event.hoveredObjectId)
      )
        select(event.hoveredObjectId);
    };
    chart.subscribeClick(click);
    return () => {
      observer.disconnect();
      if (chartRef.current !== chart) return;
      chart.unsubscribeClick(click);
      markers.detach();
    };
  }, [chartRef, lineRef, groups, select]);
}
