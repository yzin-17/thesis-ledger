# 周期计划物化一致性加固任务

对应 Spec：[`../specs/2026-09-12-recurring-plan-materialization-hardening.md`](../specs/2026-09-12-recurring-plan-materialization-hardening.md)

状态：待实施。

## 跨任务契约

- 当前实施基线：`main@3970e48c24277001d99135f77ec85b0a695f013f`。
- `RecurringCashDepositPlan` 与 `RecurringFundInvestmentPlan` 继续是两个独立领域模型；不合并表和 API。
- `planId + periodKey` 数据库唯一约束继续作为最终重复防线。
- materializer 的内部并发使用数据库串行化；用户编辑/状态命令继续使用 `expectedVersion` 乐观并发控制。
- 事务内不得执行 Redis、外部 Provider 或网络 I/O。
- Notification 模块拥有通知 intent/delivery；`cash-plans` 只提交稳定通知意图，不直接写 `NotificationDelivery`。
- Automation 只触发业务 materializer，不拥有业务计划状态；本任务不替代 PR #32。

## T1：建立真实 PostgreSQL 并发失败复现基线

- [ ] 为现金和基金计划新增数据库级并发测试 fixture，不复用当前 fake Prisma `$transaction` 作为并发证据。
- [ ] 复现两个调用同时读取同一 `version/nextDueAt` 时，一个调用成功、另一个抛 `*_VERSION_CONFLICT` 的现状。
- [ ] 增加不同 horizon（较早 `now` / 较晚 `now`）和重复扫描样例，记录当前 `nextDueAt` 与 occurrence 集合。
- [ ] 测试使用隔离数据和确定性 barrier/latch 控制竞争窗口，禁止依赖 sleep 猜测调度顺序。

完成条件：当前 `main` 的已知并发伪失败可被稳定测试捕获，且测试能区分“无重复月份”与“两个调用都幂等收敛”这两个不同保证。

验证：PostgreSQL 16；相关 Prisma migration/fresh baseline；单测继续通过。

## T2：加固现金计划单计划物化事务

- [ ] `RecurringCashDepositService.materializePlan` 在事务内先锁定目标计划，再读取最新 ACTIVE/`nextDueAt` 状态。
- [ ] 锁内重新计算 due periods，插入缺失 occurrence，再单调推进 `nextDueAt` 与 `version`。
- [ ] 合法的并发 materializer 竞争以 success/no-op 收敛，不再映射为 `CASH_DEPOSIT_PLAN_VERSION_CONFLICT`。
- [ ] 保留 `@@unique([planId, periodKey])`；返回的 `createdCount/periods` 必须表示本事务确定创建的月份。
- [ ] pause/resume/end 与 materialize 的竞争补充数据库级测试。

完成条件：覆盖 AC1、AC2、AC3 的现金部分；普通用户版本冲突语义不改变。

## T3：加固基金计划单计划物化事务

- [ ] 与 T2 使用同一并发契约改造 `RecurringFundInvestmentService.materializePlan`。
- [ ] 不复用现金领域模型、错误文案或 Ledger 命令。
- [ ] 保留 `LedgerCommandService.createExecutionWithEffect` 的确认成交原子事务。
- [ ] 添加基金计划并发、不同 horizon、pause/end 竞争的 PostgreSQL 测试。

完成条件：覆盖 AC1、AC2、AC3 的基金部分；逐笔成交和确认定投行为不回归。

## T4：建立现金通知 durable intent 与恢复路径

- [ ] 在 Notification 边界增加可持久化、稳定去重、可重放的通知 intent；优先由 Notification 模块拥有 schema/API。
- [ ] 现金 materialization 的业务事务必须在 occurrence/计划推进提交时同步持久化通知 intent 或等价 durable identity。
- [ ] route 解析、Redis cooldown、Delivery upsert 与外部发送全部发生在业务事务之后。
- [ ] 增加 intent reconciliation：业务提交后进程退出、Redis/数据库 enqueue 异常后，可从数据库重建同一通知。
- [ ] catch-up 多月份保持单计划一条汇总消息；消息快照和 period snapshot 在 intent 中稳定保存。
- [ ] intent → delivery 使用稳定 dedup key，重复 reconcile 不形成第二条业务通知。
- [ ] Risk 现有 Notification 路径与 `NotificationDelivery` 历史兼容；若引入 migration，补 fresh/upgrade 验证。

完成条件：覆盖 AC4、AC5；故障恢复不依赖下一次重新物化同一月份。

## T5：收敛共享生命周期能力但不建设通用框架

