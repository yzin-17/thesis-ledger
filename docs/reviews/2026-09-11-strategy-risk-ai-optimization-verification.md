# 策略风险与 AI 优化验证记录

> 日期：2026-09-11  
> 对应任务：`2026-09-09-strategy-risk-ai-optimization`  
> 实施 PR：#35、#36、#37  
> 状态：PR #37 仓库代码验收已通过；待合并后确认 `main` push CI，仓库能力与部署能力门禁分开记录

## 当前实现基线

本能力复用统一回测 V2、`StrategyVersion`、`BacktestJob`、`AiRun`、现有 RiskEvent 与 Notification 基础设施，不新增第二套回测引擎、风险事件管线或 AI 平台。

当前已经形成以下闭环：

- `StrategySchemaV2` 可确定性编译 MonitoringPlan；Fixed Stop、Fixed Take Profit、Max Holding Period 使用独立的 Strategy Monitoring 语义，不改变旧手工规则比较符号；
- `RiskService.scan()` 是统一后台风险扫描入口，策略来源规则按 `sourcePlanId` 分派给 `StrategyRiskRuntimeService`，普通手工规则继续使用原 evaluator；
- 策略风险上下文读取实际账户 Position/Trade 平均成本与持仓周期；Exchange 只消费已闭合的目标 timeframe Bar，CN/HK/US 日线按市场 Calendar 最后一段 session 收盘判断完成时点；5m/15m/30m/60m 复用 V2 `aggregateMinuteBars()` 从 1m 语义派生；Fund 使用已发布 NAV；
- 同一时间点多个 Provider 的 MarketBar 先按既有优先级去重；只有 Max Holding Period 规则需要时才计算 `holdingPeriods`，避免无关扫描放大查询成本；
- `existingAndFuture` / `nextPositionCycle`、应用 revision、账户与持仓周期保持隔离；风险评价只产生 RiskEvent/Notification，不写真实 Ledger、订单或交易投影；
- Strategy RiskApplication 支持预览、创建、启停、升级 Diff、通知开关、冷却、严重级别与渠道选择；当前首版可投递渠道为 Feishu，并继续使用统一 Notification Provider 路由；
- 通知配置修改不会把 RiskRule 判断版本误当成策略语义升级；NotificationDispatcher 在实际发送前取消已停用、已归档、应用 revision 过期或已关闭通知的旧提醒；
- Risk Center 可把支持的策略来源成本止损/止盈复制成不再跟随策略版本的独立手工规则；旧手工规则继续使用严格 `< / >`，复制规则通过显式 `comparisonOperator` 保留策略 `<= / >=` 边界，并使用 `DecimalValue` 避免 JS 浮点误差破坏等号判断；
- AI 提案使用参数白名单、严格 Provider + Model 路由、不可变候选和真实 V2 开发/验证/测试 Run；模型文本不写入绩效事实；
- 基准与候选使用各自 Run-owned finalized Snapshot，并以分区市场事实 Artifact fingerprint 保证公平数据基准；
- 最终测试在候选锁定后才访问；克隆继承测试暴露，技术失败只允许原锁定候选重试；
- 调用次数、回测次数、输入/输出 Token、可选费用上限和最长计算时间均由 Server 预算控制；费用未知时必须显式确认，不把 unknown 显示为 0；
- AI 实验增加 15 秒周期 reconciler，持续回收 queued、空 lease 与过期 lease 实验，不再只在进程启动时读取前 10 个任务；
- Desktop 对比固定展示基准，按 Provider+Model 展示尝试/失败信息，并汇总真实 AiRun 调用次数、Token、耗时与费用/费用未知；候选展示开发/验证/测试真实指标；采纳正式版本后同时返回现有 RiskApplication 到新版本的实际规则差异，仍需用户显式确认升级；
- `STRATEGY_RISK_APPLICATIONS_ENABLED` 与 `STRATEGY_AI_OPTIMIZATION_ENABLED` 继续作为独立回退开关。

## 数据库所有权与迁移门禁

策略风险与优化编排表继续由 Server raw SQL 所有，而不是为了表面一致性强行映射为 Prisma Client model。原因是这些表使用 JSONB 原子更新、部分唯一索引、租约领取、预算预留和显式 SQL 锁语义。

`apps/server/prisma/raw-owned-tables.json` 明确登记：

- `StrategyRiskApplication`
- `StrategyRiskApplicationAudit`
- `OptimizationExperiment`
- `OptimizationCandidate`
- `OptimizationAttempt`
- `OptimizationAdoption`

`pnpm migration:matrix` 现在要求每张迁移创建的表必须且只能由 Prisma model 或 raw-owned manifest 覆盖，raw-owned 声明也必须实际存在于迁移链，避免原先只检查“迁移文件数量与命名”却发现不了 schema ownership drift 的问题。

