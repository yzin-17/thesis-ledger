# V1 回测任务 BullMQ 生命周期实施任务

对应 Spec：[`../specs/2026-09-09-backtest-bullmq-lifecycle.md`](../specs/2026-09-09-backtest-bullmq-lifecycle.md)

> 2026-09-12 严格 Review 增量：V1/V2 共用的 BullMQ transport 曾把本地 `attemptsMade` 与 PostgreSQL `executionAttempt` 混用，导致运输记录重建后可能恢复活锁。PR #33 已实施 durable ownerAttempt 与 reconciler 有界覆盖修复；真实 Compose post-claim hard-kill smoke 继续归 T4，不用单元测试冒充运行环境验收。

## 任务

- [x] T1：建立持久化任务状态与幂等 BullMQ 投递闭环
  - 覆盖验收标准：AC1、AC2、AC4。
  - 依赖：无。
  - 涉及范围：`BacktestJob` Schema/迁移、BullMQ 依赖、队列适配器、创建与兼容运行接口、协调器。
  - 完成条件：数据库是唯一事实源；队列消息只含 jobId；Redis 故障时任务可保存并在恢复后补投；旧非终态任务安全收口。
  - 验证方式：HTTP 和公开队列服务边界测试、迁移 SQL、幂等投递、双写窗口和协调器恢复。
  - 验证证据：Backtest 定向测试覆盖 Redis 不可用、旧 BullMQ 终态记录补投、运行中任务不因 Redis 查询失败被误重排；隔离 PostgreSQL 升级演练确认旧非终态安全收口且 input/result 保留；migration matrix 持续通过。

- [x] T2：交付独立 Worker 的领取、重试、取消与终态保护
  - 覆盖验收标准：AC1、AC2、AC3、AC8、AC10。
  - 依赖：T1。
  - 涉及范围：Worker 入口、sandbox processor、执行状态机、durable ownerAttempt、结构化错误、心跳与健康检查。
  - 完成条件：默认并发 1；最多 3 个 PostgreSQL durable execution attempts；确定性错误不继续业务执行；重复运输记录或晚到 owner 不能覆盖终态；协作式取消收敛；BullMQ `attemptsMade` 不参与数据库 owner 版本。
  - 验证方式：状态机行为测试、V1/V2 transport recreation 回归、BullMQ/Redis 集成测试、Worker 重启与取消故障注入。
  - 接口契约：Consumes T1 的 `BacktestJob.id` 和队列消息；Produces PostgreSQL 终态与 `BacktestJobSummary` 事件。
  - 验证证据：既有测试覆盖首次失败、第三次耗尽、确定性失败、重复领取、晚到结果、queued/running 取消；PR #33 新增 `durable-owner-recovery.test.ts`，证明 V1/V2 在数据库 `executionAttempt=1` 且 BullMQ 运输记录重新从本地 attempt=1 开始时，仍从 PostgreSQL 派生 `ownerAttempt=2` 并唯一执行；仍为 running 的 owner 不会被重复 transport 抢占。Worker `failed` callback 已移除无 owner 条件的数据库终态写入。

- [x] T3：交付轻量任务读取与 SSE 状态通道
  - 覆盖验收标准：AC5、AC6、AC7。
  - 依赖：T1。
  - 涉及范围：摘要 DTO/查询、Redis Pub/Sub、SSE、Desktop API/Query/缓存、结果详情按需读取、Electron 流式代理。
  - 完成条件：摘要与事件不包含 input/result；旧完整接口兼容；页面仅有一个 SSE 连接；非终态任务每 30 秒兜底且终态后停止；代理断开时释放上游。
  - 验证方式：Server HTTP/SSE 测试、Desktop 假计时器与 EventSource 测试、Electron 代理流测试、响应体积对比和 429 回归。
  - 接口契约：Consumes T1/T2 发布的 `BacktestJobSummary`；Produces Strategy 页面任务摘要缓存和按需详情。
  - 验证证据：Server 事件测试确认 Pub/Sub/SSE 摘要剔除 input/result；Desktop 测试确认摘要与详情分离、多个订阅者共享一个 EventSource、重连刷新和非终态 30 秒兜底；Electron 代理测试确认上游结束前首个 SSE 分片已到达。

- [ ] T4：完成 Compose 部署、post-claim 故障恢复 Smoke 与全量一致性验证
  - 覆盖验收标准：AC2、AC8、AC9、AC10。
  - 依赖：T2、T3、T5、T6。
  - 涉及范围：生产镜像、`thesis-ledger-infra` 开发/生产 Compose、运行脚本、真实 Worker 进程故障注入、浏览器/Electron 与文档同步。
  - 完成条件：API、Worker、PostgreSQL、Redis 健康；任务已经进入 `running` 且取得 ownerAttempt 后硬杀 Worker，恢复/运输记录重建后数据库 owner 单调增加并最终唯一收敛；Redis 短停后任务收敛；无重复结果、永久非终态或 429；真实 Electron SSE/取消/结果路径通过。
  - 验证方式：目标测试、Server/Desktop 全量测试、typecheck、production build、migration matrix、边界检查、Compose post-claim hard-kill smoke、浏览器/Electron 验收和 `git diff --check`。
  - 当前状态：代码正确性与自动化回归已补齐，但本次 PR 尚未执行真实目标 Compose 中“claimed 后硬杀 Worker”的进程级 smoke，因此保持未勾选。