- [ ] 比较现金/基金两套 schedule 与 materialization support，只抽取已经完全一致的纯日期/数据库协调能力。
- [ ] 共享模块不得导入 `cash-plans`、`fund-plans`、`automation`、`ledger`、`notifications`。
- [ ] 账户/资产校验、Plan/Occurrence 模型、确认命令、通知文案、错误码继续留在领域内。
- [ ] 如果抽取需要复杂泛型、动态 Prisma model 或大量 callback，停止抽取并保留小规模重复；在代码注释/文档记录原因。

完成条件：不会为了 DRY 引入新的跨域抽象；并发不变量拥有唯一、可测试的实现或明确的对称实现规范。

## T6：补齐工程边界和 CI 守卫

- [ ] `scripts/check-boundaries.mjs` 增加 `fund-plans -> automation` 禁止规则。
- [ ] 增加 `ledger -> fund-plans` 禁止规则，与现金计划方向保持对称。
- [ ] 若 Notification 新增 intent 层，增加守卫保证 Notification 不反向依赖 `cash-plans`/`fund-plans`。
- [ ] 将 T1–T4 的 PostgreSQL 并发/故障恢复测试接入现有 CI PostgreSQL job；控制执行时间，不增加独立重复数据库工作流。
- [ ] `check-workspace-dependencies`、`check-boundaries`、migration matrix、Server typecheck/test 必须通过。

完成条件：覆盖 AC6、AC7；新边界不是只写在文档中。

## T7：同步旧 Spec/Task 完成状态与验证证据

- [ ] 更新 `2026-08-30-recurring-cash-deposit-plan`：AC5/AC7 在本任务关闭前标为重新打开，不再宣称 fake Prisma 覆盖真实并发。
- [ ] 更新 `2026-09-08-recurring-fund-investment`：明确 T2/并发补期仍未关闭，修正“实现完成”与任务未完成的矛盾。
- [ ] 更新 `docs/tasks/README.md`，将两项从“实现完成，仅剩运行时验收”迁回当前实施入口，并链接本任务。
- [ ] 完成实现后，把真实 PostgreSQL 并发测试、notification crash/reconcile、migration matrix、boundary guard 作为最终证据写回；没有执行的浏览器/外部 Provider smoke 不得伪装成已验证。

完成条件：覆盖 AC8，Spec、Task、任务索引和实际测试能力一致。

## T8：最终全仓回归与边界 Review

- [ ] 从当前分支重新检查 `cash-plans`、`fund-plans`、`automation`、`notifications`、`ledger` 的全部相关调用方，而不是只看本任务 diff。
- [ ] 检查 Prisma schema/migrations、fresh baseline、测试 fixture、CI 脚本和 Desktop/API client 是否受 schema/API 改动影响。
- [ ] 复核 PR #32 合并状态；若其 Automation 生命周期实现已经进入 main，只做兼容验证，不复制 owner/lease 逻辑到业务计划层。
- [ ] 运行相关 deterministic tests、Server typecheck/build、boundary/workspace/migration guards。
- [ ] `git diff --check` 与最终 PR diff review 无遗漏、无无关重构。

完成条件：实现范围仍然收敛在周期计划 materialization 与通知恢复，不影响其它领域事实源或任务生命周期。

## 验收映射

- AC1：T1、T2、T3
- AC2：T1、T2、T3
- AC3：T2、T3
- AC4：T4
- AC5：T4
- AC6：T5、T6
- AC7：T1、T6
- AC8：T7、T8

## 风险检查

- [ ] 行锁只锁单一计划，禁止一个事务同时锁多个计划。
- [ ] 不在持锁事务内执行 Redis/Provider/网络请求。
- [ ] 新 migration 不修改或回填既有 Ledger 事实，不破坏 Notification 历史 delivery。
- [ ] 并发测试使用真实 PostgreSQL，不用 mock 推导锁行为。
- [ ] shared support 不拥有业务模型，不形成 Cash ↔ Fund 横向领域依赖。
- [ ] 不把 Automation PR #32、Backtest durable worker 或 Strategy AI closure 的事项带入本任务。

## 最终一致性 Review（实施完成时勾选）

- [ ] 全部验收标准有实现与真实证据
- [ ] 并发、事务、迁移、故障恢复风险均有测试
- [ ] 旧 Spec/Task 的状态已经同步
- [ ] 边界守卫覆盖 Cash/Fund 对称关系
- [ ] 全仓相关调用方已复核
- [ ] 没有无关大规模重构
