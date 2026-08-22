# 架构改进任务计划

**状态：** 全部任务已完成，2026-08-22 归档。

## 目标

在不进行大规模 DSA 改造的前提下实施架构改进。

## 第一阶段

### TASK-ARCH-001 Provider Adapter 增强——已完成

现有实现已经提供：

- `MarketDataProvider`；
- `ProviderRegistry`；
- 优先级路由和 fallback；
- Provider 健康跟踪；
- 限流、重试和 circuit breaking；
- 位于 `services/dsa-adapter` 后的 DSA 集成。

验收结果：业务服务不依赖 DSA 实现细节，Provider 路由可以变化而不影响领域计算。

### TASK-ARCH-002 Research Result Model——已完成

`packages/schemas/src/research.ts` 在既有 AI evidence contract 之上定义 `ResearchResult V1`。`AiRunService.finishResearch()` 会在写入 `AiRun.result` 前校验结构化结果，复用既有 `AiRun` 和 `AiDecisionLog` 持久化，而不增加重复的 research 表。

验收结果：研究结果与 Portfolio/Ledger 事实分离，历史运行可以通过既有 AI run history 查询，研究证据在持久化前必须包含 citations。

### TASK-ARCH-003 Contract 校验——已完成

DSA capability declaration 由 `getDsaCapabilitySnapshot()` 归一化；DSA adapter capability 测试纳入 `pnpm contract:test`。现有 black-box smoke 覆盖 Data Contract V1、Control Contract V1、Provider registry、Fund NAV、Quote、Bars、Indicator、Chip 和 unsupported-capability 行为。

验收结果：Capability 检查可用，Contract/schema 不匹配会阻断 CI 或发布 smoke gate。

## 第二阶段

### TASK-ARCH-004 异步任务基础设施——由现有运行时完成

不为架构对称性引入第二套任务框架。仓库已有持久化执行模型：

- `AutomationJob` / `AutomationRun`：定时行情刷新、风险评估、Snapshot、健康检查和摘要流程；
- `BacktestJob`：回测的 queued/running/cancelled/succeeded 生命周期；
- `AiRun`：AI 执行、checkpoint、用量和结果持久化生命周期；
- Redis：缓存、锁和可重建运行状态。

除非未来需要多进程 worker、高吞吐或独立的 retry/dead-letter 语义，否则不新增 BullMQ 等平行抽象。

### TASK-ARCH-005 Infra 版本矩阵——已完成

- 主仓在 [`docs/architecture/version-matrix.md`](../../architecture/version-matrix.md) 记录具体兼容基线；
- infra 持有部署期兼容清单和校验脚本；
- 三仓 Contract Test 仍是阻断型集成门禁。

验收结果：ThesisLedger 版本、DSA Data/Control Contract 版本、DSA Fork 发布约定和迁移矩阵均可追踪。

## 约束

- 不进行大规模 DSA 重构；
- 不引入破坏性 DSA API 变化；
- 保留上游同步能力；
- 优先复用现有执行和持久化原语，避免平行抽象。
