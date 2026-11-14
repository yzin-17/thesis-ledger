import { TableContainer, TableHeader, TableHead } from '@/components/ui/table';
import { useEffect, useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDateTime } from '@/lib/date-display';
import { formatDecimalNumber } from '@thesis-ledger/domain';
import { cn } from '@/lib/utils';
import { marketToneClass, marketToneForValue } from '@/ui/market-color';
import { Metric } from '../shared/DesktopPrimitives.js';
import {
  backtestBaseCurrency,
  backtestMetricNumber,
  backtestMetricPercent,
  backtestNumber,
  backtestResultCollections,
  readableBacktestResult,
} from './strategy-backtest-detail.model.js';
import type { BacktestJob, BacktestJobResult } from './strategy.types.js';
import { buildBacktestChartModel } from './strategy-backtest-chart.model.js';
import { StrategyBacktestEquityChart } from './StrategyBacktestEquityChart.js';
import type { BacktestInstrumentChartRequest } from './backtest-instrument-chart.model.js';
import { StrategyBacktestEquityExport } from './StrategyBacktestEquityExport.js';
import { StrategyBacktestDiagnostics } from './StrategyBacktestDiagnostics.js';
import { BacktestRunDisclosure } from './BacktestModelDisclosure.js';
import { BacktestRunSettings } from './BacktestRunSettings.js';
import {
  backtestBenchmarkDisplayMetrics,
  backtestMetricReasonLabel,
  backtestPartialResultSummary,
} from './strategy-backtest-result-availability.model.js';

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const display = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '未记录';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return JSON.stringify(value);
};

const displayDateTime = (value: unknown) =>
  typeof value === 'string' ? formatDateTime(value, '未记录') : '未记录';

const sideDisplay = (value: unknown) => {
  if (value === 'buy' || value === 'BUY') return '买入';
  if (value === 'sell' || value === 'SELL') return '卖出';
  if (value === 'signal') return '信号退出';
  if (value === 'risk') return '风险退出';
  return display(value);
};

const metricText = (
  metrics: Record<string, unknown> | null,
  keys: string[],
  kind: 'percent' | 'ratio' = 'percent',
  magnitude = false,
) => {
  const key = keys.find((candidate) => metrics?.[candidate] !== undefined);
  if (!key) return '不可用';
  const raw = metrics?.[key];
  const value =
    kind === 'percent' ? backtestMetricPercent(raw, magnitude) : backtestMetricNumber(raw);
  if (value === null) {
    const reason = backtestMetricReasonLabel(raw);
    return reason ? `不可用：${reason}` : '不可用';
  }
  if (typeof value === 'string') return value;
  return (magnitude ? Math.abs(value) : value).toFixed(2);
};

const moneyText = (value: unknown, currency: 'CNY' | 'HKD' | 'USD' | null) => {
  const amount = backtestNumber(value);
  if (amount === null || !currency) return '不可用';
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
};

