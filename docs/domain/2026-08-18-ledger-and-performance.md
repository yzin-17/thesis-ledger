# Ledger 与收益计算

## 事实源与投影

`LedgerEvent` 是交易、现金流、公司行动和受控修正的唯一事实源。`Position` 只是由 Ledger 重建的当前投影，`PortfolioSnapshot` 是带数据质量的历史缓存。现行 rebuild 从 Ledger 重建投影，不以清空投影作为用户操作流程。

当前持久信封版本为 3。手工持仓修改通过 Baseline Observation 命令写入 `POSITION_BASELINE_OBSERVATION`，由 `factId` 与追加式修正链表达事实版本，随后重建 Position；回滚追加带 `supersedesEventId` 的 `VOID`，不删除事实流水，不得直接写入 Position。当前可审核已有规范化持仓草稿并显式确认确定性对账，操作入口见[项目 README](../../README.md)。

不同业务时点的余额观察按经济时间重放，不能按录入先后覆盖历史。较小观察可收缩由早先观察推算的 Baseline 余量，数量与成本须采用同一收缩结果；真实成交余量不会因此扣减。数量冲突保留，不推算 SELL、平仓切片或已实现收益，详见[一致性约束](../specs/2026-10-21-baseline-projection-consistency.md)。

## 成本、现金与收益

AVG Cost 按交易顺序维护剩余数量、平均成本和已实现收益；FIFO 维护 lot 并按先进先出消耗。BUY/SELL 的费用和税费进入现金与已实现收益，DIVIDEND、INTEREST、TRANSFER、充值和提现按事件语义更新现金余额。BONUS、SPLIT、MERGE 保留事件并调整数量与单位成本。

TTWROR 按外部现金流切段，避免充值/提现伪造投资收益；XIRR 需要至少一笔流入和一笔流出，无解时明确返回不可计算。Snapshot 的市值优先使用带 Provider 和 stale 标记的 Quote，缺行情时保留 partial 与 missingSymbols。

现金快照是 `asOf` 时点实际已结算现金余额的状态基准，不改写或删除 Ledger 历史。现金投影以现金流生效时间区分已被快照吸收的流水与快照之后仍需重放的流水；业务发生时间、预计生效时间和实际结算时间必须保持可区分。

目标配置必须版本化且权重合计 100%。Rebalance Gap 只给出增配/减配金额建议，不自动下单。收益页面展示 Snapshot、TTWROR、XIRR、现金和目标配置版本。
