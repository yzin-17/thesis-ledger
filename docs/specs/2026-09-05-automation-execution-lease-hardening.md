# 自动化执行租约与调度幂等加固

> 日期：2026-09-05  
> 状态：Draft  
> 来源：2026-09-05 当前 `main` 全仓架构 Review

## 1. 背景与本轮全仓 Review 证据

本轮重新以当前 `main` 的全仓状态为审查对象，而不是延续最近 PR 的遗留清单。审查范围覆盖：

- `apps/server` 的 Ledger、Portfolio、Risk、Performance、Automation、AI、Imports、Cash Plans、Market、Provider、Notification、Backtest、Journal 与 Platform；
- `apps/desktop`、`apps/mobile` 的 feature/API 调用边界；
- `packages/domain`、`packages/schemas`、`packages/api-client`、`packages/shared`；
- `services/dsa-adapter`；
- Prisma schema/migrations、Server tests、scripts、workspace 依赖守卫、CI；
- `docs/specs`、`docs/tasks`、`docs/architecture` 与近期已完成架构加固文档。

最近 PR #25–#31 仅用于确认哪些问题已经实施，不作为本轮审查边界。Ledger/Portfolio 原子复合命令、Risk/Performance 拆分、workspace runtime graph guard、旧 Ledger 通用写入口收口和 Server module boundary SSOT 已在当前 `main` 落地，因此本轮不重复制造相同方案。

本轮优先级最高的新发现位于 Automation 的执行生命周期。

### 1.1 当前 Automation 锁不是可续租的执行租约

`AutomationService.execute()` 当前通过 Redis `SET NX PX` 获取 `lock:automation:<jobId>`，TTL 固定为 `AutomationJob.lockTtlMs`。任务执行期间没有 heartbeat/renew；结束时仅通过 token 比对安全删除自身仍持有的锁。

这可以避免“锁释放误删新 owner”，但不能避免锁自然过期后出现第二个 owner。

### 1.2 现有 handler 实际不响应超时信号

`AutomationService.execute()` 传入 `AbortSignal.timeout(job.lockTtlMs)`，但 `AutomationRuntimeHandlers` 中当前所有 handler 都将该参数写成 `_signal`，且没有把 signal 传入 Market、Risk、Snapshot、Backup、Provider Health 或 Cash Deposit 的下游调用。

因此 `lockTtlMs` 不是实际执行 deadline。任务可能在 TTL 到期后继续运行。

### 1.3 多实例下存在重复执行窗口

当任务执行时间超过 `lockTtlMs`：

1. 实例 A 的 Redis 锁过期；
2. A 的 handler 仍继续执行；
3. 实例 B 的 scheduler 再次扫描到同一 `nextRunAt <= now` 的任务；
4. B 成功获取同一 Redis key 并启动第二个 `AutomationRun`；
5. A/B 可并发执行同一个 scheduled occurrence。

对只读健康检查影响有限，但对 `snapshot`、`backup`、`cash-deposit-materialization`、未来任何有副作用的 Automation 都属于正确性风险。

### 1.4 Scheduled occurrence 没有耐久身份

`AutomationRun` 当前只有 `jobId/status/startedAt/finishedAt/attempt/traceId/output/error`，没有：

- `scheduledAt` / occurrence key；
- durable claim owner；
- `leaseUntil`；
- recovery reason；
- 唯一约束来阻止同一 scheduled occurrence 被创建多个 run。

因此 Redis 锁一旦失效，数据库层没有第二道幂等保护。

### 1.5 同仓库已经存在更完整的租约语义

`AiRun` 已具备 `claimedAt`、`leaseUntil`、`executionAttempt`，并实现：

- 原子 `claim()`；
- `renewLease()`；
- `recoverStaleRuns()`；
- 超过最大次数后转 `failed`。

这说明项目已经接受“长任务需要 durable lease + recovery”的运行模型。Automation 不应复制 AI 的业务状态机，但应复用相同的生命周期原则，避免同一仓库存在两套互相矛盾的任务可靠性语义。

## 2. 问题定义

当前 Automation 将以下三个概念混在一个 `lockTtlMs` 中：

