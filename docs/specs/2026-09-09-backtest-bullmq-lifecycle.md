# V1 回测任务 BullMQ 生命周期 Spec

> 2026-09-12 增量说明：本 Spec 最初针对 V1 BullMQ 生命周期。当前 V1/V2 共用同一 `BacktestJob`、BullMQ transport、processor 与 reconciler，因此本次 durable owner 与恢复语义同时约束 V1/V2 的共享运输层；不改变 V2 Snapshot、SimulationLedger、执行模型或结果语义。

## 背景与问题

V1 回测已从客户端驱动的两段式执行迁移到 Server 持久化任务 + BullMQ 独立 Worker。PostgreSQL 是业务状态唯一事实源，BullMQ 只承担运输和退避。

2026-09-12 再次全仓 Review 发现，现实现仍把两种不同生命周期的 attempt 混用：

- PostgreSQL `BacktestJob.executionAttempt` 会跨 Worker、进程重启和 BullMQ 记录重建长期保留；
- BullMQ `job.attemptsMade + 1` 只属于当前运输记录，记录被删除并用同一 jobId 重建后会重新从 1 开始。

旧 processor 把 BullMQ 本地 attempt 直接传给 V1/V2 Service，并以 `executionAttempt < attempt` 领取数据库任务。与此同时，协调器会把失联的 `running` 任务重新排为 `queued`，`ensureEnqueued()` 会删除 `completed/failed` 的旧运输记录后重新创建。于是可能形成确定性恢复活锁：数据库已是 attempt=1，新运输记录仍从 attempt=1 开始，数据库领取条件失败，processor 正常返回，BullMQ 再次 completed，下一轮继续重复。

同一 Review 还确认两个相关缺口：

1. BullMQ `failed` callback 在运输尝试耗尽时可直接把任意 `queued/running` 数据库任务写成 failed，没有 durable owner fencing；
2. reconciler 固定只读取最老 100 个非终态任务，超过 100 条积压时后续任务没有有界覆盖保证。

## 目标

1. 将回测任务的投递、执行、有限重试和恢复所有权收口到服务端。
2. 使用独立 BullMQ Worker 隔离 API 与 CPU 密集型回测，PostgreSQL 继续作为任务状态唯一事实源。
3. `BacktestJob.executionAttempt` 作为跨运输记录、跨 Worker 的 durable owner version，BullMQ attempt 只作为 transport metadata。
4. 保证创建、取消、重试、进程重启、运输记录重建和 Redis 短暂故障最终收敛到可信终态，不产生重复成功结果或恢复活锁。
5. 任何成功、失败、取消或恢复写入都不能由 stale owner 覆盖更新后的 owner。
6. reconciler 对全部非终态任务提供有界覆盖，不因前 100 条长期存在而饿死后续任务。
7. 通过轻量摘要、SSE 和低频事实源兜底消除高频完整列表轮询及其 429。
8. 保持现有 V1 完整任务查询和运行入口兼容，不改变回测引擎计算语义；V2 只复用本 Spec 的共享运输可靠性，不把 V2 引擎语义纳入本 Spec。

## 非目标

- 不重写 Backtest V2 的 Snapshot、Artifact、Runner 或 SimulationLedger。
- 不修改策略 Schema、行情获取、回测计算规则、收益指标或结果结构。
- 不新增数据库 owner 字段；优先复用现有 `BacktestJob.executionAttempt`。
- 不引入无限重试、自动扩大并发或 API 进程同步降级执行。
- 不承诺 running 取消后立即停止 CPU；V1 采用协作式取消。
- 不把 BullMQ 内部状态当作用户可见业务事实。
- 不引入通用 Job Framework，也不合并 AiRun/AutomationRun 与 BacktestJob 生命周期。

## 现状与约束

- `BacktestJob` 已持久化 `executionAttempt`、派发时间、结构化错误、输入、结果与进度。
- Redis 已由平台提供并启用 AOF；BullMQ 负责运输，但不能成为业务 owner version 的事实源。
- V1 同步引擎必须在 sandbox processor 中运行，避免阻塞 BullMQ 父 Worker 锁续期和 API 事件循环。
- V2 Run 也通过同一 processor/queue/reconciler 进入 `BacktestV2RunService`，因此共享 durable owner 语义必须对 V1/V2 一致。
- `/backtests` 属于 heavy API，同一 IP、同一 HTTP 方法每分钟共享 20 次额度。
- Electron 生产代理需要流式转发 SSE。
- Compose 和镜像部署属于同级 `thesis-ledger-infra` 仓库；主仓保存应用实现与跨仓契约。

