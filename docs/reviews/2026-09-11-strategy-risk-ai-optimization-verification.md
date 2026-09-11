# 策略风险与 AI 优化验证记录

> 日期：2026-09-11  
> 对应任务：`2026-09-09-strategy-risk-ai-optimization`  
> 实施 PR：#35、#36、#37、#38  
> 状态：T00–T15 仓库实现与仓库级验证已收口；PR #37 已合并且 `main` CI #412 成功，PR #38 负责最终严格 Review 收口；部署能力门禁单独记录

## 当前实现基线

本能力复用统一回测 V2、`StrategyVersion`、`BacktestJob`、`AiRun`、现有 RiskEvent 与 Notification 基础设施，不新增第二套回测引擎、风险事件管线或 AI 平台。

当前已经形成以下闭环：

- `StrategySchemaV2` 可确定性编译 MonitoringPlan；Fixed Stop、Fixed Take Profit、Max Holding Period 使用独立的 Strategy Monitoring 语义，不改变旧手工规则比较符号；
- `RiskService.scan()` 是统一后台风险扫描入口，策略来源规则按 `sourcePlanId` 分派给 `StrategyRiskRuntimeService`，普通手工规则继续使用原 evaluator；
- 策略风险上下文读取实际账户 Position/Trade 平均成本与持仓周期；Exchange 只消费已闭合的目标 timeframe Bar，CN/HK/US 日线按市场 Calendar 最后一段 session 收盘判断完成时点；5m/15m/30m/60m 复用 V2 `aggregateMinuteBars()` 从 1m 语义派生；Fund 使用已发布 NAV；
- 当前默认 `market-sync` 仅稳定自动同步 `1d`。分钟策略依赖已存 1m；不存在稳定自动 1m 能力时，StrategyRiskApplication 启用/升级 fail-closed，不会显示成“监控中但实际无数据”；
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
- Optimization 外部调用在 Provider 前先持久化 `(experimentId, modelKey, round)` attempt；`reserved/running/succeeded/failed/unknown_outcome` 可区分。Provider 可能已收到请求但结果未知时保留 `unknown_outcome`，禁止自动二次请求，不宣称 exactly-once；
- 正式采纳以稳定 idempotency key 保证顺序/并发重试返回同一正式 `StrategyVersion`；同 candidate 的不同采纳意图被拒绝，Desktop 在一次采纳意图失败重试期间复用同一 key；
- Desktop 每个 Provider+Model 卡片直接展示 AI calls、输入/输出 Token、耗时、费用/费用未知、最新状态与失败原因；采纳后 RiskApplication Diff 可展开查看 added/removed/changed、sourceKey 与 before/after；采纳策略仍不会自动升级风险应用；
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

`pnpm migration:matrix` 要求每张迁移创建的表必须且只能由 Prisma model 或 raw-owned manifest 覆盖，raw-owned 声明也必须实际存在于迁移链，避免 schema ownership drift。

CI 的 `contracts-and-guardrails` 使用 PostgreSQL 16，实际执行 `db:generate`、完整 migration 与 `strategy-optimization-db-smoke.mjs`。Direct-SQL smoke 继续验证 raw-owned 表存在、外键和数据库唯一约束，但不冒充 Service E2E。

PR #38 另加入独立 `Strategy optimization PostgreSQL service E2E`：真实实例化 Prisma 与 StrategyRiskApplication/RiskService/StrategyOptimization 服务，Provider/Backtest 仅作为外部边界替身。它覆盖风险应用 preview/create/enable/notification update/upgrade/scan、并发启用唯一、stale revision、升级事务回滚、notification-only trigger state、Optimization reconcile/finalize/adopt、正式采纳并发/幂等、cancel/recovery、raw-owned transaction、引用保护，以及 succeeded round 被 reconciler 重扫时不重复 Provider/AiRun/Candidate。

## 自动化验证原则

- CI 必须通过 lint、typecheck、tests、build、secret scan、真实数据库 migration smoke、独立 PostgreSQL service-level E2E、contract tests、complexity/file-size guardrails 与 Android native build；不通过提高阈值或新增 ignore 绕过。
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

