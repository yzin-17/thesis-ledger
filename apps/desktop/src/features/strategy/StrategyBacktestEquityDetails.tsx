import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDateTimeInTimeZone } from '@/lib/date-display';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  backtestEquityCsv,
  visibleBacktestPoints,
  type BacktestChartModel,
} from './strategy-backtest-chart.model.js';

const moneyFormatter = (currency: BacktestChartModel['currency']) => {
  if (!currency) return (value: number | null) => (value === null ? '不可用' : String(value));
  const formatter = new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  });
  return (value: number | null) => (value === null ? '不可用' : formatter.format(value));
};

export function StrategyBacktestEquityDetails({
  jobId,
  model,
  range,
}: {
  jobId: string;
  model: BacktestChartModel;
  range: { from: number; to: number } | null;
}) {
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const points = useMemo(() => visibleBacktestPoints(model.equity, range), [model.equity, range]);
  const drawdownByTime = useMemo(
    () => new Map(model.drawdown.map((point) => [point.time, point.value])),
    [model.drawdown],
  );
  const totalPages = Math.max(1, Math.ceil(points.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = points.slice((safePage - 1) * pageSize, safePage * pageSize);
  const money = moneyFormatter(model.currency);

  useEffect(() => setPage(1), [pageSize, range?.from, range?.to]);

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
    <details className="group rounded-lg border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span>
          <span className="font-medium">查看权益明细（{points.length} 个时点）</span>
          <span className="ml-2 text-xs text-muted-foreground">默认收起，按当前图表范围筛选</span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            导出包含当前筛选区间的全部 {points.length} 行，不受当前页限制。时区 {model.timezone}
            {model.currency ? `，币种 ${model.currency}` : '，币种未记录'}。
          </p>
          <div className="flex items-center gap-2">
            <Select
              value={String(pageSize)}
              onValueChange={(value) => value && setPageSize(Number(value))}
            >
              <SelectTrigger className="w-24" aria-label="每页权益时点数量">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="25">25 条</SelectItem>
                  <SelectItem value="50">50 条</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" disabled={points.length === 0} onClick={download}>
              <Download />
              导出当前筛选区间
            </Button>
          </div>
        </div>
        {model.limitation && (
          <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {model.limitation}导出仅包含已返回记录，不代表全部历史数据。
          </p>
        )}
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b bg-muted/30 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">时间（{model.timezone}）</th>
                <th className="px-3 py-2 text-right font-medium">组合权益</th>
                <th className="px-3 py-2 text-right font-medium">现金</th>
                <th className="px-3 py-2 text-right font-medium">持仓市值</th>
                <th className="px-3 py-2 text-right font-medium">回撤</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    当前筛选区间没有权益时点
                  </td>
                </tr>
              ) : (
                rows.map((point) => {
                  const drawdown = drawdownByTime.get(point.time);
                  return (
                    <tr key={point.time} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        {formatDateTimeInTimeZone(point.time, model.timezone)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(point.value)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(point.cash)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {money(point.positionsValue)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {drawdown === undefined ? '不可用' : `${(drawdown * 100).toFixed(2)}%`}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            第 {safePage} / {totalPages} 页
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={safePage <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              上一页
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={safePage >= totalPages}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            >
              下一页
            </Button>
          </div>
        </div>
      </div>
    </details>
  );
}
