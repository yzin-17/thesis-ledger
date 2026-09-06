# 自动化执行租约与调度幂等加固任务

> 日期：2026-09-05  
> 状态：Planned  
> 对应 Spec：[`../specs/2026-09-05-automation-execution-lease-hardening.md`](../specs/2026-09-05-automation-execution-lease-hardening.md)

## 1. 目标

关闭当前 Automation 在长任务、多实例、Redis TTL 过期和 Worker 崩溃场景下的重复执行与运行记录漂移风险，并把 scheduled occurrence、claim、lease、heartbeat、recovery 变成可测试的耐久生命周期。

## 2. 范围

涉及：

- `apps/server/src/automation/**`
- `apps/server/prisma/schema.prisma`
- 对应 Prisma migration
- `apps/server/test/automation/**`
- `apps/server/test/automation-runtime.test.ts`
- 必要的 `packages/schemas/src/automation.ts`
- migration/CI guardrail
- 实现完成后的 Architecture SSOT 小幅补充

不涉及：业务 handler 重写、AI/Automation 表合并、通用任务框架、Desktop UI 重做。

## 3. 任务拆分

### TASK-ARCH-081：建立 Automation occurrence 数据模型

- [ ] 为 `AutomationRun` 增加 `scheduledAt`。
- [ ] 增加 `claimedAt`、`leaseUntil`、`executionAttempt` 与 recovery 相关字段。
- [ ] 增加 `@@unique([jobId, scheduledAt])`。
- [ ] 设计历史数据回填 migration；历史 `scheduledAt` 可用 `startedAt` 近似，但必须在 migration 注释/文档说明。
- [ ] 更新 migration matrix/guardrail 基线。

验收：同一 `jobId + scheduledAt` 无法插入两个 canonical run。

### TASK-ARCH-082：把 scheduler 改为 occurrence-first

- [ ] `runDue()` 不再直接把“当前 now”当作唯一执行身份。
- [ ] 对每个 due job 先幂等登记 scheduled occurrence。
- [ ] `nextRunAt` 的推进与 occurrence 登记绑定，不等待 handler 完成。
- [ ] 多实例并发登记时由数据库唯一约束收敛为同一 run。
- [ ] 休市跳过也必须推进 occurrence，不能因下一轮 poll 重复处理同一计划时点。

验收：一个执行 5 分钟的 job 不会让 scheduler 每 30 秒持续把同一 `nextRunAt` 当作新到期任务。

### TASK-ARCH-083：实现原子 claim 与 owner-safe completion

- [ ] 增加原子 `claim(runId, leaseMs)`。
- [ ] claim 只能从允许状态进入 `running`，并递增 `executionAttempt`。
- [ ] 引入 owner token 或等价并发条件，确保旧 worker 在 lease 丢失后不能覆盖新 owner 的结果。
- [ ] `succeeded` / `failed` 必须通过条件更新完成。
- [ ] 明确 handler 内 retry attempt 与 worker recovery attempt 的字段/日志语义，禁止混用。

验收：两个并发 worker 对同一 run 只有一个 claim 成功；旧 owner 的最终更新不会覆盖 recovery 后的新 owner。

### TASK-ARCH-084：实现 lease heartbeat 与 stale recovery

- [ ] 运行中的 worker 定期续租数据库 lease。
- [ ] 若继续保留 Redis 锁，同步续租 Redis TTL；Redis 只作为快速协调层。
- [ ] heartbeat 生命周期必须在 handler 结束/失败后可靠停止。
- [ ] 增加 `recoverStaleRuns()` 或等价机制。
- [ ] 达到 recovery 最大次数后标记失败并留下明确原因。
- [ ] 评估 recovery 上限是否复用现有 retry policy；若复用，文档必须明确两层 attempt 的区别。

验收：执行时间超过初始 lease 的任务不会被第二实例重复 claim；worker 崩溃后 run 最终可恢复或确定失败。

### TASK-TEST-085：补齐并发与长任务测试

- [ ] `automation/services.test.ts`：并发 occurrence create。
- [ ] `automation/services.test.ts`：并发 claim。
- [ ] `automation/services.test.ts`：heartbeat renew。
- [ ] `automation/services.test.ts`：stale recovery / exhausted recovery。
- [ ] `automation/services.test.ts`：旧 owner completion 被拒绝。
- [ ] `automation-runtime.test.ts`：handler 超过初始 TTL 仍只有一次执行。
- [ ] 增加 Redis 锁失效/不可用场景，验证数据库 occurrence 唯一性仍阻止双 run。