- 分布式互斥锁 TTL；
- handler 执行 deadline；
- stale-run recovery 时间。

实际上三者语义不同。固定 Redis TTL 既不能保证 handler 停止，也不能形成 durable run claim；数据库又缺少 scheduled occurrence 幂等键，因此在进程暂停、网络抖动、Redis 锁过期、长耗时任务、多实例部署时会暴露重复执行与运行记录漂移。

## 3. 目标

1. 同一 Automation Job 的同一 scheduled occurrence 在数据库层只能有一个 canonical run。
2. 正在执行的 run 使用可续租 lease，而不是依赖一次性 Redis TTL 猜测最大运行时间。
3. Worker 崩溃或 lease 过期后可以明确恢复，而不是留下永久 `running` 或直接重复创建 run。
4. Redis 继续作为高效分布式协调手段，但不再是唯一正确性来源。
5. `AutomationRun` 成为可审计的执行事实：能回答“计划何时执行、谁 claim、是否 lease 过期、重试了几次、最终结果是什么”。
6. 保持现有 Automation API、job type、cron/timezone、交易日跳过语义不变。

## 4. 非目标

- 不引入通用 Job Framework、Command Bus、Saga 或外部队列系统。
- 不把 `AiRun` 与 `AutomationRun` 强行合并成一个表。
- 不重写各业务 handler。
- 不在本轮改变 snapshot、risk、cash deposit 等业务幂等语义。
- 不把所有 handler 都改造成强制 cancellable；signal propagation 仅作为后续可选增强，不能作为 lease 正确性的前提。

## 5. 设计

### 5.1 为 scheduled occurrence 建立耐久身份

`AutomationRun` 增加：

- `scheduledAt DateTime`：本次计划执行时间；
- `claimedAt DateTime?`；
- `leaseUntil DateTime?`；
- `executionAttempt Int @default(0)`；
- `recoveryReason String?`（或等价受控字段）。

增加唯一约束：

```text
@@unique([jobId, scheduledAt])
```

`scheduledAt` 必须来自 scheduler 读取到的 job occurrence，而不是 `startedAt`。

### 5.2 调度与执行拆为“登记 occurrence → claim → execute”

Scheduler 对到期任务：

1. 以 `jobId + scheduledAt` 幂等创建或读取 `AutomationRun`；
2. 原子 claim 仅允许 `queued`，或 lease 已过期且符合 recovery 条件的 run 进入 `running`；
3. claim 成功的实例执行 handler；claim 失败表示其他实例拥有当前 occurrence；
4. `nextRunAt` 的推进与 occurrence 登记绑定，而不是等待 handler 最终完成后才推进。

这样即使一个 occurrence 长时间执行，下一次 scheduler poll 也不会不断把同一 occurrence 当成未推进任务。

### 5.3 Lease heartbeat

执行期间按照 `leaseMs` 的固定比例续租，例如每 `leaseMs / 3` heartbeat 一次。要求：

- renew 必须只更新当前 `running` run；
- handler 结束后停止 heartbeat；
- heartbeat 失败不能直接假定业务 handler 已停止，应记录 lease-loss 并避免错误覆盖其他 owner 的最终状态；
- Redis 锁可保留作为快速互斥，但 TTL 需要随 heartbeat 一并续租，或降级为非关键优化层。

### 5.4 Stale recovery

增加 Automation stale-run recovery：

- `running && leaseUntil < now && executionAttempt < maxAttempts`：重新进入可 claim 状态；
- 达到上限：标记 `failed` 并写入 recovery reason；
- recovery 必须基于数据库状态，不依赖某个原进程仍存活。

是否复用 job 的现有 retry policy 作为 recovery 上限，需要在实现时明确：

- handler 内部短失败 retry；
- worker/lease 级 recovery；

二者不能在文档和字段命名上混为同一层次。

### 5.5 完成状态的 owner 校验

`succeeded/failed` 更新必须验证当前 run 仍处于允许完成的状态。若 lease 已经丢失且 run 被其他 worker recovery/claim，旧 worker 不得无条件覆盖新状态。

