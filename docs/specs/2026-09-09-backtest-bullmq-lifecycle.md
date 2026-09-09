# V1 回测任务 BullMQ 生命周期 Spec

## 背景与问题

当前 V1 回测采用客户端驱动的两段式执行：Desktop 先创建 `queued` 的 `BacktestJob`，再调用运行接口让 Server 进程同步执行回测。客户端中断、运行请求未发出或 Server 重启时，任务会永久停留在非终态。Desktop 只要发现任意非终态任务，就每 1.5 秒读取最近 100 条完整任务；该响应包含 bars 输入和结果，既放大网络与反序列化成本，也会超过 heavy GET 每分钟 20 次的限流额度并触发 HTTP 429。

## 目标

1. 将 V1 回测任务的投递、执行、有限重试和恢复所有权收口到服务端。
2. 使用独立 BullMQ Worker 隔离 API 与 CPU 密集型回测，PostgreSQL 继续作为任务状态唯一事实源。
3. 保证创建、取消、重试、进程重启和 Redis 短暂故障最终收敛到可信终态，不产生重复成功结果。
4. 通过轻量摘要、SSE 和低频事实源兜底消除高频完整列表轮询及其 429。
5. 保持现有 V1 完整任务查询和运行入口兼容，不改变回测引擎计算语义。

## 非目标

- 不实施 Backtest V2 的 `BacktestRun`、Snapshot、Artifact、Runner 或 Simulation Ledger。
- 不修改策略 Schema、行情获取、回测计算规则、收益指标或结果结构。
- 不引入无限重试、自动扩大并发或 API 进程同步降级执行。
- 不承诺 running 取消后立即停止 CPU；V1 采用协作式取消。
- 不把 BullMQ 内部状态当作用户可见业务事实。

## 现状与约束

- `BacktestJob` 已持久化输入、结果、进度和基础时间字段，但没有派发状态、执行次数或结构化错误。
- Redis 已由平台提供并启用 AOF；Server 当前只有 `ioredis`，没有 BullMQ。
- V1 引擎同步执行，必须避免阻塞 BullMQ 的锁续期和 API 事件循环。
- `/backtests` 属于 heavy API，同一 IP、同一 HTTP 方法每分钟共享 20 次额度。
- Electron 生产代理当前缓存完整上游响应，不能直接转发长连接。
- Compose 和镜像部署属于同级 `thesis-ledger-infra` 仓库；主仓只保存应用实现与跨仓契约。

## 设计方案

### 任务事实与投递

PostgreSQL `BacktestJob` 是业务状态唯一事实源。BullMQ 队列名为 `backtest-v1`，消息只包含 `jobId`，并使用 `BacktestJob.id` 作为 BullMQ `jobId`。bars、策略版本和结果不复制到 Redis。

创建接口先保存数据库任务，再尝试幂等投递。Redis 不可用时任务保留为 `queued`，写入可解释的暂时派发错误并正常返回。协调器在 Server 启动时执行一次，之后每 15 秒扫描数据库非终态任务并与 BullMQ 状态核对：

- 缺失的 queued 任务重新投递；
- 缺失的 running 任务在执行次数小于 3 时重新排队，达到上限时标记失败；
- BullMQ 中已存在同名 jobId 视为投递成功；
- succeeded、failed、cancelled 任务永不重新投递。

现有 `POST /backtests/jobs/:id/run` 改为幂等“确保派发”接口，立即返回数据库中的当前任务，不在 API 进程运行引擎。

### Worker 与执行状态机

独立 `backtest-worker` 进程使用同一镜像、数据库和 Redis。BullMQ 父 Worker 默认并发为 1；同步 CPU 回测在 sandbox processor 中运行，使父进程可以维持锁和健康心跳。

BullMQ 每个任务最多尝试 3 次，使用 2 秒起指数退避。完成的运输记录保留 24 小时且最多 1000 条，失败记录保留 7 天且最多 1000 条。执行器以 BullMQ attempt 编号原子领取数据库任务，并写入 `running`、真实开始时间和执行次数。确定性输入或 Schema 错误不重试；进程中断和暂时性基础设施错误允许有限重试。

结果提交必须同时满足：任务仍为 `running`、当前数据库执行次数与 attempt 一致、没有取消请求。晚到 attempt、重复消息或取消后的成功结果不能覆盖当前状态。最终失败写入稳定错误码和用户可读摘要；详细堆栈只进入结构化日志。

### 取消

- queued：数据库原子进入 `cancelled`，并尽力移除 waiting/delayed BullMQ job；处理器即使随后收到消息也只确认终态，不执行引擎。
- running：写入 `cancelRequestedAt`，状态暂时保持 `running`，Desktop 派生显示“正在取消”。Worker 在回测安全边界重新读取数据库并确认 `cancelled`，不得提交成功结果。
- Worker 在取消请求后重启时，新 attempt 直接确认取消，不继续计算。
- 取消接口幂等；终态任务保持原终态。

### 状态事件与读取模型

新增 `BacktestJobSummary`，只包含任务列表需要的标识、策略版本、状态、进度、区间、初始资金、时间、执行次数、派发时间、取消请求、引擎、checksum、warnings 和公开错误，不包含 `input` 或 `result`。`initialCash` 在服务端从持久化输入投影为独立摘要字段，客户端不需要下载 bars。

新增 `GET /backtests/jobs/summary` 返回最近 100 条摘要。现有 `GET /backtests/jobs` 与 `GET /backtests/jobs/:id` 保持完整响应兼容，结果仅在用户打开详情时读取。

