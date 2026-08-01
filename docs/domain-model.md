# Domain Model 总览

## 事实与投影

| 实体                       | 责任                                 | 事实级别          | 所有者         |
| -------------------------- | ------------------------------------ | ----------------- | -------------- |
| Account                    | 账户身份、来源、币种与状态           | 事实              | Server         |
| LedgerEvent                | 交易、现金、费用、税、公司行动与修正 | 唯一资产事实源    | Server         |
| Position                   | 当前数量与成本                       | Ledger 可重建投影 | Server         |
| PortfolioSnapshot          | 指定时点的估值与质量摘要             | 可重建历史缓存    | Server         |
| MarketBar                  | 带 Provider 的标准化行情             | 外部事实副本      | Market Adapter |
| RiskRule / RiskEvent       | 规则版本与确定性判断结果             | 业务事实          | Server         |
| Strategy / StrategyVersion | 可复现策略定义                       | 版本化事实        | Server         |
| BacktestJob                | 固定策略版本、数据时点和结果         | 研究事实          | Server         |
| JournalEntry / TradePlan   | 用户理由、计划、情绪和复盘           | 用户事实          | Server         |
| AutomationJob / Run        | 调度配置与执行历史                   | 运维事实          | Server         |

## 不变量

1. 正式交易写入必须先进入 Ledger，不能把 Position 当作独立事实修改。
2. Position 与 Snapshot 删除后应能由 Ledger 和 Market 数据重建。
3. RiskEvent 引用原规则版本、触发值、阈值和行情时点。
4. AI 只解释 Tool 提供的确定性结果，不重新计算风险触发条件。
5. Redis 丢失不影响事实完整性。

V0.1 的截图直接写 Position 是过渡路径；迁移到 Ledger 前不得作为 V1 完成状态。
