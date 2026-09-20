import { useEffect, useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDateTime } from '@/lib/date-display';
import { Metric } from '../shared/DesktopPrimitives.js';
import {
  backtestBaseCurrency,
  backtestMetricNumber,
  backtestMetricReason,
  backtestNumber,
  backtestResultCollections,
  readableBacktestResult,
} from './strategy-backtest-detail.model.js';
import type { BacktestJob, BacktestJobResult } from './strategy.types.js';
import { buildBacktestChartModel } from './strategy-backtest-chart.model.js';
import { StrategyBacktestEquityChart } from './StrategyBacktestEquityChart.js';
import { StrategyBacktestEquityDetails } from './StrategyBacktestEquityDetails.js';
import { StrategyBacktestDiagnostics } from './StrategyBacktestDiagnostics.js';

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

const metricText = (
  metrics: Record<string, unknown> | null,
  keys: string[],
  kind: 'percent' | 'ratio' = 'percent',
  magnitude = false,
) => {
  const key = keys.find((candidate) => metrics?.[candidate] !== undefined);
  if (!key) return '不可用';
  const raw = metrics?.[key];
  const value = backtestMetricNumber(raw);
  if (value === null) {
    const reason = backtestMetricReason(raw);
    return reason ? `不可用：${reason}` : '不可用';
  }
  const displayed = magnitude ? Math.abs(value) : value;
  return kind === 'percent' ? `${(displayed * 100).toFixed(2)}%` : displayed.toFixed(2);
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
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: string[][];
  empty: string;
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b bg-muted/30 text-left">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-3 py-2 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="px-3 py-6 text-center text-muted-foreground" colSpan={headers.length}>
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={`${row[0] ?? 'row'}-${index}`} className="border-b last:border-0">
                {row.map((cell, cellIndex) => (
                  <td key={`${cellIndex}-${cell}`} className="px-3 py-2">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function ResultOverview({ job, result }: { job: BacktestJob; result: BacktestJobResult }) {
  const [visibleRange, setVisibleRange] = useState<{ from: number; to: number } | null>(null);
  useEffect(() => setVisibleRange(null), [job.id]);
  const metrics = record(result.metrics);
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
  const chartModel = useMemo(() => buildBacktestChartModel(job, result), [job, result]);
  const secondary = [
    ['年化收益', metricText(metrics, ['cagr', 'annualizedReturn'])],
    ['波动率', metricText(metrics, ['volatility'])],
    ['夏普比率', metricText(metrics, ['sharpe'], 'ratio')],
    ['胜率', metricText(metrics, ['tradeWinRate', 'winRate'])],
    ['利润因子', metricText(metrics, ['profitFactor'], 'ratio')],
  ].filter(([, value]) => value !== '不可用');
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="累计收益" value={metricText(metrics, ['cumulativeReturn', 'totalReturn'])} />
        <Metric
          label="最大回撤"
          value={metricText(metrics, ['maxDrawdown'], 'percent', true)}
          tone="down"
        />
        <Metric label="期末资产" value={moneyText(finalValue, currency)} />
        <Metric label={countLabel} value={countValue} />
      </div>
      {chartModel.limitation && (
        <Alert>
          <AlertTitle>图表数据范围受限</AlertTitle>
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
      />
      <StrategyBacktestEquityDetails jobId={job.id} model={chartModel} range={visibleRange} />
      {secondary.length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-3 rounded-lg border bg-muted/10 px-4 py-3">
          {secondary.map(([label, value]) => (
            <div key={label} className="min-w-28">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 font-medium tabular-nums">{value}</p>
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
  const { trades, fills, orders, rejectedOrders, rejectedNavRequests } =
    backtestResultCollections(result);
  const tradeRows = trades.map((trade) => [
    display(trade.closedAt ?? trade.date ?? trade.occurredAt),
    display(trade.executionSymbol ?? trade.symbol),
    display(trade.side ?? trade.closeReason),
    display(trade.quantity ?? trade.exitQuantity),
  ]);
  const fillRows = fills.map((fill) => [
    display(fill.occurredAt ?? fill.date),
    display(fill.executionSymbol ?? fill.symbol),
    display(fill.side),
    display(fill.quantity),
    display(record(fill.price)?.amount ?? fill.price),
  ]);
  const orderRows = orders.map((order) => [
    display(order.occurredAt ?? order.createdAt),
    display(order.executionSymbol ?? order.symbol),
    display(order.side),
    display(order.status),
  ]);
  const rejectionRows = [...rejectedOrders, ...rejectedNavRequests].map((item) => [
    display(item.occurredAt),
    display(item.executionSymbol),
    display(item.side),
    display(item.reasonCode),
    display(item.message),
  ]);
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="font-medium">已平仓交易</h3>
        <CompactTable
          headers={['时间', '标的', '方向或原因', '数量']}
          rows={tradeRows}
          empty="没有已平仓交易"
        />
      </section>
      <section className="space-y-2">
        <h3 className="font-medium">成交</h3>
        <CompactTable
          headers={['时间', '标的', '方向', '数量', '价格']}
          rows={fillRows}
          empty="没有成交记录"
        />
      </section>
      <section className="space-y-2">
        <h3 className="font-medium">委托</h3>
        <CompactTable
          headers={['时间', '标的', '方向', '状态']}
          rows={orderRows}
          empty="当前结果契约未提供委托明细"
        />
      </section>
      <section className="space-y-2">
        <h3 className="font-medium">拒单</h3>
        <CompactTable
          headers={['时间', '标的', '方向', '代码', '原因']}
          rows={rejectionRows}
          empty="没有拒单记录"
        />
      </section>
    </div>
  );
}

function DataAndAssumptions({ job, result }: { job: BacktestJob; result: BacktestJobResult }) {
  const input = record(job.input);
  const runConfig = record(input?.runConfig);
  const fields = [
    [
      '请求区间',
      `${job.period?.start ?? job.periodStart ?? '未记录'} 至 ${job.period?.end ?? job.periodEnd ?? '未记录'}`,
    ],
    ['数据冻结时点', display(job.dataAsOf ?? result.dataAsOf)],
    ['基准币种', backtestBaseCurrency(job, result) ?? '未记录'],
    ['初始资金', display(runConfig?.initialCash ?? input?.initialCash)],
    ['估值策略', display(runConfig?.valuationPolicy)],
    ['执行模型', display(runConfig?.executionModel ?? job.executionModelDisclosure)],
    ['数据完整性', display(result.completeness)],
    ['任务完成时间', job.finishedAt ? formatDateTime(job.finishedAt) : '未完成'],
  ];
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {fields.map(([label, value]) => (
        <Card key={label}>
          <CardHeader>
            <CardDescription>{label}</CardDescription>
            <CardTitle className="break-words text-base">{value}</CardTitle>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

export function StrategyBacktestResultTabs({ job }: { job: BacktestJob }) {
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
  const incomplete = job.status !== 'succeeded' || record(result)?.completeness === 'partial';
  return (
    <div className="space-y-4">
      {incomplete && (
        <Alert>
          <AlertTitle>未完成结果</AlertTitle>
          <AlertDescription>
            当前产物来自未成功收敛或部分完整的任务，仅用于诊断，不能视为完整回测结果。
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
        <TabsContent value="overview" className="pt-4">
          <ResultOverview job={job} result={result} />
        </TabsContent>
        <TabsContent value="trades" className="pt-4">
          <TradesAndOrders result={result} />
        </TabsContent>
        <TabsContent value="data" className="pt-4">
          <DataAndAssumptions job={job} result={result} />
        </TabsContent>
        <TabsContent value="diagnostics" className="pt-4">
          <StrategyBacktestDiagnostics job={job} result={result} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
