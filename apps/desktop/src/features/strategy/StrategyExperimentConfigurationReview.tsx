import { Badge } from '@/components/ui/badge';

export function StrategyExperimentConfigurationReview({
  label,
  modelCount,
  currency,
  startDate,
  developmentEnd,
  validationStart,
  validationEnd,
  testStart,
  endDate,
  submitIntentId,
}: {
  label: string;
  modelCount: number;
  currency: string;
  startDate: string;
  developmentEnd: string;
  validationStart: string;
  validationEnd: string;
  testStart: string;
  endDate: string;
  submitIntentId: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4 text-sm">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{label}</Badge>
        <Badge variant="outline">{modelCount} 个模型</Badge>
        <Badge variant="outline">{currency}</Badge>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">开发集</dt>
          <dd>
            {startDate} 至 {developmentEnd}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">验证集</dt>
          <dd>
            {validationStart} 至 {validationEnd}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">封存测试</dt>
          <dd>
            {testStart} 至 {endDate}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">提交意图</dt>
          <dd className="truncate font-mono text-xs">{submitIntentId}</dd>
        </div>
      </dl>
    </div>
  );
}
