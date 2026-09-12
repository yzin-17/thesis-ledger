# 自动化执行耐久身份、租约与恢复加固

> 日期：2026-09-05  
> 更新：2026-09-12  
> 状态：Implemented，待最终 CI 与目标进程级 smoke  
> 来源：PR #32 全仓架构 Review；按 PR #33 已落地的 durable owner 原则收敛

## 1. 背景

Automation 当前承载行情同步、风险评估、日报、估值采样、组合快照、备份、Provider 健康检查、定期现金入账与基金定投等后台任务。旧实现以 Redis `SET NX PX(lockTtlMs)` 作为执行互斥，但固定 TTL 既不是可续租的数据库 owner，也不能保证 handler 在 TTL 到期时停止；多数 handler 也不会主动响应 `AbortSignal`。

因此旧实现存在两个正确性缺口：

1. 长任务超过 Redis TTL 后，另一实例可能再次执行同一计划时点；
2. scheduled occurrence 没有数据库耐久身份，Redis 锁失效后数据库无法判定“这是同一次计划执行”。

PR #33 已在 Backtest 中固化项目原则：**PostgreSQL owner version 是耐久执行所有权，运输层/进程局部状态不能作为 owner。** 本 Spec 将 Automation 对齐这一原则，但不建立通用 Job Framework。

## 2. 目标

1. 同一 Automation Job 的同一 scheduled occurrence 只有一个 canonical run。
2. PostgreSQL 是 occurrence、ownerAttempt、lease 与 recovery 的唯一正确性来源。
3. `executionAttempt` 每次重新 claim 单调递增；旧 owner 无法覆盖新 owner 的终态。
4. 执行中通过数据库 heartbeat 续租；进程崩溃后可以确定性判断后续处理。
5. 只有明确可安全重放的 handler 自动 recovery；无法证明副作用幂等时进入 `unknown_outcome`，禁止盲目重放。
6. 手动 `run-now` 与 cron scheduled occurrence 分离，不伪造 `scheduledAt`。
7. 服务停机期间不逐 tick 补跑 cron；需要 catch-up 的业务由自身幂等 occurrence/materialize 逻辑处理。
8. 保持现有 Automation HTTP API、job type、history 主体结构与 cron/timezone 行为兼容。

## 3. 非目标

- 不引入 BullMQ、Command Bus、Saga 或新的通用任务框架。
- 不把 `AiRun`、`BacktestJob` 与 `AutomationRun` 合表。
- 不要求所有业务 handler 在本轮完成 AbortSignal 传播。
- 不尝试通过数据库 run 状态撤销已经发生的外部副作用。
- 不逐分钟回放服务器停机期间错过的 cron occurrence。

## 4. 数据模型

### 4.1 `AutomationRun` 保持公开运行历史

现有 `AutomationRun` 继续承载：

- `status`
- `startedAt / finishedAt`
- handler 内部 `attempt`
- `traceId`
- `output / error`

不把内部 lease 字段直接扩进公开历史模型，避免将执行控制元数据与客户端历史 contract 强耦合。

### 4.2 新增 raw-owned `AutomationRunLease`

生命周期元数据由 Automation 专属 raw-owned 表持有：

- `runId`：一对一关联 `AutomationRun`；
- `jobId`；
- `trigger`：`scheduled | manual | legacy`；
- `scheduledAt`：仅 scheduled occurrence 有值；
- `executionAttempt`：durable owner version；
- `claimedAt`；
- `leaseUntil`；
- `recoveryPolicy`：`replay-safe | unknown-outcome`；
- `recoveryReason`。

使用 PostgreSQL 部分唯一索引保证：

```text
(jobId, scheduledAt) UNIQUE
WHERE trigger = 'scheduled' AND scheduledAt IS NOT NULL
```

使用 raw-owned 表而不是 Prisma model，是因为该生命周期需要部分唯一索引、显式 `FOR UPDATE` 与 advisory transaction lock；与当前 Strategy Optimization raw-owned 表的工程约定一致。

## 5. Scheduled occurrence-first 调度

Scheduler 读取到 `job.nextRunAt <= now` 后：

1. 以数据库中的 `job.nextRunAt` 作为本次 `scheduledAt`；
2. 先幂等登记 scheduled occurrence；
3. 同一事务/所有权边界内推进 `nextRunAt`；
4. 再对 canonical run claim；
5. claim 成功才调用 handler。

`nextRunAt` 的下一值按当前调度时刻 `now` 计算，因此服务停机两小时后只处理当前已到期 occurrence，不逐分钟补 120 个历史 tick。`cash-deposit-materialization`、`fund-investment-materialization` 等业务本身按到期范围补齐，负责业务级 catch-up。

## 6. Gate skip 不制造无意义历史

市场休市、估值采样 gate 不通过时：

- CAS 推进 `AutomationJob.nextRunAt`；
- 不创建 `AutomationRun`；
- 不产生大量 `skipped` 历史记录。

这对每分钟执行的估值采样尤为重要，避免休市期间持续写入无业务价值的 run。