可通过带条件的 `updateMany` / version 字段 / owner token 实现，不要求引入新的框架。

### 5.6 交易日跳过

市场类 job 的休市跳过仍保持现有语义，但需要形成明确 occurrence 结果：

- 可以记录为 `skipped` run，或定义专门的 skip outcome；
- `nextRunAt` 必须正常推进；
- 同一 scheduled occurrence 不能因多实例重复写多条 skip 记录。

具体状态枚举是否扩展为 `skipped` 由实现 PR 决定，但测试必须锁定幂等性。

## 6. 事务、并发与兼容风险

### 6.1 Migration

现有 `AutomationRun` 没有 `scheduledAt`。迁移需：

- 新字段先 nullable；
- 为历史行回填 `scheduledAt = startedAt`，明确这只是历史近似；
- 再建立非空与 unique 约束，或采用兼容 PostgreSQL 的分步 migration。

历史 run 不参与未来 occurrence 调度，因此近似回填不会改变业务执行。

### 6.2 并发

重点验证：

- 两实例同时登记同一 occurrence；
- 两实例同时 claim；
- lease 过期后旧 worker 仍返回；
- heartbeat 与 recovery 同时发生；
- handler 成功与 lease loss 竞态；
- Redis 暂时不可用时数据库幂等是否仍阻止同一 occurrence 产生两个 canonical run。

### 6.3 兼容性

- `GET /automations/history` 现有字段继续保留；新增字段向后兼容。
- Desktop 当前只依赖 job/history 的既有字段，不要求本轮 UI 改动。
- Job create/toggle/delete API 不改。
- `lockTtlMs` 可以暂时保留为 lease duration 配置，避免立即破坏 Schema；若后续重命名为 `leaseTtlMs`，应单独做兼容迁移。

## 7. 测试与工程守卫

至少新增/补强：

- `apps/server/test/automation/services.test.ts`
  - 同一 `jobId + scheduledAt` 只生成一个 run；
  - 两个并发 claim 只有一个成功；
  - heartbeat 延长 lease；
  - stale recovery；
  - 旧 worker 不能覆盖 recovery 后的新 owner 状态。
- `apps/server/test/automation-runtime.test.ts`
  - 长任务跨越初始 TTL 仍不产生重复执行。
- migration matrix 更新与现有 migration guardrail 通过。
- `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm contract:test`。

若实现保留 Redis 快速锁，需要增加 Redis failure/lock expiry characterization test，证明数据库 occurrence 唯一约束仍是最后正确性边界。

## 8. 与现有 Spec / Architecture 的关系

- 不修改 `2026-09-02-server-module-boundaries.md` 已定义的 Ledger/Risk/Performance 所有权。
- 本 Spec 补充此前 Architecture SSOT 未覆盖的“后台任务执行生命周期”边界。
- AI Research Workbench 的 durable lease 只作为成熟实现证据，不把 AI 业务状态机提升为全局抽象。
- Portfolio Snapshot、Recurring Cash Deposit、Provider Health 等现有 Spec 的业务语义保持不变；它们只是 Automation handler 的调用方。

实现完成后，应在 `docs/architecture` 中补一小节说明：后台长任务必须使用 durable claim/lease/recovery，Redis TTL 不能单独作为执行正确性边界。

## 9. 验收标准

- [ ] 同一 `jobId + scheduledAt` 在数据库中最多存在一个 canonical `AutomationRun`。
- [ ] 两个 scheduler/worker 实例无法并发 claim 同一 occurrence。
- [ ] 执行超过初始 lease 时可通过 heartbeat 保持 owner，不出现第二次执行。
- [ ] Worker 崩溃后 stale run 可恢复，且有最大 recovery 次数。
- [ ] 旧 worker 在 lease 丢失后无法覆盖新 owner 的最终状态。
- [ ] `nextRunAt` 推进不依赖 handler 长时间完成，重复 poll 不会反复处理同一 occurrence。
- [ ] 现有 Automation API 与 job type 行为兼容。
- [ ] migration、unit/integration tests、lint/typecheck/contract tests 全部通过。
