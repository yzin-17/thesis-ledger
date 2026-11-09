import {
  backtestPreparationFailureInputSchema,
  backtestRunPreparationResultV3Schema,
} from '@thesis-ledger/schemas';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { BacktestPreflightDiagnostics } from './BacktestPreflightDiagnostics.js';
import type { BacktestJob } from './strategy.types.js';

export function BacktestPreparationFailureDetails({ job }: { job: BacktestJob }) {
  const input = backtestPreparationFailureInputSchema.parse(job.input);
  const request = input.preparation;
  const result = backtestRunPreparationResultV3Schema.safeParse(job.diagnostics);
  return <div className="flex flex-col gap-4">
    {result.success && result.data.status === 'blocked'
      ? <BacktestPreflightDiagnostics title="准备与预检失败" diagnostics={result.data.diagnostics} />
      : <Alert variant="destructive"><AlertTitle>准备与预检失败</AlertTitle>
          <AlertDescription>{job.errorSummary ?? '回测准备未完成，请重新创建。'}</AlertDescription></Alert>}
    <p className="text-sm">初始资金：{request.runConfig.initialCash[request.runConfig.baseCurrency]} {request.runConfig.baseCurrency}</p>
    <p className="text-sm text-muted-foreground">行情准备与预检未完成，尚未执行回测。请通过“查看来源”返回策略，调整配置后重新创建回测。</p>
  </div>;
}
