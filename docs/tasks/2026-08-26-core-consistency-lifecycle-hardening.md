# Core Consistency & Lifecycle Hardening Tasks

> 日期：2026-08-26
> 状态：Planned
> 对应 Spec：`docs/specs/2026-08-26-core-consistency-lifecycle-hardening.md`

## 1. 目标

按风险优先级关闭本轮架构 Review 确认的四个缺口：

1. Ledger 同时间事件缺少稳定顺序；
2. Backtest `running` 生命周期不可恢复；
3. `clearPositions()` 缺少整批事务；
4. workspace package 依赖方向缺少机器守卫。

不扩大到无关重构。

## 2. TASK-ARCH-067：Ledger 稳定事件序号

优先级：P0

### 实施

- [ ] 在 `LedgerEvent` 增加稳定业务顺序字段（建议账户内 `sequence` / `ordinal`）。
- [ ] 为已有 LedgerEvent 增加确定性回填 migration。
- [ ] 明确新事件序号的并发分配策略，避免重复 sequence。
- [ ] 把 Ledger rebuild / cash projection / journal projection 等排序统一为 `occurredAt + sequence`。
- [ ] 去除依赖 `createdAt` 或 UUID 作为业务顺序的路径。
- [ ] 为同一账户、同一 `occurredAt` 的 BUY / SELL / ADJUSTMENT / CASH 组合增加回归测试。

### 验收

- [ ] 相同事件集重复 rebuild 的 Position / Cash / Journal 结果完全一致。
- [ ] 历史数据 migration 后顺序固定。
- [ ] 并发写入不能生成重复业务序号。

### 验证

- `pnpm --filter @thesis-ledger/server test`
- `pnpm --filter @thesis-ledger/domain test`
- `pnpm migration:matrix`

## 3. TASK-ARCH-068：Backtest lease / heartbeat / recovery

优先级：P1

### 实施

- [ ] 在 `BacktestJob` 增加 lease owner、lease expiry、heartbeat、attempts 等最小生命周期字段。
- [ ] 使用数据库条件更新获取 `queued` job，保证单 job 单 owner。
- [ ] 执行期间定期 heartbeat / renew lease。
- [ ] terminal 状态释放 lease。
- [ ] 增加 stale `running` recovery：未超过上限则重新 queue，超过上限则 failed。
- [ ] 保留本地 `AbortController` 作为快速中断，但以数据库 `cancelled` 状态作为跨进程 SSOT。
- [ ] 覆盖 Server restart / stale lease 场景的确定性测试。

### 验收

- [ ] 两个 worker 竞争同一 job 时只有一个成功获得 lease。
- [ ] worker crash 后 job 能在 lease 过期后恢复。
- [ ] heartbeat 有效期间不会被误恢复。
- [ ] cancelled job 不会被 recovery 重新执行。
- [ ] retry 超限后稳定进入 failed。

### 验证

- `pnpm --filter @thesis-ledger/server test`
- `pnpm migration:matrix`
- 如增加 smoke：记录在对应 Review 文档，不在 Task 中伪装外部运行证据。

## 4. TASK-ARCH-069：批量清仓事务收敛

优先级：P1

### 实施

- [ ] 在 `LedgerService` 增加批量清仓业务操作或等价的单事务 helper。
- [ ] 在一次 transaction 内读取目标 Position、写入全部 ADJUSTMENT、完成一次统一 rebuild。
- [ ] `PortfolioService.clearPositions()` 改为只调用该 Ledger 操作。
- [ ] 删除 Portfolio 层循环编排多个独立 `setPosition()` transaction 的逻辑。
- [ ] 增加中途失败回滚测试。

### 验收

- [ ] 任意一条写入失败时整批清仓回滚。
- [ ] 成功时账户全部目标持仓一次性清零。
- [ ] Portfolio 不直接拥有多条 Ledger 写事务边界。

### 验证

- `pnpm --filter @thesis-ledger/server exec vitest run test/portfolio*.test.ts test/ledger*.test.ts`
- `pnpm contract:test`

## 5. TASK-ARCH-070：Workspace package 依赖图守卫

优先级：P2

### 实施

- [ ] 为 `@thesis-ledger/*` package 定义明确依赖方向。
- [ ] 基于各 workspace `package.json` 构建内部依赖图。
- [ ] 检查基础包反向依赖上层包。
- [ ] 检查内部 package dependency cycle。
- [ ] 将检查接入现有 `pnpm lint` 或同等级 CI quality gate。
- [ ] 增加合法图、反向依赖、依赖环 fixture 测试。

### 建议边界

- `shared`：最低层工具，不依赖其他内部 package；
- `domain`：只依赖基础层，不依赖 app / adapter / client；
- `schemas`：保持独立 contract 层，不引入运行时 domain 依赖；
- `api-client`：可依赖 schemas，不依赖 server；
- app / service：可依赖 packages，但 packages 不反向依赖 app / service。

最终规则以实际职责核对后固化，避免为了符合示意图制造不必要迁移。

### 验收

- [ ] 当前合法依赖全部通过。
- [ ] 反向依赖 fixture 失败。
- [ ] dependency cycle fixture 失败。
- [ ] CI 能阻止新的 workspace 架构漂移。

### 验证

- `pnpm lint`
- 依赖边界脚本自身测试。

## 6. TASK-DOC-071：修正 Spec 完成度语义

优先级：P2

在上述实现开始或完成时同步更新文档，不提前宣称完成。

- [ ] 将 Backtest 文档状态区分为“执行能力已实现”与“持久化 lifecycle 已闭环”。
- [ ] 在 Ledger / Domain 文档中记录稳定业务顺序不变量。
- [ ] 将批量 Ledger 写入的事务归属规则写入 Architecture / Engineering SSOT。
- [ ] 实现完成后更新 `docs/architecture/2026-08-18-spec-traceability.md` 或其后续替代文档。
- [ ] 有长期不可逆设计决策时再新增 ADR；本 Task 不强制提前创建 ADR。

## 7. 推荐实施顺序

```text
TASK-ARCH-067 Ledger ordering
        ↓
TASK-ARCH-069 batch transaction

TASK-ARCH-068 Backtest lifecycle

TASK-ARCH-070 dependency guard
        ↓
TASK-DOC-071 traceability sync
```

067 与 068 可以独立开发，但涉及 Prisma migration 时需要避免 migration 编号冲突。

## 8. 完整验收门禁

代码实施 PR 合并前至少执行：

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm contract:test`
- [ ] `pnpm migration:matrix`
- [ ] `pnpm guardrails:complexity`

若本地/CI 因外部环境无法完成某项，只能记录为 pending，不得用单元测试替代真实运行证据。

## 9. 风险控制

- 不新建统一 Job Framework，除非实现 068 时确认 AI / Backtest 已出现稳定且完全相同的抽象边界。
- 不在 067 中顺带重写所有 Ledger API。
- 不在 069 中改变用户可见的持仓录入语义。
- 不在 070 中为了满足图规则大规模搬迁代码；先固化当前合理边界，再逐步收紧。
