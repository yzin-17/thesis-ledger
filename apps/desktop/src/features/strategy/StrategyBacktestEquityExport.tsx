import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  backtestEquityCsv,
  visibleBacktestPoints,
  type BacktestChartModel,
} from './strategy-backtest-chart.model.js';

export function StrategyBacktestEquityExport({
  jobId,
  model,
  range,
}: {
  jobId: string;
  model: BacktestChartModel;
  range: { from: number; to: number } | null;
}) {
  const count = visibleBacktestPoints(model.equity, range).length;
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([backtestEquityCsv(model, range)], { type: 'text/csv;charset=utf-8' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `backtest-${jobId}-equity.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">
        当前区间 {count} 个权益时点 · {model.timezone} · {model.currency ?? '币种未记录'}
      </span>
      <Button size="sm" variant="outline" disabled={count === 0} onClick={download}>
        <Download data-icon="inline-start" />
        导出当前筛选区间
      </Button>
    </div>
  );
}
