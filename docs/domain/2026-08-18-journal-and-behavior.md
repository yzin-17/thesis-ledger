# 投资日志、行为分析与 Shadow Account

## 事实边界

`TradePlan` 是交易前假设，包含方向、计划价格和时间、目标仓位、止损/止盈、预期持有期及理由；它不会改变 Ledger 或 Portfolio。`JournalEntry` 可关联 account、symbol、Ledger 事件、Trade Plan、RiskEvent 和 StrategyVersion，并保存 thesis、catalyst、risk、exitReason、emotion、tags 与自由文本。

计划触发 RiskRule 时必须通过显式的 `rules/from-plan` 操作确认，生成的规则保存 `sourcePlanId`；之后修改计划不会静默修改已创建规则，规则版本和审计记录仍由 Risk Center 管理。

## 确定性复盘

Planned vs Actual 由成交事实比较计划入场/出场价格和持有期；Planned vs Actual Stop 使用 RiskEvent 触发时间、实际退出时间和价格计算延迟与损失差异。持仓周期、逐笔胜率、盈亏比、交易频率、换手和仓位偏离均从 Ledger/计划计算，不由 AI 猜测。

行为标签（未执行止损、过早止盈、过度交易、追涨、锚定、处置效应）必须保存 evidence；缺少必要事实时返回 `insufficient data`。Shadow Strategy 只是一份历史行为研究候选，不会修改真实策略或规则。

Counterfactual Replay 明确区分真实收益和假设收益，并保存止损价格、成交和数量假设。周/月 Review 固定数据窗口并可重跑，AI Behavior Review 只能解释这些确定性指标和来源，不能新增行为事实，也不等同心理诊断。