PR #37 代码 HEAD `088fcd47d6e46f14462095c2fd57330497d1881a` 的 CI #410（workflow run `34623209635`）完成仓库代码验收。PR #37 随后 squash merge，`main` 更新为 `b935fe1eed01abe97192c0a5e2c9d224c80623b7`；合并后 `main` CI #412（workflow run `34624796882`）为 `completed / success`。

### PR #38：最终严格 Review 收口

PR #38（`fix: close final strategy AI optimization gaps`）补齐重新打开的 T10/T12/T13/T14/T15：

1. OptimizationAttempt crash-safe step 身份、租约与 `unknown_outcome`；通用 AiRun recovery 不会把 Optimization 外部调用重新排队；
2. PostgreSQL 定向验证 Provider 调用前 attempt 已持久化、多实例单 worker、成功 replay 不重复调用、崩溃结果未知不二次请求、预算不重复扣；另覆盖 succeeded round 经 reconciler 重扫后 Provider/AiRun/Candidate 均不重复；
3. 正式采纳同 key 顺序/并发/响应丢失重试返回同一正式版本；不同 key 不重复采纳 candidate；stale expectedVersion fail-closed；
4. Desktop 采纳意图使用稳定 idempotency key，模型卡直接展示 usage/cost/duration/status/failure，RiskApplication Diff 可逐条展开；
5. 默认只有 `1d` 自动 market-sync 时，分钟策略风险应用启用/升级按 capability fail-closed；
6. Direct-SQL smoke 与独立 PostgreSQL Service E2E 分离，Service E2E 真实走应用服务与事务；
7. 为满足既有 file-size ratchet，将 stale AiRun recovery 与 adoption persistence 抽为独立 helper；没有提高复杂度/文件阈值。

PR #38 代码 HEAD `7a41c7776ce6742d923315756fc1238d79fe003a` 的 CI #428（workflow run `34644770023`）已完成代码侧验证：

- `quality`：lint、typecheck、全量 tests、build 全部 `success`；
- `contracts-and-guardrails`：Secret scan、Migration matrix、direct-SQL database smoke、PostgreSQL service-level E2E、Contract tests、Complexity/file-size guardrails 全部 `success`；
- `mobile-android-native`：Android debug native build `success`；
- `desktop-packages`：按现有 PR workflow 条件正常 `skipped`。

T15 文档修订提交后必须以包含本文档的最终 PR #38 CI 为合并证据；#428 证明功能代码 head 已全绿，不提前冒充最终文档 head 的 CI。

## 部署能力门禁

以下验证依赖目标部署环境，不计为仓库代码未完成，也不能用 Fixture 冒充：

- 至少一个真实外部 AI Provider 的网络、鉴权、实际模型身份和 usage/cost 回传 smoke；双模型比较需要两个严格不同的 Provider+Model 身份实际可用。
- 在线 CN/HK/US Stock/ETF 与 CN NAV 的目标区间数据能力 smoke；固定 fixtures 只能证明引擎与协议。
- Desktop 人工视觉、键盘、焦点 smoke；CI 负责类型、契约与构建，但无 GUI Runner 时不伪报人工验收。

部署门禁失败时应限制对应 capability，并返回 `unavailable`/明确原因；不能静默 fallback，也不反向把已经通过的仓库实现标为未完成。

## 最终收口状态

- T00–T15 的仓库实现、定向测试、PostgreSQL Service E2E 与仓库 CI 门禁均已形成证据链；
- PR #37 已 squash merge，merge commit `b935fe1eed01abe97192c0a5e2c9d224c80623b7`，`main` CI #412 / workflow run `34624796882` 已成功；
- PR #38 代码 head CI #428 / workflow run `34644770023` 已全绿；本文档提交后仍需以 PR #38 最终文档 head 的全绿 CI 作为合并依据；
- 真实外部 AI Provider、在线 CN/HK/US Stock/ETF + CN NAV、Desktop 人工视觉/键盘/focus 继续作为部署能力门禁，不以 fixture 或仓库 CI 冒充。
