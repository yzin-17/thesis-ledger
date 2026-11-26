import { Switch, View } from 'react-native';
import { backtestDailyMatchingLines } from '@thesis-ledger/domain';
import type { BacktestDailyMatching } from '@thesis-ledger/schemas';
import { Copy, Field } from '../../components/MobilePrimitives';
import { useMobileRuntime } from '../../app/MobileRuntime';
import type { BacktestForm } from './backtest-intent';

export function BacktestDailyMatchingFields({ value, onChange, required = false, optional = false, disabled }: { value: BacktestForm; onChange: (value: BacktestForm) => void; required?: boolean; optional?: boolean; disabled: boolean }) {
  const { theme } = useMobileRuntime();
  const enabled = required || Boolean(value.dailyOrders), kind = value.dailyLiquidity ?? 'wholeOrder';
  const patch = (part: Partial<BacktestForm>) => onChange({ ...value, dailyOrders: enabled, ...part });
  if (!enabled && !optional) return null;
  return <>
    {optional && !required && <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><Copy>允许日线委托计划</Copy><Switch accessibilityLabel="允许日线委托计划" value={enabled} disabled={disabled} trackColor={{ true: theme.brand }} onValueChange={dailyOrders => patch({ dailyOrders })} /></View>}
    {enabled && <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Copy>成交能力压力测试</Copy>
        <Switch accessibilityLabel="成交能力压力测试" value={kind === 'perBarCap'} disabled={disabled}
          trackColor={{ true: theme.brand }} onValueChange={active => patch({ dailyLiquidity: active ? 'perBarCap' : 'wholeOrder' })} />
      </View>
      {kind === 'wholeOrder' && <Copy muted>整笔成交模拟，建仓成交后保护。</Copy>}
      {kind === 'unlimited' && <Copy muted>沿用原运行设置，不限模拟成交额度。</Copy>}
      {kind === 'perBarCap' && <Field label="每根上限（研究单位）" value={value.dailyQuantity ?? ''} editable={!disabled} keyboardType="decimal-pad" onChange={dailyQuantity => patch({ dailyQuantity })} />}
      {kind === 'perBarCap' && <Copy muted>填写正数。本账户同一标的的开盘、区间及全部买卖委托共用，按本次冻结的研究单位计量。</Copy>}
      <Copy muted>区间内同组双触止损优先；开盘父成交可同根保护，区间父成交从下一根开盘保护。</Copy>
    </>}
  </>;
}
export function BacktestDailyMatchingDisclosure({ policy, unit = '研究单位' }: { policy?: BacktestDailyMatching | undefined; unit?: string }) {
  return policy ? <>{backtestDailyMatchingLines(policy, unit).map(line => <Copy key={line}>{line}</Copy>)}</> : null;
}