验收：测试能够在旧实现上稳定复现至少一个重复执行/owner 覆盖风险，并在新实现上通过。

### TASK-DOC-086：更新 Architecture SSOT

- [ ] 在 `docs/architecture` 当前 Server 边界文档中增加“后台任务执行生命周期”小节，或新增聚焦后台任务的 Architecture 文档。
- [ ] 固化规则：长任务正确性必须由 durable occurrence + claim + lease + recovery 保证；固定 Redis TTL 不能作为唯一执行边界。
- [ ] 说明 AI 与 Automation 可共享生命周期原则，但不要求共享业务表或通用框架。

### TASK-REVIEW-087：实现后重新全仓回归 Review

- [ ] 从当前实现分支重新检查 Automation 所有 handler 调用方。
- [ ] 检查 `snapshot`、`backup`、`cash-deposit-materialization` 等有副作用 handler 是否存在额外幂等要求。
- [ ] 检查 Desktop/Mobile/API Client 是否依赖旧 history response shape。
- [ ] 检查 Prisma migration 与 CI guardrail。
- [ ] 再次检查 AI/Backtest/Import 等任务型模块，确认没有因为本轮抽象产生新的跨模块耦合。
- [ ] Review 最终 diff，确保没有扩张为通用 Job Framework。

## 4. 建议实施顺序

1. TASK-ARCH-081 数据模型与 migration；
2. TASK-ARCH-082 occurrence-first scheduler；
3. TASK-ARCH-083 claim/completion ownership；
4. TASK-ARCH-084 heartbeat/recovery；
5. TASK-TEST-085 并发与长任务验收；
6. TASK-DOC-086 Architecture SSOT；
7. TASK-REVIEW-087 全仓回归 Review。

081–084 建议拆成 2–3 个小 PR，而不是一个大改：先建立数据与幂等边界，再切执行 lease，最后补 recovery/文档。

## 5. 验证命令

```bash
pnpm db:generate
pnpm lint
pnpm typecheck
pnpm --filter @thesis-ledger/server test
pnpm contract:test
pnpm migration:matrix
```

如果新增需要真实 PostgreSQL 的并发验证，应继续复用现有 DB integration 方式，而不是只用 mock Prisma 证明并发语义。

## 6. 风险清单

- Migration 对历史 `AutomationRun` 回填错误导致 unique 冲突。
- `nextRunAt` 提前推进后，进程在 occurrence 登记与 claim 之间崩溃；必须由 queued/recovery 语义接住，不能丢任务。
- Heartbeat 与 stale recovery 竞态导致双 owner。
- 旧 worker 在 lease loss 后提交业务副作用；数据库 owner-safe completion 只能保护 run 状态，不能自动撤销 handler 外部副作用，因此业务 handler 仍应优先保持幂等。
- Redis 故障不能绕过数据库 occurrence 唯一约束。
- 不应为了复用 AI lease 逻辑建立反向 `automation -> ai` 或 `ai -> automation` 依赖。

## 7. 本轮未选择的候选项

本次全仓 Review 同时复查了以下候选，但没有纳入本轮实施：

- Ledger/Portfolio 原子性：#26 已完成，当前边界和测试仍在。
- Risk/Performance 大 Service：#27/#28 已按变化理由拆分，不重复重构。
- workspace runtime dependency guard：#29 已接入 `pnpm lint`。
- 旧 `/ledger/events` 通用写入口：#30 已移除。
- Server module boundary SSOT：#31 已补齐。
- Baseline Import 大文件/大测试：仍属于高风险迁移链，当前已有 repository/support/projection 分层和大量 characterization tests；本轮未发现比 Automation 重复执行更高优先级的新正确性证据。
- API Client 单文件偏大：目前没有发现第二套请求实现、反向依赖或事实所有权问题，不因文件大小单独开重构。

因此本轮选择 Automation lease，是因为它同时满足“存在真实并发正确性窗口”“影响多个业务 handler”“已有仓库内成熟生命周期原则可参考”“可以收敛实施而无需大规模重构”。
