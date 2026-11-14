import { backtestRunPreparationResultV3Schema, type StrategySubmissionReceipt } from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import { Field, FieldError } from '@/components/ui/field';
import { requestFailureMessage } from '../../shared/api/request-error.js';
import { BacktestPreflightDiagnostics } from './BacktestPreflightDiagnostics.js';
import { BacktestLifecyclePreparationDisclosure } from './BacktestLifecyclePreparationDisclosure.js';

export function BacktestSubmissionFeedback({ receipt, error, onRetry, onConfirm, confirming }: {
  receipt: StrategySubmissionReceipt | undefined;
  error: Error | null;
  onRetry: () => void;
  onConfirm: () => void;
  confirming: boolean;
}) {
  const parsed = backtestRunPreparationResultV3Schema.safeParse(receipt?.prepared);
  const prepared = parsed.success ? parsed.data : null;
  return <>
    {error && <div role="alert" className="grid gap-2">
      <Field invalid><FieldError>{requestFailureMessage(error)}</FieldError></Field>
      {receipt && <Button type="button" variant="outline" onClick={onRetry}>重新读取提交状态</Button>}
    </div>}
    {receipt?.state === 'blocked' && <div role="alert">
      <Field invalid><FieldError>{receipt.outcome?.reason ?? '回测提交未完成，请检查配置后重试。'}</FieldError></Field>
      {prepared?.status === 'blocked' && <BacktestPreflightDiagnostics diagnostics={prepared.diagnostics} />}
    </div>}
    {receipt?.state === 'awaiting_confirmation' && prepared?.status === 'prepared' && <div className="grid gap-3 rounded-md border p-3">
      <p className="text-sm font-medium">请核对本次回测输入</p>
      <p className="text-sm">{prepared.runConfig.startDate} 至 {prepared.runConfig.endDate} · {prepared.actualSource.provenance.providerId} / {prepared.actualSource.provenance.upstreamSource}</p>
      <p className="text-xs text-muted-foreground">冻结时间：{new Date(prepared.runConfig.dataAsOf).toLocaleString('zh-CN')}</p>
      {prepared.runConfig.knownCashPreparation && <p className="text-sm">分红记录 {prepared.runConfig.knownCashPreparation.input.records.length} 条，覆盖未知；仅按已知登记资格和计划发放日模拟税前现金。</p>}
      <BacktestLifecyclePreparationDisclosure config={prepared.runConfig} />
      <Button type="button" variant="outline" disabled={confirming} onClick={onConfirm}>确认本次冻结输入并创建</Button>
    </div>}
  </>;
}
