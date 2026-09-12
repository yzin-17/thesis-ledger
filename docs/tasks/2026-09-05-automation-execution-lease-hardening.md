# 自动化执行耐久身份、租约与恢复加固任务

> 日期：2026-09-05  
> 更新：2026-09-12  
> 状态：Repository implementation complete，目标环境 smoke 待验收  
> 对应 Spec：[`../specs/2026-09-05-automation-execution-lease-hardening.md`](../specs/2026-09-05-automation-execution-lease-hardening.md)

## 1. 目标

关闭 Automation 在固定 Redis TTL、长任务、多实例和 Worker 崩溃场景下的重复执行与 stale-owner 覆盖窗口，同时避免对未知副作用任务进行盲目自动重放。

## 2. 实施范围

涉及：

- `apps/server/src/automation/**`
- `apps/server/prisma/migrations/**`
- `apps/server/prisma/raw-owned-tables.json`
- `apps/server/test/automation/**`
- `.github/workflows/ci.yml`
- `docs/architecture/2026-09-02-server-module-boundaries.md`

不涉及：通用 Job Framework、AI/Backtest 合表、业务 handler 重写、Desktop UI 重做。

## 3. 当前方案相对原 PR #32 的调整

原方案在当前项目基础上做了以下收敛：

1. 不再把 lease 字段直接塞入公开 `AutomationRun`，改用 raw-owned `AutomationRunLease` 保存执行控制元数据。
2. owner 语义直接对齐 PR #33：PostgreSQL `executionAttempt` 是 durable owner version。
3. Redis 不再承担 Automation owner/lease 正确性。
4. stale recovery 不再统一重跑；按 `replay-safe / unknown-outcome` 分流。
5. manual run 不伪装成 scheduled occurrence，并改为创建即原子 claim。
6. 服务恢复后不逐 tick 补跑错过的 cron。
7. gate skip 只推进 `nextRunAt`，不生成高频 `skipped` run。
8. scheduled 执行只接受数据库中已经到期的 `nextRunAt`，不能临时用 `now` 制造 occurrence。
9. heartbeat 明确丢失 owner 后，旧 worker 不写 success/failure，交由 reconciler 收敛真实不确定结果。

## 4. 任务完成情况

### TASK-ARCH-081：建立 durable occurrence 元数据

- [x] 新增 raw-owned `AutomationRunLease`。
- [x] 增加 `trigger / scheduledAt / executionAttempt / claimedAt / leaseUntil / recoveryPolicy / recoveryReason`。
- [x] scheduled occurrence 使用 PostgreSQL 部分唯一索引 `(jobId, scheduledAt)`。
- [x] migration 将历史 run 标为 `legacy`，不伪造 scheduledAt。
- [x] 历史 `running` 使用过期 lease 交给 reconciler fail closed。
- [x] 极端历史 `queued` 在 migration 中直接终结为 `unknown_outcome`。
- [x] 更新 migration matrix 与 raw-owned manifest。

### TASK-ARCH-082：occurrence-first scheduler

- [x] 使用数据库 `job.nextRunAt` 作为 scheduled occurrence identity。
- [x] 先登记 canonical run，再执行 handler。
- [x] occurrence 登记后推进下一次 cron。
- [x] missed cron 不逐 tick backfill。
- [x] market/sampling gate skip 不生成运行历史，只推进 schedule。
- [x] `nextRunAt` 尚未到期时直接 skip，不制造临时 occurrence。
- [x] scheduler recovery 只恢复 enabled scheduled queued run，不接管 manual run。

### TASK-ARCH-083：durable claim 与 owner-safe completion

- [x] scheduled queued run 使用数据库事务与 row lock claim。
- [x] 每次 scheduled claim 单调增加 `executionAttempt`。
- [x] manual run 创建 `AutomationRun` 与 ownerAttempt=1/lease 在同一事务完成。
- [x] heartbeat 绑定 ownerAttempt。
- [x] succeeded/failed 绑定 ownerAttempt。
- [x] 旧 owner completion 被拒绝。
- [x] handler retry `AutomationRun.attempt` 与 owner recovery `executionAttempt` 明确分层。

### TASK-ARCH-084：lease heartbeat 与 handler-aware recovery

