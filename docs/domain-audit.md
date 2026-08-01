# Domain Model 总审计

| 领域对象                    | 事实源/拥有者              | 可重建对象 | 关键关系                               |
| --------------------------- | -------------------------- | ---------- | -------------------------------------- |
| Account                     | Investment OS / PostgreSQL | 否         | Ledger、Position、Snapshot             |
| LedgerEvent                 | Investment OS / PostgreSQL | 否         | 交易、现金、公司行动、Adjustment       |
| Position                    | Ledger 投影                | 是         | account + symbol 唯一                  |
| PortfolioSnapshot           | Ledger + Market 缓存       | 是         | account、capturedAt 幂等               |
| MarketBar/Quote             | Provider 事实副本          | 可重新同步 | provider、marketTime、质量状态         |
| RiskRule/RiskEvent          | Investment OS Rule Engine  | 事件可重放 | ruleVersion、dataQuality、Notification |
| StrategyVersion/BacktestJob | Investment OS / Worker     | 结果可重跑 | 版本、引擎、数据、checksum             |
| Journal/TradePlan           | 用户研究记录               | 否         | Ledger、RiskEvent、StrategyVersion     |
| AutomationJob/Run           | 调度与审计                 | Run 可重跑 | Redis 锁、交易日、retry                |

Position、Snapshot 和收益结果不得成为独立事实源；AI、Notification 和 DSA 只能消费 Contract/Tool，不能写入 Ledger。废弃的 V0.1 Position 入口已通过 LedgerService 受控调整或 `migrate-positions` 迁移，保留表仅作为可重建投影。
