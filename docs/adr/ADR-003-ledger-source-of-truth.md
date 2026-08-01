# ADR-003：Ledger 是资产唯一事实源

## 背景

独立维护流水与持仓会产生不可解释差异。

## 决策

V0.3 起只写 Ledger；Position、Portfolio 与 Snapshot 是投影或缓存。

## 后果

修正使用追加 Adjustment，不直接改历史；所有投影必须可重建。

## 替代方案

以 Position 为事实源无法可靠计算历史收益，不采用。
