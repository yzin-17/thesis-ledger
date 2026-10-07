import type { BacktestNavResultV3 } from '@thesis-ledger/schemas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateOnly, formatDateTime } from '@/lib/date-display';

const metricLabels: Record<string, string> = {
  cumulativeReturn: '累计收益',
  totalReturn: '累计收益',
  cagr: '年化收益',
  annualizedReturn: '年化收益',
  maxDrawdown: '最大回撤',
  volatility: '波动率',
  sharpe: '夏普比率',
  tradeWinRate: '交易胜率',
  winRate: '胜率',
  profitFactor: '利润因子',
  turnover: '换手率',
  tradeCount: '已平仓交易数',
  basicPeriodReturn: '区间收益',
};

const percentageMetrics = new Set([
  'cumulativeReturn',
  'totalReturn',
  'cagr',
  'annualizedReturn',
  'maxDrawdown',
  'volatility',
  'tradeWinRate',
  'winRate',
  'turnover',
  'basicPeriodReturn',
]);

export function NavBacktestResult({ result }: { result: BacktestNavResultV3 }) {
  const pendingCount = result.pendingRequestIds.length;
  const hasIncompleteWork =
    result.completeness !== 'complete' || pendingCount > 0 || result.diagnostics.length > 0;
  const sourceName =
    result.navSource.target.upstreamSource === 'eastmoney' ? '东方财富基金净值' : '已登记来源';

  return (
    <div className="flex flex-col gap-4">
      {hasIncompleteWork ? (
        <Alert>
          <AlertTitle>结果包含未完成或部分数据</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <p>
              当前完整度：{completenessLabel(result.completeness)}；未完成申赎申请：{pendingCount}{' '}
              笔。 未结算资金和份额会分别保留，不会补成已确认状态。
            </p>
            {result.pendingRequestIds.length > 0 ? (
              <p>请在下方申购与赎回记录中查看各项确认和结算状态。</p>
            ) : null}
            {result.diagnostics.map((diagnostic) => (
              <p key={`${diagnostic.eventId}:${diagnostic.code}`}>{diagnostic.reason}</p>
            ))}
          </AlertDescription>
        </Alert>
      ) : null}

      <Alert>
        <AlertTitle>研究假设可见性，不是严格历史时点</AlertTitle>
        <AlertDescription className="flex flex-col gap-2">
          <p>
            本结果使用研究假设作为净值可见时间依据，不能解读为严格历史时点回测或渠道真实交易承诺。
          </p>
          <p>日期交集不能证明历史暂停、限购或投资者渠道差异；本次未模拟这些限制。</p>
          {result.visibilityDisclosure.assumptions.map((assumption) => (
            <p key={assumption}>{assumption}</p>
          ))}
          {result.navVisibility.mode === 'research-assumption' ? (
            <p>
              {fundTypeLabel(result.navVisibility.rule.fundType)}规则：延后{' '}
              {result.navVisibility.rule.delayWorkdays} 个工作日；适用区间{' '}
              {result.navVisibility.rule.applicableRange.startDate} 至{' '}
              {result.navVisibility.rule.applicableRange.endDate}；规则证据：
              {result.navVisibility.rule.evidenceRef}
            </p>
          ) : null}
        </AlertDescription>
      </Alert>

      {result.warnings.length > 0 ? (
        <Alert>
          <AlertTitle>运行提示</AlertTitle>
          <AlertDescription className="flex flex-col gap-1">
            {result.warnings.map((warning, index) => (
              <p key={`${index}:${warning}`}>{warning}</p>
            ))}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>现金</CardTitle>
            <CardDescription>已结算与未结算金额分别显示</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Value label="已结算" value={`${result.cash.settled} ${result.cash.currency}`} />
              <Value label="未结算" value={`${result.cash.unsettled} ${result.cash.currency}`} />
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>基金份额</CardTitle>
            <CardDescription>确认份额与待确认份额分开记录</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Value label="总份额" value={`${result.position.quantity} 份`} />
              <Value label="已结算份额" value={`${result.position.settledQuantity} 份`} />
              <Value label="未结算份额" value={`${result.position.unsettledQuantity} 份`} />
              <Value
                label="平均成本"
                value={`${result.position.averageCost} ${result.cash.currency}`}
              />
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>数据来源与计算范围</CardTitle>
          <CardDescription>
            {result.executionSymbol} · {result.dateRange.startDate} 至 {result.dateRange.endDate}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Value label="净值来源" value={sourceName} />
            <Value label="来源采集时间" value={formatDateTime(result.navSource.capturedAt)} />
            <Value label="数据截止时间" value={formatDateTime(result.dataAsOf)} />
          </dl>
        </CardContent>
      </Card>

      <ExecutionModelResult result={result} />

      <div className="grid gap-4 xl:grid-cols-2">
        <MetricCard title="策略权益指标" metrics={result.metrics} />
        <MetricCard title="NAV 基准指标" metrics={result.benchmark} />
      </div>

      <EquityCurveCard result={result} />
      <RequestTable result={result} />
    </div>
  );
}

function Value({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function MetricCard({
  title,
  metrics,
}: {
  title: string;
  metrics: BacktestNavResultV3['metrics'];
}) {
  const entries = Object.entries(metrics);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>根据本次回测结果计算</CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length > 0 ? (
          <dl className="grid gap-3 sm:grid-cols-2">
            {entries.map(([key, metric], index) => (
              <Value
                key={key}
                label={metricLabels[key] ?? `其他指标 ${index + 1}`}
                value={metricValue(key, metric)}
              />
            ))}
          </dl>
        ) : (
          <Empty className="border-0 p-4">
            <EmptyHeader>
              <EmptyTitle>暂无可用指标</EmptyTitle>
              <EmptyDescription>本次结果没有提供这一组指标。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}

function EquityCurveCard({ result }: { result: BacktestNavResultV3 }) {
  const points = sampledPoints(result.equityCurve, 24);
  return (
    <Card>
      <CardHeader>
        <CardTitle>账户权益曲线</CardTitle>
        <CardDescription>
          共 {result.equityCurve.length} 个权益时点，表格等距展示 {points.length} 个节点。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>估值日期</TableHead>
              <TableHead>权益</TableHead>
              <TableHead>可见时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {points.map((point) => (
              <TableRow key={point.occurredAt}>
                <TableCell>{formatDateOnly(point.occurredAt)}</TableCell>
                <TableCell>{`${point.value.amount} ${point.value.currency}`}</TableCell>
                <TableCell>{formatDateTime(point.availableAt, '未单独提供')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function RequestTable({ result }: { result: BacktestNavResultV3 }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>申购与赎回确认</CardTitle>
        <CardDescription>
          申请金额、净值、费用、确认份额和结算时点按本次运行结果逐笔展示。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {result.requests.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>申请</TableHead>
                <TableHead>申请时间</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>净值</TableHead>
                <TableHead>申请金额/份额</TableHead>
                <TableHead>确认份额</TableHead>
                <TableHead>费用</TableHead>
                <TableHead>确认与可用时间</TableHead>
                <TableHead>说明</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.requests.map((request) => (
                <TableRow key={request.requestId}>
                  <TableCell>{requestTypeLabel(request.requestType)}</TableCell>
                  <TableCell>{formatDateTime(request.requestAt)}</TableCell>
                  <TableCell>
                    <Badge variant={request.status === 'rejected' ? 'destructive' : 'secondary'}>
                      {requestStatusLabel(request.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {request.nav ? `${request.nav} 元` : '待定价'}
                    {request.valuationDate ? (
                      <p className="text-xs text-muted-foreground">{request.valuationDate}</p>
                    ) : null}
                  </TableCell>
                  <TableCell>{requestedValue(request)}</TableCell>
                  <TableCell>
                    {request.confirmedShares ? `${request.confirmedShares} 份` : '未确认'}
                  </TableCell>
                  <TableCell>{`${request.fee} CNY`}</TableCell>
                  <TableCell>{settlementTimes(request)}</TableCell>
                  <TableCell className="max-w-72 whitespace-normal">
                    {request.reason ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty className="border-0 p-4">
            <EmptyHeader>
              <EmptyTitle>没有申购或赎回申请</EmptyTitle>
              <EmptyDescription>本次结果没有生成净值申赎记录。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}

function ExecutionModelResult({ result }: { result: BacktestNavResultV3 }) {
  const disclosure = result.executionModelDisclosure;
  return (
    <Card>
      <CardHeader>
        <CardTitle>费用与确认结算模型</CardTitle>
        <CardDescription>费用和确认结算时序按本次确认的研究模型计算。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {disclosure.model.segments.map((segment) => {
          if (segment.execution.mode !== 'nav') return null;
          return (
            <section key={segment.id} className="rounded-md border p-3">
              <p className="font-medium">
                {segment.range.start} 至 {segment.range.end}
              </p>
              <p className="mt-2 text-sm">
                申购费：{navFeeResultText(segment.execution.subscriptionFee)}；赎回费：
                {navFeeResultText(segment.execution.redemptionFee)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {segment.execution.cutoffLocalTime} 截止；确认延迟{' '}
                {segment.execution.confirmationAfterTradingDays} 个交易日；份额可用延迟{' '}
                {segment.execution.sellableAfterConfirmationTradingDays}{' '}
                个交易日；赎回资金可再投资延迟{' '}
                {segment.execution.redemptionReinvestableAfterConfirmationTradingDays} 个交易日。
              </p>
              {segment.assumptions.length > 0 ? (
                <p className="mt-1 text-sm">研究假设：{segment.assumptions.join('；')}</p>
              ) : null}
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}

function metricValue(key: string, metric: BacktestNavResultV3['metrics'][string]) {
  if (metric.status !== 'available' || metric.value === undefined) {
    let state = '不可用';
    if (metric.status === 'warning') state = '有提示';
    return `${state}：${metric.reason ?? '本次结果没有提供原因'}`;
  }
  if (!percentageMetrics.has(key)) return metric.value;
  const value = Number(metric.value);
  if (!Number.isFinite(value)) return metric.value;
  return `${(value * 100).toFixed(2)}%`;
}

function sampledPoints<T>(values: T[], limit: number) {
  if (values.length <= limit) return values;
  const points: T[] = [];
  for (let index = 0; index < limit; index += 1) {
    const sourceIndex = Math.round((index * (values.length - 1)) / (limit - 1));
    const point = values[sourceIndex];
    if (point !== undefined) points.push(point);
  }
  return points;
}

function requestedValue(request: BacktestNavResultV3['requests'][number]) {
  if (request.requestedAmount !== undefined) return `${request.requestedAmount} CNY`;
  if (request.requestedShares !== undefined) return `${request.requestedShares} 份`;
  return '—';
}

function settlementTimes(request: BacktestNavResultV3['requests'][number]) {
  const values: string[] = [];
  if (request.confirmationAt) values.push(`确认 ${formatDateTime(request.confirmationAt)}`);
  if (request.shareAvailableAt) values.push(`份额可用 ${formatDateTime(request.shareAvailableAt)}`);
  if (request.redemptionCashAt)
    values.push(`赎回资金可用 ${formatDateTime(request.redemptionCashAt)}`);
  if (request.expectedCashSettlement) values.push(`预计金额 ${request.expectedCashSettlement} CNY`);
  return values.length > 0 ? values.join('；') : '等待确认或结算';
}

function navFeeResultText(
  fee:
    | {
        treatment: 'charged';
        rate: string;
        minimum: { kind: 'none' } | { kind: 'amount'; amount: string };
      }
    | { treatment: 'notApplicable'; reason: string },
) {
  if (fee.treatment === 'notApplicable') return `不适用（${fee.reason}）`;
  let minimum = '无最低费用';
  if (fee.minimum.kind === 'amount') minimum = `最低 ${fee.minimum.amount} CNY`;
  return `${feeRateLabel(fee.rate)}，${minimum}`;
}

function feeRateLabel(rate: string) {
  const value = Number(rate);
  if (!Number.isFinite(value)) return rate;
  return `${(value * 100).toLocaleString('zh-CN', { maximumFractionDigits: 6 })}%`;
}

function requestTypeLabel(value: BacktestNavResultV3['requests'][number]['requestType']) {
  if (value === 'subscribe') return '申购';
  return '赎回';
}

function requestStatusLabel(value: BacktestNavResultV3['requests'][number]['status']) {
  if (value === 'pending') return '待处理';
  if (value === 'priced') return '已定价';
  if (value === 'confirmed') return '已确认';
  if (value === 'shareAvailable') return '份额可用';
  if (value === 'settled') return '已结算';
  if (value === 'cancelled') return '已取消';
  return '已拒绝';
}

function completenessLabel(value: BacktestNavResultV3['completeness']) {
  if (value === 'complete') return '完整';
  if (value === 'partial') return '部分完成';
  return '不可用';
}

function fundTypeLabel(value: 'domestic' | 'qdii') {
  if (value === 'domestic') return '国内基金 T+1 研究假设';
  return 'QDII 已核验规则';
}
