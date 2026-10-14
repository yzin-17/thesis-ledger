import { useState } from 'react';
import type { BacktestExecutionModelV3 } from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { applyBrokerCommission, defaultBrokerCommission, type BrokerCommission } from './backtest-broker-commission.model.js';

export function BacktestBrokerCommissionEditor({ model, onChange, onDraftChange }: {
  model: BacktestExecutionModelV3; onChange: (text: string) => void; onDraftChange: () => void;
}) {
  const market = model.scope.market;
  const normalized = model.segments.some((segment) => segment.execution.mode === 'exchange' && segment.execution.normalizedExecution);
  const saved = model.segments[0]?.fees?.brokerCommission;
  const [profile, setProfile] = useState<BrokerCommission>(() => saved ?? defaultBrokerCommission(market === 'HK' ? 'HK' : 'US', normalized));
  const [error, setError] = useState<string | null>(null);
  if (!['HK', 'US'].includes(market) || model.scope.instrumentType === 'NAV_FUND') return null;
  const edit = (next: BrokerCommission) => { setProfile({ ...next, userModified: true }); setError(null); onDraftChange(); };
  const numeric = (label: string, value: string, onChangeValue: (value: string) => void) => (
    <Field key={label}>
      <FieldLabel>{label}</FieldLabel>
      <Input aria-label={label} inputMode="decimal" value={value} onChange={(event) => onChangeValue(event.target.value)} />
    </Field>
  );
  return <FieldGroup>
    <FieldDescription>
      默认参考：富途香港 · 标准佣金及固定式平台费 · 核对日期 {profile.checkedDate}。
      免佣优惠可将佣金及其最低额改为0；公共收费另算。一单一次成交，当前套餐作为研究假设。
      <a href={profile.sourceUrl} target="_blank" rel="noreferrer">查看官方收费表</a>
    </FieldDescription>
    {numeric(market === 'HK' ? '佣金比例（小数，0.0003为0.03%）' : '佣金（美元/股）', profile.commission.rate,
      (rate) => edit({ ...profile, commission: { ...profile.commission, rate } }))}
    {numeric(`最低佣金（${model.scope.currency}）`, profile.commission.minimumAmount,
      (minimumAmount) => edit({ ...profile, commission: { ...profile.commission, minimumAmount } }))}
    {numeric('佣金上限比例（小数，留空为无上限）', profile.commission.maximumTurnoverRatio ?? '',
      (value) => edit({ ...profile, commission: { ...profile.commission, maximumTurnoverRatio: value || null } }))}
    {profile.platformFee.kind === 'fixed' && numeric('每单平台费（港元）', profile.platformFee.amount,
      (amount) => edit({ ...profile, platformFee: { kind: 'fixed', amount } }))}
    {profile.platformFee.kind === 'perShare' && <>
      {numeric('平台费（美元/股）', profile.platformFee.rate,
        (rate) => { if (profile.platformFee.kind === 'perShare') edit({ ...profile, platformFee: { ...profile.platformFee, rate } }); })}
      {numeric('最低平台费（美元）', profile.platformFee.minimumAmount,
        (minimumAmount) => { if (profile.platformFee.kind === 'perShare') edit({ ...profile, platformFee: { ...profile.platformFee, minimumAmount } }); })}
      {numeric('平台费上限比例（小数，留空为无上限）', profile.platformFee.maximumTurnoverRatio ?? '',
        (value) => { if (profile.platformFee.kind === 'perShare') edit({ ...profile, platformFee: { ...profile.platformFee, maximumTurnoverRatio: value || null } }); })}
    </>}
    {profile.basis.kind === 'referencePrice' && <>
      {numeric('成本换算参考股价（美元，研究假设）', profile.basis.price,
        (price) => edit({ ...profile, basis: { kind: 'referencePrice', price } }))}
      <FieldDescription>参考股数＝模拟成交额÷参考股价。初始20美元为可调整场景，未核实真实股数；不会改变持仓数量或行情。</FieldDescription>
    </>}
    {error && <FieldError>{error}</FieldError>}
    <Button type="button" variant="outline" onClick={() => {
      try { onChange(JSON.stringify(applyBrokerCommission(model, profile), null, 2)); setError(null); }
      catch (cause) { setError(cause instanceof Error ? cause.message : '券商成本配置无效'); }
    }}>应用券商成本并重新确认</Button>
  </FieldGroup>;
}
