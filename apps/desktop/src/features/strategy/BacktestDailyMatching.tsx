import { useState } from 'react';
import { dailyBacktestMatchingPolicy, backtestDailyMatchingLines } from '@thesis-ledger/domain';
import { backtestDailyMatchingSchema, type BacktestDailyMatching } from '@thesis-ledger/schemas';
import { Field, FieldDescription, FieldError, FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch, SwitchThumb } from '@/components/ui/switch';

export function useBacktestDailyMatching(required: boolean, initial?: BacktestDailyMatching) {
  const [selected, setSelected] = useState(required || Boolean(initial));
  const [kind, setKind] = useState<BacktestDailyMatching['liquidity']['kind']>(initial?.liquidity.kind ?? 'wholeOrder');
  const [quantity, setQuantity] = useState(initial?.liquidity.kind === 'perBarCap' ? initial.liquidity.quantity : '');
  const enabled = required || selected;
  const liquidity = kind === 'perBarCap' ? { kind, quantity } : { kind };
  const policy = enabled ? dailyBacktestMatchingPolicy(liquidity) : undefined;
  return { required, enabled, setSelected, kind, setKind, quantity, setQuantity, policy, valid: !policy || backtestDailyMatchingSchema.safeParse(policy).success, signature: JSON.stringify({ enabled, kind, quantity }) };
}
export function BacktestDailyMatchingFields({ control, unit, optional = false, disabled = false }: { control: ReturnType<typeof useBacktestDailyMatching>; unit: string; optional?: boolean; disabled?: boolean }) {
  if (!control.enabled && !optional) return null;
  return <FieldGroup>
    {optional && !control.required && <Field className="flex-row items-center">
      <Switch variant="risk" aria-label="允许日线委托计划" checked={control.enabled} disabled={disabled}
        onCheckedChange={control.setSelected}><SwitchThumb variant="risk" /></Switch>
      <span>允许日线委托计划</span>
    </Field>}
    {control.enabled && <>
      <Field className="flex-row items-center">
        <Switch variant="risk" aria-label="成交能力压力测试" checked={control.kind === 'perBarCap'} disabled={disabled}
          onCheckedChange={checked => control.setKind(checked ? 'perBarCap' : 'wholeOrder')}><SwitchThumb variant="risk" /></Switch>
        <span>成交能力压力测试</span>
      </Field>
      {control.kind === 'wholeOrder' && <Field><FieldDescription>整笔成交模拟，建仓成交后保护。</FieldDescription></Field>}
      {control.kind === 'unlimited' && <Field><FieldDescription>沿用原运行设置，不限模拟成交额度。</FieldDescription></Field>}
      {control.kind === 'perBarCap' && <Field invalid={control.quantity !== '' && !control.valid}>
        <span>每根上限（{unit}）</span>
        <Input aria-label={`每根上限（${unit}）`} inputMode="decimal" required disabled={disabled} value={control.quantity} aria-invalid={control.quantity !== '' && !control.valid} onChange={event => control.setQuantity(event.target.value)} />
        <FieldDescription>填写正数。本账户同一标的的全部买卖委托共用，开盘与区间共同计量；额度不足继续等待。</FieldDescription>
        {control.quantity !== '' && !control.valid && <FieldError>请填写大于零的模拟数量。</FieldError>}
      </Field>}
      <Field><FieldDescription>已知开盘先处理，区间同组双触止损优先；保护激活时点和独立有效期按委托配置执行。</FieldDescription></Field>
    </>}
  </FieldGroup>;
}
export function BacktestDailyMatchingDisclosure({ policy, unit }: { policy?: BacktestDailyMatching | undefined; unit: string }) {
  return policy ? <div className="flex flex-col gap-1">{backtestDailyMatchingLines(policy, unit).map(line => <p key={line} className="text-sm text-muted-foreground">{line}</p>)}</div> : null;
}
