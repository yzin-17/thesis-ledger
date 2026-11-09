import type { FundNavHistory } from '@thesis-ledger/schemas';
import type { MarketDetailPosition } from './market-detail.types.js';

export function fundNavCostReference(history: FundNavHistory, position?: MarketDetailPosition) {
  if (!history.length) return { reason: '暂无净值数据。', price: undefined };
  if (!position?.accountId || !position.mode)
    return { reason: '请从具体账户的基金持仓打开详情，才能查看成本参考。', price: undefined };
  if (history.some((point) => point.symbol !== position.symbol))
    return { reason: '当前持仓与基金净值代码不一致，无法比较成本。', price: undefined };
  if (!position.currency) return { reason: '缺少持仓币种，暂不能比较成本。', price: undefined };
  if (position.currency !== 'CNY')
    return { reason: '持仓币种与人民币单位净值不一致，暂不能比较成本。', price: undefined };
  if (!Number.isFinite(position.quantity) || (position.quantity ?? 0) <= 0)
    return { reason: '当前没有可比较的基金持仓。', price: undefined };
  if (position.costPrice == null) return { reason: '缺少当前持仓成本。', price: undefined };
  if (!Number.isFinite(position.costPrice) || position.costPrice < 0)
    return { reason: '当前持仓成本无效，暂不能绘制参考线。', price: undefined };
  return { reason: null, price: position.costPrice };
}