## 7. Durable claim 与 owner fencing

claim 必须在 PostgreSQL 中完成：

```text
queued
  -> executionAttempt + 1
  -> running
  -> claimedAt / leaseUntil
```

Worker 持有本次 `ownerAttempt`。以下写操作都必须验证当前 owner：

- heartbeat；
- handler retry attempt 记录；
- succeeded；
- failed。

若 run 已被 recovery 并由新 worker claim，旧 worker 即使稍后返回，也不能覆盖新 owner 的状态或结果。

### 7.1 两层 attempt 不混用

- `AutomationRun.attempt`：单次 owner 内 handler 的短失败 retry 次数；
- `AutomationRunLease.executionAttempt`：Worker/进程级 durable owner 次数。

两者用途不同，不能互相推导。

## 8. Lease heartbeat

`lockTtlMs` 保持现有配置字段，当前解释为数据库 lease duration。

运行期间按约 `lease / 3` heartbeat：

- 仅当前 `ownerAttempt` 可以续租；
- heartbeat 失败或 owner 丢失时触发本地 AbortController，并禁止旧 owner 提交终态；
- handler 是否立即停止不是正确性前提，最终数据库状态仍由 owner fencing 保证。

Redis 不再参与 Automation 执行所有权或 lease 正确性；保留 RedisService 构造注入仅用于兼容当前模块 wiring，后续可单独清理。

## 9. Handler-aware recovery

数据库 lease 过期不等于“业务完全没执行”。因此禁止统一自动重跑所有 Automation。

### 9.1 `replay-safe`

仅明确具备幂等/安全重放边界的 scheduled handler 自动恢复：

- `market-sync`；
- `provider-health`；
- `cash-deposit-materialization`；
- `fund-investment-materialization`。

其中定期现金与基金定投本身有业务 occurrence 唯一键；行情同步以市场数据唯一键/upsert 收敛。Provider health 重复检查只增加审计样本，不产生投资事实副作用。

恢复规则：

```text
running + lease expired + executionAttempt < 3
  -> queued
  -> 下一次 claim 得到 executionAttempt + 1
```

达到 owner recovery 上限后确定失败。

### 9.2 `unknown-outcome`

无法证明自动重放绝对安全的任务，包括 snapshot、risk evaluation、digest、backup 等，在 lease 过期后进入：

```text
unknown_outcome
```

不会自动重跑。该状态明确表达“进程失联后无法证明副作用是否已经发生”，避免为了恢复运行状态制造重复业务副作用。

所有 manual `run-now` 默认采用 `unknown-outcome`，因为它不是 cron occurrence，也不应在进程崩溃后由 scheduler 自动重放。

## 10. 历史数据迁移

旧 `AutomationRun` 无法可靠判断当时是 manual 还是 scheduled，因此迁移不得伪造 `scheduledAt`。

历史 run 统一登记为 `trigger=legacy`；历史非终态 run 使用 `unknown-outcome` 策略。部署后 reconciler 会保守终结旧 running 状态，而不会自动再次执行未知副作用。

## 11. Scheduler recovery

每轮 scheduler 在扫描新 due job 前：

1. 扫描 lease 已过期的 `running`；
2. 按 recovery policy 转为 `queued / failed / unknown_outcome`；
3. 对 queued canonical run 尝试 claim/resume；
4. 再扫描新的 `nextRunAt <= now` 任务。

多实例可以同时进入 reconcile；最终 claim 与 completion 仍由 PostgreSQL row lock + ownerAttempt 收敛。

## 12. 测试与工程门禁

仓库验证覆盖：

- 同一 `jobId + scheduledAt` 只生成一个 canonical run；
- replay-safe lease 过期后 ownerAttempt `1 -> 2`；
- owner 1 无法覆盖 owner 2；
- unknown-outcome lease 过期后不会自动 replay；
- recovery 达到上限后确定失败；
- manual/scheduled policy 分离；
- 真实 PostgreSQL 并发 reserve 与 owner fencing；
- migration matrix；
- lint / typecheck / full tests / build / contract / complexity。

## 13. 验收标准

- [x] scheduled occurrence 具备 PostgreSQL 唯一身份。
- [x] Redis TTL 不再是 Automation 执行正确性来源。
- [x] claim / heartbeat / completion 使用 durable ownerAttempt fencing。
- [x] stale old owner 无法覆盖新 owner。
- [x] manual 与 scheduled lifecycle 分离。
- [x] missed cron 不逐 tick backfill。
- [x] gate skip 不制造高频无意义 run。
- [x] recovery 根据 handler 安全属性区分 replay-safe / unknown-outcome。
- [x] 历史 running migration fail closed，不自动重放。
- [x] 增加 unit 与 PostgreSQL integration 验证。
- [ ] PR 最终 HEAD CI 全绿。
- [ ] 目标 Compose 做一次真实“claim 后硬杀进程 → recovery” smoke；该项属于运行环境验收，不用单元测试冒充。