- [x] T5：将 `executionAttempt` 收敛为 durable ownerAttempt，并关闭运输记录重建活锁
  - 覆盖验收标准：AC2、AC3、AC10。
  - 依赖：T1、T2。
  - 涉及范围：`backtest-execution-owner.ts`、processor、Worker failure handling、V1/V2 Service 的既有 owner-fenced 提交路径及定向测试。
  - 完成条件：processor 不再从 `job.attemptsMade + 1` 推导数据库 owner；下一 owner 由 PostgreSQL 当前 `executionAttempt + 1` 派生；queued 且未取消才可准备执行；running owner 不被重复 transport 抢占；达到全局三次预算时 fail closed；BullMQ failed callback 不直接写业务终态。
  - 验证方式：V1/V2 从 DB attempt=1 恢复到 owner=2 的回归、running duplicate transport 回归、旧 owner 条件提交回归、全量 Server tests/typecheck/build/lint。
  - 验证证据：PR #33 代码 HEAD `33537c2367d6124b6816ca7b86e13cb6db59e9e5` 的 CI #434 / workflow run `34680687989` 已 `completed / success`；quality 的 lint/typecheck/full tests/build 全部成功，contracts-and-guardrails 与 Android native build 同样成功。

- [x] T6：让 reconciler 对 >100 非终态任务提供有界全量覆盖
  - 覆盖验收标准：AC2、AC11。
  - 依赖：T1、T5。
  - 涉及范围：`BacktestQueueReconciler` 分页、stale 状态写入 fencing、>100 backlog 回归。
  - 完成条件：以 `(createdAt, id)` keyset pagination 每页最多 100 条并继续读取后续页；第 101 条不会因前 100 条长期非终态而饥饿；running→queued 与 attempts exhausted 写入使用 `status + executionAttempt` 条件；Redis 查询失败不误恢复 running。
  - 验证方式：101 条 queued/running 回归、状态竞争更新 0 行语义、既有 Redis 查询失败回归、全量 CI。
  - 验证证据：`reconciler.test.ts` 新增 101 条任务场景，断言两页均被读取且第 101 条被投递；PR #33 CI #434 的 full tests、contract tests 与 complexity guardrails 均通过。

## 2026-09-12 PR #33 实施说明

本轮没有新增数据库字段或 migration，也没有修改公开 HTTP/API Client contract。修复集中在共享 Backtest transport lifecycle：

1. 新增 `backtest-execution-owner.ts`，从 PostgreSQL 状态准备下一 durable ownerAttempt；
2. processor 只把 durable ownerAttempt 传给 V1/V2 Service，BullMQ attempt 仅保留为 transport metadata；
3. V1/V2 Service 既有 `executionAttempt` 条件 success/retry/failure 提交继续作为 owner fencing，不重写引擎；
4. Worker 父进程 `failed` callback 只记录 transport telemetry，不再无 owner 条件终结数据库任务；
5. reconciler 改为 keyset pagination，并以当前 `status + executionAttempt` 条件恢复；
6. 自动化测试覆盖 V1、V2 运输记录重建和 101 条 backlog。

因此，上次严格 Review 中导致 V2 AC23 重新打开的**代码正确性缺口已经关闭**。V2 Snapshot、SimulationLedger、执行模型、策略风险与 AI 优化算法均未被本 PR 改写。真实外部 Provider 可用性仍按原 capability 门禁处理。

## 计划与一致性检查

- Spec 覆盖：AC1–AC11 均映射到实施或部署验证任务。
- 依赖检查：T1 建立数据库/队列契约；T2/T5 建立 durable owner；T6 收敛恢复覆盖；T3 保持读取通道；T4 是最终部署运行态门禁。
- 跨任务契约：统一使用 `BacktestJob.id`、`BacktestJobSummary`、PostgreSQL `executionAttempt` durable owner 和最多三次业务执行语义。
- 范围检查：未引入通用任务框架、未新增 Schema/migration、未改变 V1/V2 回测计算结果契约。

## 最终一致性 Review

- [x] Spec 中 AC1–AC11 均有对应实现或明确的部署验证责任。
- [x] 所有已勾选任务均有验证证据。
- [x] durable owner、transport metadata 与 reconciler 职责边界一致。
- [x] V1/V2 共享 transport 使用同一 durable owner 原则，未扩大为 V2 引擎重构。
- [x] 自动化测试策略与当前实现一致。
- [x] PR #33 代码 HEAD 完整 CI #434 全绿。
- [ ] 真实 Compose post-claim hard-kill 与 Electron 最终运行态 smoke 尚未执行，因此 T4 不提前勾选。

### Review 结论

- **代码结论：**PR #33 已关闭 durable attempt / transport attempt 混用、无 fencing Worker failed fallback、固定前 100 条 reconciler 三个已确认正确性问题；V1/V2 transport recreation 回归和 >100 backlog 回归已进入 full test suite。
- **CI 证据：**代码 HEAD `33537c2367d6124b6816ca7b86e13cb6db59e9e5` 的 CI #434 / workflow run `34680687989` 为 `completed / success`；quality、contracts-and-guardrails、mobile-android-native 全部成功，desktop-packages 按 workflow 条件正常 skipped。
- **仍未冒充完成的门禁：**T4 的目标 Compose post-claim hard-kill、完整生产 Compose 健康和真实 Electron 运行态验收。本轮自动化修复通过不等于这些部署 smoke 已发生。
