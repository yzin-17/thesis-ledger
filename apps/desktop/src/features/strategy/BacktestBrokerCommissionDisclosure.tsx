import type { BacktestExecutionModelV3 } from '@thesis-ledger/schemas';

export function BacktestBrokerCommissionDisclosure({ model }: { model: BacktestExecutionModelV3 }) {
  return model.segments.map((segment) => {
    const profile = segment.fees?.brokerCommission;
    if (!profile) return null;
    let basis = '成交额';
    if (profile.basis.kind === 'actualShares') basis = '实际股数';
    else if (profile.basis.kind === 'referencePrice') basis = `参考股数＝模拟成交额÷${profile.basis.price}美元（研究假设）`;
    const cap = (value: string | null) => value === null ? '无上限' : `上限为成交额×${value}`;
    return <div key={segment.id} className="flex flex-col gap-1">
      <p>券商成本：富途香港 · 标准佣金及固定式平台费 · {profile.userModified ? '用户已调整' : '默认参考'}</p>
      <p>计费口径：{basis}；佣金参数 {profile.commission.rate}，最低 {profile.commission.minimumAmount} {model.scope.currency}，{cap(profile.commission.maximumTurnoverRatio)}。</p>
      {profile.platformFee.kind === 'fixed'
        ? <p>每单平台费：{profile.platformFee.amount} {model.scope.currency}。</p>
        : <p>平台费：{profile.platformFee.rate}美元/股，最低 {profile.platformFee.minimumAmount}美元，{cap(profile.platformFee.maximumTurnoverRatio)}。</p>}
      <p>一单一次成交，两项分别取整；最低额与上限冲突时最低额优先。当前收费表作为研究假设，核对日期 {profile.checkedDate}，公共收费另算。</p>
      <a href={profile.sourceUrl} target="_blank" rel="noreferrer">富途官方收费表</a>
    </div>;
  });
}