CI 的 `contracts-and-guardrails` 增加 PostgreSQL 16 service，实际执行 `db:generate`、完整 migration 和 `strategy-optimization-db-smoke.mjs`。Smoke 会验证 raw-owned 表真实存在、账户+标的只允许一个启用 StrategyRiskApplication 的部分唯一约束，并实际写入 Experiment → Candidate → Attempt → Adoption 关系后清理测试数据。

## 自动化验证原则

- CI 必须通过 lint、typecheck、tests、build、secret scan、真实数据库 migration smoke、contract tests、complexity guardrails 与 Android native build；不通过提高阈值或新增 ignore 绕过。
- Fixture 用于确定性契约、隔离与故障测试，不冒充在线 Provider 验证。
- 正式采纳与实际风险启用保持两次显式用户动作；AI、回测和测试过程不得写真实 Ledger 或自动交易。
- Run-owned finalized Snapshot + 分区 Artifact fingerprint 继续作为实验数据公平性依据；不引入第二套共享可变 Snapshot 生命周期。

## 已完成证据

### PR #35：策略风险与 AI 优化主体

- 落地 MonitoringPlan、四态评价、实验/候选/预算/封存契约、严格 Provider+Model、参数白名单、真实 V2 Run、候选锁定、正式采纳和 Desktop 工作区。
- PR CI 最终全绿；合并后 `main` CI #357 为 `completed / success`。

### PR #36：统一策略风险运行时

- 将 Strategy RiskApplication 接回 `RiskService.scan()` 唯一后台入口；策略规则使用独立 Strategy evaluator，旧手工规则 evaluator 不变。
- 移除重复的 `StrategyRiskEvaluationStoreService`，Strategy 规则复用现有 RiskEventService / NotificationService。
- 新增统一运行时、shadow 隔离、MarketBar evaluation tick 与等号触发定向测试。
- PR CI #372 全绿；合并 commit `46780af16e213f8e6e211297ea5a4d3db87018e6` 后 `main` CI #373 为 `completed / success`。

### PR #37：二次 Review 收口

已完成：

1. 日线盘中数据不会替代上一根已闭合日线；CN/HK/US 日线按交易日身份和市场收盘时刻判断完成，分钟策略复用 V2 1m 聚合语义；
2. 通知-only 更新不重置 RiskRule 判断状态，旧 revision 通知在发送前被取消；
3. Strategy RiskApplication 补齐启用、冷却、严重级别、Feishu 渠道设置；
4. 优化实验增加周期 reconciler 与不重入测试；
5. raw-owned table ownership manifest、增强 migration drift guard、真实 PostgreSQL migration/database smoke；
6. AI 创建页补 `maxCost`，比较页补固定基准、测试指标和失败通道；Attempt 读模型返回 AiRun token/cost/duration，并按模型汇总实际 usage；
7. 正式采纳返回现有 RiskApplication → 新正式版本 MonitoringPlan Diff；
8. Risk Center 支持将可兼容的策略风险规则复制为独立手工规则，并以 Decimal 精确比较保留 `<= / >=` 边界；
9. 新增 completed tick、恢复 reconciler、通知状态独立性、发送前门禁和独立规则边界等定向测试。

PR #37 代码 HEAD `088fcd47d6e46f14462095c2fd57330497d1881a` 的 CI #410（workflow run `34623209635`）已完成仓库代码验收：

- `quality`：lint、typecheck、tests、build 全部 `success`；
- `contracts-and-guardrails`：Secret scan、Migration matrix、PostgreSQL strategy optimization database smoke、Contract tests、Complexity guardrails 全部 `success`；
- `mobile-android-native`：Android debug native build `success`；
- `desktop-packages`：按现有 workflow 条件正常 `skipped`。

本次失败修复均按根因处理：没有提高复杂度阈值、没有添加 ESLint/TypeScript ignore、没有用 Fixture 替代数据库迁移、没有放宽风险比较语义。

## 部署能力门禁

以下验证依赖目标部署环境，不计为仓库代码未完成，也不能用 Fixture 冒充：

- 至少一个真实外部 AI Provider 的网络、鉴权、实际模型身份和 usage/cost 回传 smoke；双模型比较需要两个严格不同的 Provider+Model 身份实际可用。
- 在线 CN/HK/US Stock/ETF 与 CN NAV 的目标区间数据能力 smoke；固定 fixtures 只能证明引擎与协议。
- Desktop 人工视觉、键盘、焦点 smoke；CI 负责类型、契约与构建，但无 GUI Runner 时不伪报人工验收。

部署门禁失败时应限制对应 capability，并返回 `unavailable`/明确原因；不能静默 fallback，也不反向把已经通过的仓库实现标为未完成。

## 最终收口状态

- PR #37 代码 HEAD 的 quality / contracts-and-guardrails / mobile-android-native 已全绿；
- PostgreSQL migration/database smoke 已真实通过；
- Spec/Task 与本验证记录已收敛到当前实现，外部能力门禁保持独立；
- 剩余仓库动作仅为合并 PR #37，并确认合并后的 `main` push CI 全绿。
