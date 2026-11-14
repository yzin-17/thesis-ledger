import { formatDecimalNumber } from '@thesis-ledger/domain';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatDateOnly, formatDateTime } from '@/lib/date-display';
import { backtestBaseCurrency } from './strategy-backtest-detail.model.js';
import type { BacktestJob, BacktestJobResult } from './strategy.types.js';
import { BacktestAssumptionField } from './BacktestAssumptionLayout.js';

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

function cashText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number')
    return formatDecimalNumber(String(value));
  const amounts = record(value);
  if (!amounts) return '未记录';
  if ('amount' in amounts)
    return `${cashText(amounts.amount)} ${typeof amounts.currency === 'string' ? amounts.currency : ''}`.trim();
  return (
    Object.entries(amounts)
      .map(([currency, amount]) => `${cashText(amount)} ${currency}`)
      .join(' · ') || '未记录'
  );
}

function valuationText(value: unknown) {
  const policy = record(value);
  if (policy?.missingPrice === 'fail') return '缺价时停止估值';
  if (policy?.missingPrice === 'carry-forward') return '缺价时沿用上一价格';
  if (policy?.pricePolicy === 'latestAvailable' && policy.fxPolicy === 'latestAvailable') {
    const time =
      typeof policy.dailyValuationTime === 'string' ? policy.dailyValuationTime : '未记录时刻';
    const timezone = typeof policy.baseTimezone === 'string' ? policy.baseTimezone : '未记录时区';
    return `价格与汇率取最近可用值 · 每日 ${time}（${timezone}）`;
  }
  if (value === undefined || value === null) return '未记录';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function BacktestRunSettings({
  job,
  result,
}: {
  job: BacktestJob;
  result: BacktestJobResult;
}) {
  const input = record(job.input);
  const runConfig = record(input?.runConfig);
  const dataAsOf = job.dataAsOf ?? result.dataAsOf;
  return (
    <Card role="region" aria-label="运行配置摘要" className="gap-4 rounded-none border-0 bg-transparent py-0">
      <CardHeader className="px-0">
        <CardTitle role="heading" aria-level={3} className="text-xl">运行配置</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-0">
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
          <BacktestAssumptionField label="请求区间">
            <span className="font-medium tabular-nums">
              {formatDateOnly(job.period?.start ?? job.periodStart, '未记录')} 至{' '}
              {formatDateOnly(job.period?.end ?? job.periodEnd, '未记录')}
            </span>
          </BacktestAssumptionField>
          <BacktestAssumptionField label="初始资金">
            <span className="font-medium tabular-nums">
              {cashText(runConfig?.initialCash ?? input?.initialCash ?? job.initialCash)}
            </span>
          </BacktestAssumptionField>
          <BacktestAssumptionField label="基准币种">
            {backtestBaseCurrency(job, result) ?? '未记录'}
          </BacktestAssumptionField>
          <BacktestAssumptionField label="数据冻结时点">
            {typeof dataAsOf === 'string' ? formatDateTime(dataAsOf, '未记录') : '未记录'}
          </BacktestAssumptionField>
        </dl>
        <Separator />
        <div className="flex flex-wrap justify-between gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <p>估值策略：{valuationText(runConfig?.valuationPolicy)}</p>
          <p>任务完成：{job.finishedAt ? formatDateTime(job.finishedAt, '未记录') : '未完成'}</p>
        </div>
      </CardContent>
    </Card>
  );
}
