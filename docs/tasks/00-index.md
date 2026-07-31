# Investment OS Master Task Pack

> 范围：Phase 0 → V1.0
> 架构：Investment OS 独立主仓 + DSA Fork 能力服务 + 可插拔 Provider / Worker

## 使用规则

- 任务编号全局唯一且稳定，不在不同文件中重置。
- 每个任务只有在“完成条件”满足且“验证方式”实际通过后才能勾选。
- 阶段末尾的回归测试、文档更新和一致性 Review 均为必做任务。
- 任何外部系统能力都必须通过 Contract / Adapter 接入；客户端不直接调用 DSA。
- V0.3 起 Ledger 是唯一资产事实源，Position / Snapshot 都是可重建结果。

## 文件索引

- [Phase 0：项目奠基与 DSA 接入](01-phase-0-foundation.md)：T001～T018（18 项）
- [V0.1：核心 MVP 闭环](02-v0.1-core-mvp.md)：T019～T070（52 项）
- [V0.2：数据稳定与 Provider 框架](03-v0.2-data-reliability.md)：T071～T094（24 项）
- [V0.3：Ledger、Performance 与资产配置](04-v0.3-ledger-performance.md)：T095～T119（25 项）
- [V0.4：完整风险中心](05-v0.4-risk-center.md)：T120～T145（26 项）
- [V0.5：Strategy 与 Backtest](06-v0.5-strategy-backtest.md)：T146～T175（30 项）
- [V0.6：AI Research / Agent](07-v0.6-ai-agent.md)：T176～T196（21 项）
- [V0.7：投资日志、行为分析与 Shadow Account](08-v0.7-journal-review.md)：T197～T219（23 项）
- [V0.8：专业数据 Provider](09-v0.8-professional-providers.md)：T220～T232（13 项）
- [V0.9：自动化与日报](10-v0.9-automation.md)：T233～T254（22 项）
- [V1.0：稳定性、发布与最终验收](11-v1.0-release.md)：T255～T294（40 项）
