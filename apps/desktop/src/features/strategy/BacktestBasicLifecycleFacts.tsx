import type { MarketBasicLifecycleV3 } from '@thesis-ledger/schemas';
import { formatDateOnly } from '@/lib/date-display';

const labels = {
  notProvided: '来源未提供',
  invalid: '来源值无效',
  unavailable: '来源不可用',
  known: '已取得',
};
export function BacktestBasicLifecycleFacts({ lifecycle }: { lifecycle?: MarketBasicLifecycleV3 | undefined }) {
  if (!lifecycle) return null;
  return (
    <div className="flex flex-col gap-1">
      <div>
        上市日：
        {lifecycle.ipoDate ? formatDateOnly(lifecycle.ipoDate) : labels[lifecycle.ipoDateStatus]}；
        摘牌日：
        {lifecycle.outDate ? formatDateOnly(lifecycle.outDate) : labels[lifecycle.outDateStatus]}。
      </div>
      <div>
        上市前及摘牌日起禁止交易所成交；摘牌日不等于最后交易日。未提供摘牌日不能证明未来仍上市；特殊时期、整理期和末次交易日仍待相应事实。
      </div>
      {lifecycle.reason && <div>{lifecycle.reason}</div>}
    </div>
  );
}
