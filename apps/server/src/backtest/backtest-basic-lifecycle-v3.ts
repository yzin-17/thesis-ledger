import type {
  BacktestTradingStatusDisclosureV3,
  MarketBasicLifecycleV3,
} from '@thesis-ledger/schemas';

/** 基础资料日期只约束交易所成交边界，不表达最后交易日、整理期或精确价格规则。 */
export function basicLifecycleForbidsTradeV3(date: string, life?: MarketBasicLifecycleV3) {
  if (!life) return false;
  return Boolean((life.ipoDate && date < life.ipoDate) || (life.outDate && date >= life.outDate));
}

export function basicLifecycleWarningsV3(disclosure: BacktestTradingStatusDisclosureV3): string[] {
  if (disclosure.status !== 'source' || !disclosure.response.basicLifecycle) return [];
  const life = disclosure.response.basicLifecycle;
  const ipo = life.ipoDate ? `上市日 ${life.ipoDate}` : '上市日未知';
  const out = life.outDate ? `摘牌日 ${life.outDate}` : '摘牌日未取得，不能据此证明未来仍上市';
  return [
    `已冻结基础日期：${ipo}；${out}。上市前及摘牌日起禁止交易所成交，摘牌日不等于最后交易日；上市特殊时期、整理期、末次交易日与摘牌后价值未由基础资料证明。当前观察日期不作为历史当时可见信号。`,
  ];
}