function CompactTable({
  label,
  headers,
  rows,
  empty,
  numericColumns = [],
}: {
  label: string;
  headers: string[];
  rows: string[][];
  empty: string;
  numericColumns?: number[];
}) {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const offset = (currentPage - 1) * pageSize;
  const visibleRows = rows.slice(offset, offset + pageSize);
  return (
    <>
    <TableContainer>
      <table aria-label={label} className="w-full min-w-[640px] text-sm">
        <TableHeader className="border-b text-left">
          <tr>
            {headers.map((header, index) => (
              <TableHead
                key={header}
                className={numericColumns.includes(index) ? 'text-right' : undefined}
              >
                {header}
              </TableHead>
            ))}
          </tr>
        </TableHeader>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="px-3 py-6 text-center text-muted-foreground" colSpan={headers.length}>
                {empty}
              </td>
            </tr>
          ) : (
            visibleRows.map((row, index) => (
              <tr key={`${row[0] ?? 'row'}-${index}`} className="border-b last:border-0">
                {row.map((cell, cellIndex) => (
                  <td
                    key={`${cellIndex}-${cell}`}
                    className={`px-3 py-2 ${numericColumns.includes(cellIndex) ? 'text-right tabular-nums' : 'text-left'}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </TableContainer>
    {rows.length > pageSize && (
      <nav aria-label={`${label}分页`} className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground" aria-live="polite">
          共 {rows.length} 条，第 {offset + 1}–{Math.min(offset + pageSize, rows.length)} 条 · 第 {currentPage}/{pageCount} 页
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>上一页</Button>
          <Button type="button" variant="outline" size="sm" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>下一页</Button>
        </div>
      </nav>
    )}
    </>
  );
}

function ResultOverview({ job, result, instrumentRequest }: { job: BacktestJob; result: BacktestJobResult; instrumentRequest?: BacktestInstrumentChartRequest | undefined }) {
  const [visibleRange, setVisibleRange] = useState<{ from: number; to: number } | null>(null);
  useEffect(() => setVisibleRange(null), [job.id]);
  const metrics = record(result.metrics);
  const research = record(result.priceResearch);
  const benchmark = backtestBenchmarkDisplayMetrics(result);
  const collections = backtestResultCollections(result);
  const currency = backtestBaseCurrency(job, result);
  const lastEquity = collections.equityCurve.at(-1);
  const lastEquityRecord = record(lastEquity);
  const finalValue = result.finalValue ?? lastEquityRecord?.value;
  const hasTrades = Array.isArray(result.trades);
  const hasFills = Array.isArray(result.simulationFills);
  let countLabel = '交易次数';
  let countValue = '不可用';
  if (hasTrades) {
    countLabel = '已平仓交易数';
    countValue = String(collections.trades.length);
  } else if (hasFills) {
    countLabel = '成交笔数';
    countValue = String(collections.fills.length);
  }
  const rejectionAvailable =
    Array.isArray(result.rejectedOrders) || Array.isArray(result.rejectedNavRequests);
  const chartModel = useMemo(() => buildBacktestChartModel(job, result, instrumentRequest?.data), [job, result, instrumentRequest?.data]);
  const secondary = [
    { label: '年化收益', value: metricText(metrics, ['cagr', 'annualizedReturn']), tone: marketToneForValue(backtestMetricNumber(metrics?.cagr ?? metrics?.annualizedReturn)) },
    { label: '波动率', value: metricText(metrics, ['volatility']), tone: undefined },
    { label: '夏普比率', value: metricText(metrics, ['sharpe'], 'ratio'), tone: undefined },
    { label: '胜率', value: metricText(metrics, ['tradeWinRate', 'winRate']), tone: undefined },
    { label: '利润因子', value: metricText(metrics, ['profitFactor'], 'ratio'), tone: undefined },
  ].filter(({ value }) => value !== '不可用');
  if (benchmark) {
    secondary.push(
      { label: '基准净收益', value: metricText(benchmark, ['totalReturn']), tone: marketToneForValue(backtestMetricNumber(benchmark.totalReturn)) },
      { label: '净收益差', value: metricText(benchmark, ['excessReturn']), tone: marketToneForValue(backtestMetricNumber(benchmark.excessReturn)) },
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label={research ? '模拟收益率' : '策略净收益'}
          value={metricText(metrics, ['cumulativeReturn', 'totalReturn'])}
          tone={marketToneForValue(backtestMetricNumber(metrics?.cumulativeReturn ?? metrics?.totalReturn))}
        />
        <Metric
          label="最大回撤"
          value={metricText(metrics, ['maxDrawdown'], 'percent', true)}
        />
        <Metric label={research ? '研究权益' : '期末资产'} value={moneyText(finalValue, currency)} />
        <Metric label={countLabel} value={countValue} />
        {research && <>
          <Metric label="模拟盈亏" value={moneyText(research.simulatedPnl, currency)} tone={marketToneForValue(backtestNumber(research.simulatedPnl))} />
          <Metric label="研究资金余额" value={moneyText(research.fundsBalance, currency)} />
          <Metric label="研究持仓数量" value={formatDecimalNumber(typeof research.positionUnits === 'string' ? research.positionUnits : undefined)} detail="按后复权价格换算的模拟数量" />
        </>}
      </div>
      {research && <p className="text-xs text-muted-foreground">采用冻结的后复权序列计算模型收益，具体价格条件使用不复权行情。</p>}
      {chartModel.limitation && (
        <Alert>
          <AlertTitle>图表覆盖说明</AlertTitle>
          <AlertDescription>{chartModel.limitation}</AlertDescription>
        </Alert>
      )}
      {chartModel.drawdownSource === 'display-derived' && (
        <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          服务端未返回回撤曲线。当前回撤仅由完整权益序列的全历史高点做展示派生，不替换服务端最大回撤指标，缩放也不会重置高点。
        </p>
      )}
      <StrategyBacktestEquityChart
        model={chartModel}
        resetKey={job.id}
        onRangeChange={setVisibleRange}
        instrumentRequest={instrumentRequest}
      />
      <StrategyBacktestEquityExport jobId={job.id} model={chartModel} range={visibleRange} />
      {secondary.length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-3 rounded-lg border bg-muted/10 px-4 py-3">
          {secondary.map(({ label, value, tone }) => (
            <div key={label} className="min-w-28">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={cn('mt-1 font-medium tabular-nums', marketToneClass(tone))}>{value}</p>
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>成交</CardDescription>
            <CardTitle>{hasFills ? `${collections.fills.length} 笔` : '不可用'}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>已平仓交易</CardDescription>
            <CardTitle>{hasTrades ? `${collections.trades.length} 笔` : '不可用'}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>拒绝记录</CardDescription>
            <CardTitle>
              {rejectionAvailable
                ? `${collections.rejectedOrders.length + collections.rejectedNavRequests.length} 笔`
                : '不可用'}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}

function TradesAndOrders({ result }: { result: BacktestJobResult }) {
  const research = Boolean(record(result.priceResearch));
  const { trades, fills, orders, rejectedOrders, rejectedNavRequests } =
    backtestResultCollections(result);
  const tradeRows = trades.map((trade) => [
    displayDateTime(trade.closedAt ?? trade.date ?? trade.occurredAt),
    display(trade.executionSymbol ?? trade.symbol),
    sideDisplay(trade.side ?? trade.closeReason),
    research ? formatDecimalNumber(display(trade.quantity ?? trade.exitQuantity))
      : display(trade.quantity ?? trade.exitQuantity),
  ]);
  const fillRows = fills.map((fill) => [
    displayDateTime(fill.occurredAt ?? fill.date),
    display(fill.executionSymbol ?? fill.symbol),
    sideDisplay(fill.side),
    research ? formatDecimalNumber(display(fill.quantity)) : display(fill.quantity),
    display(record(fill.price)?.amount ?? fill.price),
    ...(research ? [display(fill.actualReferencePrice), display(record(fill.researchSizing)?.referenceQuantity),
      display(record(fill.researchSizing)?.requestedNotional)] : []),
  ]);
  const orderRows = orders.map((order) => [
    displayDateTime(order.occurredAt ?? order.createdAt),
    display(order.executionSymbol ?? order.symbol),
    sideDisplay(order.side),
    display(order.status),
  ]);
  const rejectionRows = [...rejectedOrders, ...rejectedNavRequests].map((item) => [
    displayDateTime(item.occurredAt),
    display(item.executionSymbol),
    sideDisplay(item.side),
    display(item.reasonCode),
    display(item.message),
  ]);
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="font-medium">已平仓交易</h3>
        <CompactTable
          label="已平仓交易"
          headers={['时间', '标的', '方向或原因', research ? '研究单位' : '数量']}
          numericColumns={[3]}
          rows={tradeRows}
          empty="没有已平仓交易"
        />
      </section>
      <section className="space-y-2">
        <h3 className="font-medium">成交</h3>
        <CompactTable
          label="成交"
          headers={research ? ['时间', '标的', '方向', '研究单位', '后复权操作价', '实际参考价', '投入参考份数', '请求投入金额']
            : ['时间', '标的', '方向', '数量', '价格']}
          numericColumns={[3, 4, 5, 6, 7]}
          rows={fillRows}
          empty="没有成交记录"
        />
      </section>
      <section className="space-y-2">
        <h3 className="font-medium">委托</h3>
        <CompactTable
          label="委托"
          headers={['时间', '标的', '方向', '状态']}
          rows={orderRows}
          empty="当前结果契约未提供委托明细"
        />
      </section>
      <section className="space-y-2">
        <h3 className="font-medium">拒单</h3>
        <CompactTable
          label="拒单"
          headers={['时间', '标的', '方向', '代码', '原因']}
          rows={rejectionRows}
          empty="没有拒单记录"
        />
      </section>
    </div>
  );
}

export function StrategyBacktestResultTabs({ job, instrumentRequest }: { job: BacktestJob; instrumentRequest?: BacktestInstrumentChartRequest | undefined }) {
  const result = readableBacktestResult(job);
  if (job.readEligibility?.state === 'restricted') {
    return (
      <Alert>
        <AlertTitle>测试结果尚未揭示</AlertTitle>
        <AlertDescription>
          该任务受封存测试读取门禁保护，当前页面不会展示指标、交易或配置克隆入口。
        </AlertDescription>
      </Alert>
    );
  }
  if (!result) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {job.status === 'failed' || job.status === 'cancelled'
          ? '任务没有可读取的结果产物。'
          : '结果仍在准备中，页面会自动刷新。'}
      </div>
    );
  }
  const unsuccessful = job.status !== 'succeeded';
  const partial = record(result)?.completeness === 'partial';
  return (
    <div className="space-y-4">
      {(unsuccessful || partial) && (
        <Alert>
          <AlertTitle>{unsuccessful ? '未完成结果' : '结果部分可用'}</AlertTitle>
          <AlertDescription>
            {unsuccessful
              ? '任务未成功完成，当前产物仅用于诊断。'
              : backtestPartialResultSummary(result)}
          </AlertDescription>
        </Alert>
      )}
      <Tabs defaultValue="overview">
        <TabsList variant="line" className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">结果概览</TabsTrigger>
          <TabsTrigger value="trades">交易与订单</TabsTrigger>
          <TabsTrigger value="data">数据与假设</TabsTrigger>
          <TabsTrigger value="diagnostics">诊断与复现</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <ResultOverview job={job} result={result} instrumentRequest={instrumentRequest} />
        </TabsContent>
        <TabsContent value="trades">
          <TradesAndOrders key={job.id} result={result} />
        </TabsContent>
        <TabsContent value="data">
          <div className="flex flex-col gap-6">
            <BacktestRunSettings job={job} result={result} />
            <Separator />
            <BacktestRunDisclosure job={job} />
          </div>
        </TabsContent>
        <TabsContent value="diagnostics">
          <StrategyBacktestDiagnostics job={job} result={result} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
