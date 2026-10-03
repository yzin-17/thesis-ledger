import type { BacktestExecutionModelV3 } from '@thesis-ledger/schemas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { parseBacktestModelConfiguration } from './BacktestModelConfiguration.js';

type NavModelSegment = Extract<
  BacktestExecutionModelV3['segments'][number],
  { execution: { mode: 'nav' } }
>;
type NavModelFee =
  | NavModelSegment['execution']['subscriptionFee']
  | NavModelSegment['execution']['redemptionFee'];

export function NavBacktestModel({
  text,
  symbol,
  startDate,
  endDate,
  confirmed,
  onChange,
  onConfirm,
}: {
  text: string;
  symbol: string;
  startDate: string;
  endDate: string;
  confirmed: boolean;
  onChange: (text: string) => void;
  onConfirm: (model: BacktestExecutionModelV3) => void;
}) {
  const parsed = parseBacktestModelConfiguration(text, 3);
  const model = parsed.model;
  const compatibilityError = model
    ? navModelCompatibilityError(model, symbol, startDate, endDate)
    : null;
  const error = parsed.error ?? compatibilityError;
  const segments = model?.segments.filter(
    (segment): segment is NavModelSegment => segment.execution.mode === 'nav',
  );

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <AlertTitle>基金净值执行模型需要明确配置</AlertTitle>
        <AlertDescription>
          <p>
            请明确填写申购费、赎回费、申请截止时点、确认延迟、份额可用日和赎回资金可用日。这里不会自动套用基金渠道默认费率；这些值表示你确认的研究参数，不代表渠道实际费率或结算承诺。
          </p>
        </AlertDescription>
      </Alert>
      <Field invalid={Boolean(error)}>
        <FieldLabel>基金净值执行模型配置（JSON）</FieldLabel>
        <Textarea
          aria-label="基金净值执行模型配置"
          aria-invalid={Boolean(error)}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-56 font-mono text-xs"
        />
        <FieldDescription>
          按配置格式为适用区间的每个净值分段声明费用来源与简化假设。费用必须由你明确配置；将费率设为不适用时，也需要写明原因。
        </FieldDescription>
        {error ? <FieldError>{error}</FieldError> : null}
      </Field>
      {model && !error ? (
        <Card>
          <CardHeader>
            <CardTitle>费用与确认结算预览</CardTitle>
            <CardDescription>
              {model.scope.symbol} · {model.scope.range.start} 至 {model.scope.range.end}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {segments?.map((segment) => (
              <NavModelSegmentCard key={segment.id} segment={segment} />
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={confirmed}
              onClick={() => onConfirm(model)}
            >
              {confirmed ? '已确认费用与确认结算模型' : '确认费用与确认结算模型'}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function NavModelSegmentCard({ segment }: { segment: NavModelSegment }) {
  const { execution } = segment;
  return (
    <section className="flex flex-col gap-2 rounded-md border p-3">
      <h4 className="text-sm font-medium">
        {segment.range.start} 至 {segment.range.end}
      </h4>
      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">申购费</dt>
          <dd>{navFeeDescription(execution.subscriptionFee)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">赎回费</dt>
          <dd>{navFeeDescription(execution.redemptionFee)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">申请与净值日期</dt>
          <dd>
            {execution.cutoffLocalTime} 截止；截止后使用下一交易日净值；净值按申赎申请所属交易日计
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">资金与份额时序</dt>
          <dd>
            申请接受时冻结资金；确认延迟 {execution.confirmationAfterTradingDays} 个交易日；
            份额确认后 {execution.sellableAfterConfirmationTradingDays} 个交易日可用；赎回资金确认后{' '}
            {execution.redemptionReinvestableAfterConfirmationTradingDays} 个交易日可再投资
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">执行假设</dt>
          <dd>{segment.assumptions.length > 0 ? segment.assumptions.join('；') : '未声明'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">模型来源</dt>
          <dd>
            {segment.source.description} · {segment.source.revision}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function navFeeDescription(fee: NavModelFee) {
  if (fee.treatment === 'notApplicable') return `不适用：${fee.reason}`;
  let minimum = '无最低费用';
  if (fee.minimum.kind === 'amount') minimum = `最低 ${fee.minimum.amount} 元`;
  return `费率 ${feeRateLabel(fee.rate)}，${minimum}；按申请确认时收取`;
}

function feeRateLabel(rate: string) {
  const value = Number(rate);
  if (!Number.isFinite(value)) return rate;
  return `${(value * 100).toLocaleString('zh-CN', { maximumFractionDigits: 6 })}%`;
}

function navModelCompatibilityError(
  model: BacktestExecutionModelV3,
  symbol: string,
  startDate: string,
  endDate: string,
) {
  if (model.scope.symbol !== symbol || model.scope.market !== 'CN')
    return '模型标的必须与当前 CN 基金策略版本一致。';
  if (model.scope.instrumentType !== 'NAV_FUND' || model.scope.currency !== 'CNY')
    return '模型必须声明为 CNY 基金净值执行模型。';
  if (!startDate || !endDate) return '请先填写回测起止日期，再确认模型适用范围。';
  if (model.scope.range.start > startDate || model.scope.range.end < endDate)
    return '模型适用区间必须覆盖本次回测日期。';
  if (model.segments.some((segment) => segment.execution.mode !== 'nav'))
    return '所有模型分段都必须使用基金净值申赎规则。';
  return null;
}