- [x] `lockTtlMs` 解释为数据库 lease duration。
- [x] 按 lease 周期 heartbeat。
- [x] owner/heartbeat 丢失时触发 AbortController。
- [x] leaseLost 后旧 worker 不再写 succeeded/failed，交由 reconciler 决定终态。
- [x] 明确 replay-safe handler 白名单。
- [x] `market-sync`、现金物化、基金定投物化通过下游唯一键/upsert 审查，可安全 replay。
- [x] `provider-health` 因连续失败计数/健康历史副作用改为 `unknown_outcome`，不自动 replay。
- [x] replay-safe stale run 自动 requeue，且 owner recovery 有独立上限。
- [x] 其他 scheduled handler 与所有 manual run 在 stale 后进入 `unknown_outcome`。
- [x] Redis 不再参与 owner/lease 正确性。

### TASK-TEST-085：并发与恢复验证

- [x] unit：同一 occurrence 只生成一个 canonical run。
- [x] unit：owner 1 → recovery → owner 2。
- [x] unit：旧 owner 不能覆盖 owner 2。
- [x] unit：manual 创建即 claim，lease 丢失后 unknown-outcome。
- [x] unit：unknown-outcome 不自动重放。
- [x] unit：recovery attempts exhausted。
- [x] unit：recovery policy 分类，包含 provider-health fail-closed。
- [x] Service lifecycle：heartbeat 失去 owner 后，即使 handler 忽略 AbortSignal 继续返回，也不写 succeeded/failed。
- [x] Service lifecycle：`nextRunAt` 尚未到期时不执行 handler、不制造 occurrence。
- [x] PostgreSQL：并发 reserve 同一 occurrence 只落一条 run/lease。
- [x] PostgreSQL：durable owner 单调递增并拒绝 stale completion。
- [x] PostgreSQL：manual run 创建即 claim，stale 后不会进入 scheduler replay。
- [x] PostgreSQL integration 已加入 contracts-and-guardrails CI。

### TASK-DOC-086：Architecture SSOT

- [x] 在 Server module boundary SSOT 增加后台长任务执行生命周期规则。
- [x] 固化 PostgreSQL durable owner / occurrence / lease / recovery 原则。
- [x] 明确 Automation、AI、Backtest 共享原则而不共享业务表。

### TASK-REVIEW-087：最终回归 Review

- [x] 检查当前 Automation handler 副作用特征，未将 snapshot/risk/digest/backup 误标为 replay-safe。
- [x] 进一步检查 ProviderHealth 状态更新，移除错误的 replay-safe 分类。
- [x] 检查 manual create→claim 崩溃窗口并改为原子创建/claim。
- [x] 检查 leaseLost 旧 owner 终态窗口，保留给 reconciler 处理 unknown outcome。
- [x] 检查 legacy queued 数据迁移，避免永久悬挂。
- [x] 检查现有 history/API 主体结构保持兼容。
- [x] 检查 migration / raw-owned / CI guardrail 边界。
- [x] 未引入 Automation → AI / Backtest 反向依赖。
- [x] 未扩张为通用 Job Framework。

## 5. 最终验证

PR 最新 HEAD 必须通过：

```bash
pnpm migration:matrix
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm contract:test
pnpm guardrails:complexity
```

PostgreSQL service E2E additionally runs：

```bash
RUN_AUTOMATION_POSTGRES_E2E=1 \
pnpm --filter @thesis-ledger/server exec vitest run \
  test/automation/durable-execution-postgres.integration.test.ts
```

最终 CI run / HEAD 证据记录在 PR #32，不使用旧代码 HEAD 的成功结果冒充最终验证。

## 6. 运行环境门禁

仓库实现完成后仍保留一次目标环境 smoke：

1. 在真实 Compose 中启动 scheduled replay-safe Automation；
2. run 已进入 `running` 后硬杀执行进程；
3. 等待 lease 过期并由另一实例/重启进程恢复；
4. 验证 `executionAttempt` 单调增加；
5. 验证旧 owner 无法覆盖新 owner；
6. 对 unknown-outcome 类型验证不会自动重放。

该门禁验证真实进程生命周期，不作为仓库代码正确性缺口重复实现。