新增 `/backtests/events` SSE。API 和 Worker 仅在数据库状态提交成功后，通过 Redis Pub/Sub 发布完整摘要；SSE 不转发未持久化的 BullMQ 瞬时状态。连接每 20 秒发送心跳并建议 10 秒重连。Redis Pub/Sub 不承担事件回放：Desktop 在首次连接和重连时读取一次摘要；存在非终态任务时每 30 秒兜底读取，全部终态后停止兜底。

Desktop 在 Strategy 页面只建立一个 SSE 连接，收到事件后按 jobId 更新 TanStack Query 摘要缓存，不为每条事件额外发请求。429 响应遵守 `Retry-After`，不得立即重试。Electron 生产代理必须流式转发 SSE，并在下游断开时取消上游请求。

### 健康与可观测性

Worker 每 15 秒写入 Redis 心跳，TTL 为 45 秒。镜像提供只读 Worker 健康检查入口，Compose 以该心跳判断 Worker 健康。API 与 Worker 结构化日志记录队列名、jobId、attempt、阶段、耗时、错误码和终态，不记录 bars、结果正文或敏感配置。

## 对外行为或接口变化

- 新增 `GET /api/v1/backtests/jobs/summary`。
- 新增 `GET /api/v1/backtests/events` SSE。
- `POST /api/v1/backtests/jobs/:id/run` 保留路径和完整任务响应，但语义从同步执行改为幂等派发。
- `POST /api/v1/backtests/jobs/:id/cancel` 保持幂等；running 任务可能短暂返回带 `cancelRequestedAt` 的 `running`。
- Desktop 任务列表改用摘要，结果详情改为按 ID 读取。

## 数据、状态或兼容性影响

`BacktestJob` 新增以下字段：

- `executionAttempt Int @default(0)`
- `dispatchedAt DateTime?`
- `errorCode String?`
- `errorSummary String?`

迁移将部署前遗留的 queued/running 任务一次性标记为 failed，设置 `progress=100`、`finishedAt` 和 `legacy_execution_incomplete`，不删除或覆盖输入、结果及历史记录。

空卷初始化按 current baseline、既有 MarketBar 增量、Backtest 生命周期增量、app role 授权的顺序执行；已有卷必须在受控部署窗口由 owner 应用新增迁移，应用容器和更新流程不自动删除或重建外部卷。

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
- 重复投递、Worker 重启和晚到结果不会产生第二个成功事实。
- 三次暂时性失败后任务进入带解释的 failed。
- queued/running 取消符合协作式语义，成功结果不能覆盖取消。
- 摘要与 SSE 不泄漏 input/result，完整接口保持兼容。
- Strategy 页面在正常任务运行期间不触发 429。

### 优先测试层级

1. Server HTTP 与持久化状态机行为测试。
2. BullMQ + Redis + PostgreSQL 的进程级集成测试。
3. Desktop TanStack Query、SSE 和 Electron 流代理测试。
4. Compose 重启、补投、取消和真实浏览器验收。

### 可复用的现有测试入口

- Server backtest service/controller 测试及并发运行、取消、checksum 覆盖。
- Desktop `refactor-contract`、Strategy UI 和 API client 测试。
- 现有 migration matrix、Docker build、数据库集成和 V1 E2E smoke。

### 需要新增的测试入口

- BullMQ 投递器、协调器、processor 与 Worker 健康测试。
- SSE 订阅与 Electron 流式代理测试。
- Worker/Redis 故障注入 Compose smoke。

## 风险与备选方案

- PostgreSQL 与 Redis 无跨库事务。以数据库为事实源、稳定 jobId 和协调器补投关闭双写窗口，不引入额外 Outbox 表。
- Redis Pub/Sub 会丢失离线事件。重连读取和 30 秒事实源兜底保证最终一致，不把 Pub/Sub 当审计日志。
- V1 同步引擎无法立即响应跨进程取消。通过 sandbox 隔离、取消请求和条件终态提交保证语义正确；硬终止留给后续独立设计。
- BullMQ 增加部署复杂度，但相比 API 同进程执行可以隔离 CPU，并为未来替换 V1 Runner 保留稳定队列边界。

## 未决问题

### Blocking

无。

### Non-blocking

无。

## 验收标准

- AC1：创建任务只向 BullMQ 传递 jobId，Desktop 不再负责启动，独立 Worker 能将任务推进到唯一可信终态。
- AC2：Redis/Worker 短暂故障和重复投递可自动恢复；最多 3 次尝试，耗尽后写入结构化失败且不存在永久非终态。
- AC3：queued/running 取消均幂等，取消或旧 attempt 后的结果不能覆盖当前终态。
- AC4：部署前遗留非终态任务迁移为 `legacy_execution_incomplete` failed，并保留原始数据。
- AC5：摘要接口和 SSE 不包含 input/result；完整列表、详情及 `/run` 路径保持兼容。
- AC6：Desktop 使用单一 SSE 连接和 30 秒事实源兜底，结果按需加载，正常运行期间不触发 429。
- AC7：Electron 生产代理可以持续流式转发 SSE，断开时释放上游连接。
- AC8：独立 Worker 默认并发 1，具有 15 秒/45 秒健康心跳，并在开发和生产 Compose 中接受健康检查。
- AC9：自动化与 Compose 验证覆盖投递、补投、重试、重启、取消、终态保护、SSE 和兼容接口；Server、Desktop、迁移、构建及边界门禁通过。
