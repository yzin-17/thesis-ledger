import { useEffect, useState, type RefObject } from 'react';
import type { IChartApi, Time, UTCTimestamp } from 'lightweight-charts';
import type { ArenaLiveDetail } from '@thesis-ledger/schemas';

// 时钟只扩展时间轴，不生成估值或连接缺口。
export function useArenaLiveClock(detail: ArenaLiveDetail) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (detail.state !== 'running' || detail.timeline?.phase === 'replay') return;
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, [detail.state, detail.timeline?.phase]);
  const latest = detail.frames.at(-1)?.at;
  if (!latest) return null;
  return Math.floor(Math.max(Date.parse(latest), detail.state === 'running' && detail.timeline?.phase !== 'replay' ? now : 0) / 1000) as UTCTimestamp;
}

export function restoreArenaLiveViewport(chart: IChartApi, previous: { from: Time; to: Time } | null, follow: boolean, latest: UTCTimestamp | null, start?: UTCTimestamp) {
  if (!previous) chart.timeScale().fitContent();
  const range = previous ?? chart.timeScale().getVisibleRange();
  if (follow && latest && range && typeof range.from === 'number' && typeof range.to === 'number') {
    const span = Math.max(300, range.to - range.from);
    let from = Math.min(start ?? range.from, latest - 300);
    if (previous && range.from > (start ?? range.from)) from = latest - span;
    const next = { from: from as UTCTimestamp, to: latest };
    chart.timeScale().setVisibleRange(next);
    return next;
  } else if (previous) {
    chart.timeScale().setVisibleRange(previous);
  }
  return range;
}

export function useArenaLiveHeight(container: RefObject<HTMLDivElement | null>, chart: RefObject<IChartApi | null>) {
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(() => {
      if (container.current && chart.current) chart.current.applyOptions({ height: container.current.clientHeight });
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [container, chart]);
}