## 设计方案

### 任务事实与投递

PostgreSQL `BacktestJob` 是业务状态唯一事实源。BullMQ 队列名为 `backtest-v1`，消息只包含 `jobId`，并使用 `BacktestJob.id` 作为 BullMQ `jobId`。bars、策略版本、Snapshot 和结果不复制到 Redis。

创建接口先保存数据库任务，再尝试幂等投递。Redis 不可用时任务保留为 `queued`，写入可解释的暂时派发错误并正常返回。协调器在 Server 启动时执行一次，之后每 15 秒扫描数据库非终态任务并与 BullMQ 状态核对：

- 缺失的 queued 任务重新投递；
- 缺失或运输记录已终态的 running 任务，在 durable executionAttempt 小于 3 时以 `status + executionAttempt` fencing 重新排为 queued；
- durable executionAttempt 达到上限时，以 `status + executionAttempt` fencing 收敛为 failed；
- BullMQ 中仍存在 waiting/delayed/active 等非终态记录时不抢占当前 owner；
- succeeded、failed、cancelled 任务永不重新投递。

现有 `POST /backtests/jobs/:id/run` 保持幂等“确保派发”语义，立即返回数据库当前任务，不在 API 进程运行引擎。

### Durable ownerAttempt

`BacktestJob.executionAttempt` 是数据库 durable owner version，而不是 BullMQ 本地 attempt 的镜像。

processor 每次真正执行前先读取 PostgreSQL：

1. 任务必须仍为 `queued`、未取消、未终态；
2. `executionAttempt >= 3` 时直接按当前版本条件收敛为 `worker_attempts_exhausted`；
3. 否则本次候选 owner 为 `executionAttempt + 1`；
4. Service 继续以原子条件更新领取：任务仍可领取且数据库 attempt 小于候选 owner 时，写入 `running` 和新 ownerAttempt；
5. 并发 processor 即使同时计算出同一个候选值，也只有一个能成功领取；另一个不能抢占已经 `running` 的 owner。

例如旧 owner=1 的 Worker 硬退出后，协调器把 DB 重新排成 queued。即使旧 BullMQ 记录被删除、新运输记录的 `attemptsMade` 重新从 0 开始，processor 仍从数据库计算 ownerAttempt=2，而不是再次提交 1，因此不会进入 queued/completed 恢复活锁。

BullMQ `attemptsMade` 只用于 transport backoff、日志和诊断，不参与数据库领取、终态 fencing 或全局三次执行预算。

### Worker 与执行状态机

独立 `backtest-worker` 进程使用同一镜像、数据库和 Redis。BullMQ 父 Worker 默认并发为 1；同步 CPU 回测在 sandbox processor 中运行，使父进程可以维持锁和健康心跳。

业务执行最多使用 3 个 durable ownerAttempt。确定性输入或 Schema 错误不进入后续业务执行；进程中断和暂时性基础设施错误允许有限恢复。

结果提交必须同时满足：

- 任务仍为 `running`；
- 当前数据库 `executionAttempt` 等于本次 ownerAttempt；
- 没有取消请求。

暂时失败重新排队、最终失败、确定性失败、取消确认与成功提交都必须使用 ownerAttempt 条件保护。旧 owner、重复消息或取消后的成功结果不能覆盖当前状态。

BullMQ 父 Worker 的 `failed` 事件只记录 transport telemetry，不再直接写数据库业务终态。业务 failed 必须由 Service 的 owner-fenced 状态机或 reconciler 的当前版本条件更新产生。

### Reconciler 有界覆盖

reconciler 使用稳定键 `(createdAt, id)` 做 keyset pagination，每页最多 100 条，并在一次 reconcile 中继续读取后续页，直到当前非终态集合完成一轮覆盖。

要求：

- 第 101 条及之后的 queued/running 任务必须在同一轮或有界后续轮次被访问；
- 不允许固定扫描最老 100 条导致后续任务永久饥饿；
- 状态更新使用 `status + executionAttempt` 条件，扫描期间 owner 已变化时更新 0 行并放弃该 stale 决策；
- Redis 查询失败时不能把 running 误判为 Worker 中断。

