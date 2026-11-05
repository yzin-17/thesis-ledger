# 数据库索引 Review

当前关键查询已覆盖以下索引：Ledger 按 `accountId + occurredAt` 查询，按 `accountId + sourceChannel + externalId` 唯一约束处理幂等，并按 `accountId + sourceChannel + sourceRowId` 反查来源行；MarketBar 按 symbol/timeframe/timestamp/provider；RiskEvent 按 rule/evaluatedAt、triggered/severity 和 account/symbol/evaluatedAt；BacktestJob 按 status/createdAt；AutomationRun 按 job/startedAt 与 status；Snapshot 按 account/capturedAt；Provider、Quality、Journal、TradePlan 和 AI 审计表均有时间序列索引。

生产发布前需在真实 PostgreSQL 上执行 `EXPLAIN (ANALYZE, BUFFERS)`，保存 Ledger、Bar、RiskEvent、Job、Snapshot 五类查询计划。当前本地无运行数据库，未声称已完成真实 query plan 验收。
