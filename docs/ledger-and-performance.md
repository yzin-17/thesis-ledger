# Ledger 与收益计算

## 事实源与投影

`LedgerEvent` 是交易、现金流、公司行动和受控修正的唯一事实源。`Position` 只是由 Ledger 重建的当前投影，`PortfolioSnapshot` 是带数据质量的历史缓存。清空 Position 后运行 `/api/v1/ledger/:accountId/rebuild`，应得到同一账户的最新投影。

截图审核提交会写入带 `source=screenshot:*`、`externalUid`、`correctionOf`、原因和开仓余额 metadata 的 `ADJUSTMENT`，随后重建 Position；回滚写入补偿 Adjustment，不删除事实流水。手工持仓修改也必须通过 Ledger Adjustment。

## 成本、现金与收益

AVG Cost 按交易顺序维护剩余数量、平均成本和已实现收益；FIFO 维护 lot 并按先进先出消耗。BUY/SELL 的费用和税费进入现金与已实现收益，DIVIDEND、INTEREST、TRANSFER、充值和提现按事件语义更新现金余额。BONUS、SPLIT、MERGE 保留事件并调整数量与单位成本。

TTWROR 按外部现金流切段，避免充值/提现伪造投资收益；XIRR 需要至少一笔流入和一笔流出，无解时明确返回不可计算。Snapshot 的市值优先使用带 Provider 和 stale 标记的 Quote，缺行情时保留 partial 与 missingSymbols。

目标配置必须版本化且权重合计 100%。Rebalance Gap 只给出增配/减配金额建议，不自动下单。收益页面展示 Snapshot、TTWROR、XIRR、现金和目标配置版本。