### 取消

- queued：数据库原子进入 `cancelled`，并尽力移除 waiting/delayed BullMQ job；处理器即使随后收到消息也只确认终态，不执行引擎。
- running：写入 `cancelRequestedAt`，状态暂时保持 `running`，Desktop 派生显示“正在取消”。Worker 在回测安全边界重新读取数据库并确认 `cancelled`，不得提交成功结果。
- Worker 在取消请求后重启时，新 transport 不能继续计算；数据库 owner 条件仍是最终正确性来源。
- 取消接口幂等；终态任务保持原终态。

### 状态事件与读取模型

`BacktestJobSummary` 只包含任务列表需要的标识、策略版本、状态、进度、区间、初始资金、时间、执行次数、派发时间、取消请求、引擎、checksum、warnings 和公开错误，不包含 `input` 或 `result`。`initialCash` 在服务端从持久化输入投影为独立摘要字段，客户端不需要下载 bars。

`GET /backtests/jobs/summary` 返回最近 100 条摘要。现有 `GET /backtests/jobs` 与 `GET /backtests/jobs/:id` 保持完整响应兼容，结果仅在用户打开详情时读取。

`/backtests/events` SSE 只在数据库状态提交成功后，通过 Redis Pub/Sub 发布完整摘要；SSE 不转发未持久化的 BullMQ 瞬时状态。连接每 20 秒发送心跳并建议 10 秒重连。Redis Pub/Sub 不承担事件回放：Desktop 在首次连接和重连时读取一次摘要；存在非终态任务时每 30 秒兜底读取，全部终态后停止兜底。

Desktop 在 Strategy 页面只建立一个 SSE 连接，收到事件后按 jobId 更新 TanStack Query 摘要缓存，不为每条事件额外发请求。429 响应遵守 `Retry-After`，不得立即重试。Electron 生产代理必须流式转发 SSE，并在下游断开时取消上游请求。

### 健康与可观测性

Worker 每 15 秒写入 Redis 心跳，TTL 为 45 秒。镜像提供只读 Worker 健康检查入口，Compose 以该心跳判断 Worker 健康。

日志区分：

- `transportAttempt`：BullMQ 当前运输记录的局部 attempt；
- `executionAttempt` / ownerAttempt：PostgreSQL durable 业务 owner version。

API 与 Worker 不记录 bars、结果正文或敏感配置。

## 对外行为或接口变化

- `GET /api/v1/backtests/jobs/summary`、`GET /api/v1/backtests/events` SSE 保持现有契约。
- `POST /api/v1/backtests/jobs/:id/run` 保持幂等派发语义。
- `POST /api/v1/backtests/jobs/:id/cancel` 保持幂等；running 任务可能短暂返回带 `cancelRequestedAt` 的 `running`。
- Desktop 任务列表继续使用摘要，结果详情按 ID 读取。
- 本次 durable owner 修复不修改公开 HTTP/Schema，也不需要新增数据库 migration。

## 数据、状态或兼容性影响

继续复用现有字段：

- `executionAttempt Int @default(0)`：现在明确为 durable owner version；
- `dispatchedAt DateTime?`
- `errorCode String?`
- `errorSummary String?`

不新增 owner 列。既有迁移与 V1 历史数据保持不变。

稳定错误码至少包括：

- `queue_temporarily_unavailable`
- `worker_attempt_failed`
- `worker_attempts_exhausted`
- `legacy_execution_incomplete`
- 确定性 Schema 或输入错误码

## 测试策略

### 关键可观察行为

- 创建任务后即使 Desktop 离开，Worker 也能独立推进到终态。
- Redis 短暂不可用不会丢失已创建任务；恢复后自动补投。
- post-claim Worker 中断后，无论 BullMQ 运输记录是原地 retry 还是删除重建，下一次数据库 owner 都单调增加。
- BullMQ 新记录本地 attempt 重置不会重置 PostgreSQL 全局三次业务执行预算。
- 旧 owner 的迟到 success/failure/cancel 不能覆盖新 owner。
- 仍处于 running 的 owner 不会被重复 transport 抢占。
- 超过 100 条非终态任务时，第 101 条及后续任务仍会被 reconcile。
- queued/running 取消符合协作式语义，成功结果不能覆盖取消。
- 摘要与 SSE 不泄漏 input/result，完整接口保持兼容。
- Strategy 页面在正常任务运行期间不触发 429。

