import { useEffect, useRef } from 'react';
import type { ChartRange } from './chart-date-range.js';
import { rangeCoverage } from './market-chart-range.js';
import type { MarketChartBar } from './market-chart-types.js';

export function useChartRangeHistory({ bars, range, canLoadEarlier, historyLoading, historyError,
  onLoadEarlier, onDataReady, onNotice }: {
  bars: MarketChartBar[];
  range: ChartRange;
  canLoadEarlier?: boolean | undefined;
  historyLoading?: boolean | undefined;
  historyError?: string | null | undefined;
  onLoadEarlier?: ((start?: string) => void) | undefined;
  onDataReady: () => void;
  onNotice: (notice: string | null) => void;
}) {
  const request = useRef('');
  const pending = useRef<string | null>(null);
  const ready = useRef(onDataReady);
  ready.current = onDataReady;
  useEffect(() => {
    const first = bars[0]?.timestamp;
    if (pending.current && first && pending.current !== first && !historyLoading) {
      pending.current = null;
      ready.current();
    }
    const coverage = rangeCoverage(bars, range);
    if (!coverage || coverage.available) { onNotice(null); return; }
    if (historyError) { onNotice('所选区间历史读取失败，已保留当前行情，请重试。'); return; }
    if (historyLoading) { onNotice('正在读取所选区间的历史行情…'); return; }
    const key = JSON.stringify([range, first]);
    if (coverage.earliest > coverage.requested.from && canLoadEarlier && onLoadEarlier && request.current !== key) {
      request.current = key;
      pending.current = first ?? null;
      onNotice('正在补充所选区间的历史行情…');
      onLoadEarlier(coverage.requested.from);
      return;
    }
    onNotice(`所选区间数据未完全覆盖，当前行情为 ${coverage.earliest} 至 ${coverage.latest}。`);
  }, [bars, range, canLoadEarlier, historyLoading, historyError, onLoadEarlier, onNotice]);
}
