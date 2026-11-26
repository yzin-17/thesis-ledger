# 长期设计

本目录维护当前系统架构、领域模型和长期架构决策。各文档保留独立所有权；需求范围和验收条件由[产品规格](../specs/README.md)维护，执行状态见[文档中心](../README.md)。

## 系统与接口架构

- [API 成本分类与限流](2026-11-07-api-rate-limits.md)

- [DSA 能力与主仓边界审计摘要](2026-08-18-dsa-capability-audit.md)
- [DSA Fork 与上游边界](2026-08-18-dsa-upstream.md)
- [市场数据与标的中心 v1.2 实施说明（已归档）](2026-08-18-market-data-provider-v1-2-implementation.md)
- [DSA Contract V1 兼容说明](2026-08-18-thesis-ledger-dsa-compatibility.md)
- [Server 模块边界与依赖方向](2026-09-02-server-module-boundaries.md)
- [市场数据 V2 与复权感知 V3 架构](2026-09-16-market-data-v2.md)
- [当前 Market、Backtest 与 Ledger 运行链](canonical-runtime.md)
- [三仓版本与兼容矩阵](version-matrix.md)

## 领域模型

- [AI 研究与 Agent 边界](2026-08-18-ai-research.md)
- [自动化与日报运维](2026-08-18-automation.md)
- [Domain Model 总览](2026-08-18-domain-model.md)
- [投资日志、交易复盘与行为分析](2026-08-18-journal-and-behavior.md)
- [Ledger 与收益计算](2026-08-18-ledger-and-performance.md)
- [Provider 与数据可靠性（已合并）](2026-08-18-provider-reliability.md)
- [数据源选择与专业 Provider（已合并）](2026-08-18-provider-selection.md)
- [风控与通知说明](2026-08-18-risk-and-notifications.md)
- [策略与回测领域边界](2026-08-18-strategy-and-backtest.md)
- [研究模拟账户规则](2026-11-23-research-account-policy.md)
- [Provider 路由与数据可靠性](2026-09-16-provider-routing-and-reliability.md)

## 架构决策

- [ADR-001：独立主仓与 DSA Fork](2026-08-18-ADR-001-repository-boundary.md)
- [ADR-002：TypeScript 与 Python 的职责边界](2026-08-18-ADR-002-language-boundary.md)
- [ADR-003：Ledger 是资产唯一事实源](2026-08-18-ADR-003-ledger-source-of-truth.md)
- [ADR-004：PostgreSQL 与 Prisma](2026-08-18-ADR-004-database-and-orm.md)
- [ADR-005：外部能力 Contract 与 Adapter](2026-08-18-ADR-005-provider-contracts.md)
- [ADR-006：Redis 的有限职责](2026-08-18-ADR-006-cache-and-queue.md)
- [ADR-007：AI 只读事实与来源约束](2026-08-18-ADR-007-ai-safety.md)
- [ADR-008：客户端只访问 Investment OS API](2026-08-18-ADR-008-client-api-boundary.md)
- [ADR-009：账户身份与持仓录入来源分离](2026-08-18-ADR-009-account-entry-boundary.md)
- [ADR-010：账户类型与账户模式分离](2026-08-18-ADR-010-account-type-and-mode.md)
- [ADR-011：场外基金净值使用独立 Contract](2026-08-18-ADR-011-fund-nav-contract.md)
- [ADR-012：导入草稿使用 Ledger 基线检测冲突](2026-08-18-ADR-012-import-draft-baseline.md)
- [ADR-013：账户模型在 API v1 中原子升级](2026-08-18-ADR-013-breaking-account-api-v1.md)
- [ADR-014：ThesisLedger 工作区与 DSA Fork 的仓库边界](2026-08-18-ADR-014-thesis-ledger-workspace-boundary.md)
- [ADR-015：由 ThesisLedger Server 提供共享 Market Detail 读模型](2026-08-21-ADR-015-market-detail-read-model.md)
- [风险规则以账户持仓为目标](2026-08-24-ADR-016-risk-position-target.md)
- [ADR-017：收益分析配置边界](2026-08-24-ADR-017-performance-allocation-boundary.md)
- [ADR-018：0.1 阶段采用 Fresh Database Baseline](2026-09-02-ADR-018-fresh-database-lifecycle.md)