### 优先测试层级

1. Server durable owner/reconciler 状态机行为测试。
2. V1/V2 共享 transport recreation 回归。
3. BullMQ + Redis + PostgreSQL 的进程级集成与 post-claim hard-kill smoke。
4. Desktop TanStack Query、SSE 和 Electron 流代理测试。
5. Compose 重启、补投、取消和真实浏览器验收。

### 可复用的现有测试入口

- Server backtest service/controller、V2 lifecycle、取消、checksum 和 old-owner 提交测试。
- Desktop `refactor-contract`、Strategy UI 和 API client 测试。
- 现有 migration matrix、PostgreSQL service E2E、Docker build、数据库集成和 V1/V2 smoke。

### 2026-09-12 新增回归

- `durable-owner-recovery.test.ts`：覆盖 V1 与 V2 在数据库 `executionAttempt=1`、运输记录重新从本地 attempt=1 开始时，仍从 PostgreSQL 派生 ownerAttempt=2 并成功执行；同时验证 running owner 不被重复运输记录抢占。
- `reconciler.test.ts`：覆盖 101 条非终态任务的分页扫描，明确验证第 101 条进入投递处理。
- 全量 CI 必须继续通过 lint、typecheck、tests、build、migration matrix、PostgreSQL service E2E、contract tests、complexity guardrails 和 Android native build。

## 风险与备选方案

- PostgreSQL 与 Redis 无跨库事务。以数据库为事实源、稳定 jobId、durable ownerAttempt 和协调器补投关闭双写窗口，不引入额外 Outbox 表。
- Redis Pub/Sub 会丢失离线事件。重连读取和 30 秒事实源兜底保证最终一致，不把 Pub/Sub 当审计日志。
- V1 同步引擎无法立即响应跨进程取消。通过 sandbox 隔离、取消请求和条件终态提交保证语义正确；硬终止属于运行态故障注入，不改变 owner 契约。
- BullMQ transport retries 与 PostgreSQL execution attempts 不再要求一一对应；日志必须显式区分两者，避免后续再次混用。

## 未决问题

### Blocking

无代码 Blocking 问题。

### 部署验证门禁

仍需在目标 Compose 环境执行一次“任务已 claimed/running 后硬杀 Worker → transport 恢复/重建 → durable ownerAttempt 递增 → 唯一终态”的真实 smoke。该门禁验证部署与进程级恢复，不用于否定已经通过自动化回归的代码修复，也不能由单元测试伪报完成。

## 验收标准

- **AC1：**创建任务只向 BullMQ 传递 jobId，Desktop 不再负责启动，独立 Worker 能将任务推进到唯一可信终态。
- **AC2：**Redis/Worker 短暂故障和重复投递可自动恢复；最多 3 次 durable execution attempts，耗尽后写入结构化失败且不存在永久非终态。
- **AC3：**queued/running 取消均幂等，取消或旧 owner 后的结果不能覆盖当前终态。
- **AC4：**部署前遗留非终态任务迁移为 `legacy_execution_incomplete` failed，并保留原始数据。
- **AC5：**摘要接口和 SSE 不包含 input/result；完整列表、详情及 `/run` 路径保持兼容。
- **AC6：**Desktop 使用单一 SSE 连接和 30 秒事实源兜底，结果按需加载，正常运行期间不触发 429。
- **AC7：**Electron 生产代理可以持续流式转发 SSE，断开时释放上游连接。
- **AC8：**独立 Worker 默认并发 1，具有 15 秒/45 秒健康心跳，并在开发和生产 Compose 中接受健康检查。
- **AC9：**自动化与 Compose 验证覆盖投递、补投、重试、重启、取消、终态保护、SSE 和兼容接口；Server、Desktop、迁移、构建及边界门禁通过。
- **AC10：**`BacktestJob.executionAttempt` 是 PostgreSQL durable owner version；BullMQ 运输记录删除/重建后本地 attempt 可重置，但下一业务 owner 必须从数据库单调增加。V1/V2 success/retry/failure 均按 ownerAttempt fencing，stale owner 不能覆盖新 owner。
- **AC11：**reconciler 对超过 100 条 queued/running 任务提供有界全量覆盖，状态写入按当前 `status + executionAttempt` fencing；Redis 查询失败或扫描期间 owner 变化不得产生错误恢复决策。
