# 周期计划物化一致性加固 Spec

- 日期：2026-09-12
- 状态：待实施
- 适用项目：`thesis-ledger`
- 类型：全仓架构 Review 后的增量加固
- 基线：`main@3970e48c24277001d99135f77ec85b0a695f013f`
- 关联 Spec：
  - [`2026-08-30-recurring-cash-deposit-plan.md`](2026-08-30-recurring-cash-deposit-plan.md)
  - [`2026-09-08-recurring-fund-investment.md`](2026-09-08-recurring-fund-investment.md)

## 本轮全仓 Review 范围与证据

本轮重新以当前 `main` 的全仓状态为审查对象，而不是从最近 PR 的遗留项出发。覆盖：

- `apps/desktop`、`apps/mobile`、`apps/server` 的主要功能目录与调用边界；
- `packages/api-client`、`packages/domain`、`packages/schemas`、`packages/shared` 的 workspace 依赖方向；
- `services/dsa-adapter`；
- `apps/server/prisma/schema.prisma`、现有 migrations 与 Ledger/Backtest/Automation 等持久化生命周期；
- Server/Desktop/Package 测试结构；
- `.github/workflows/ci.yml`、`scripts/check-boundaries.mjs`、workspace dependency/file-size/complexity 等工程守卫；
- `docs/specs`、`docs/tasks`、`docs/architecture` 中与当前实现相关的设计和完成状态。

复核结果表明，Ledger/Portfolio 原子写、Risk/Performance 拆分、workspace 依赖图、旧 Ledger 写入口移除、V1 Backtest durable attempt 等近期已落地问题在当前 `main` 上已有明确边界或完成证据；Automation durable occurrence/owner recovery 仍由 PR #32 单独推进，本轮不重复设计。

本轮新发现且此前没有独立方案覆盖的最高优先级问题集中在“月度周期计划物化”这一条共同生命周期：现金定期入账与基金定投已形成两套相近实现，但它们的并发物化、通知副作用和工程守卫并未达到文档宣称的确定性。

## 问题

### 1. 同一计划并发物化会产生伪失败

`RecurringCashDepositService.materializePlan` 与 `RecurringFundInvestmentService.materializePlan` 当前都采用：

1. 事务内普通 `findUnique` 读取计划；
2. 计算缺失月份；
3. `createMany(..., skipDuplicates: true)`；
4. 使用 `version + nextDueAt` 的 `updateMany` 推进计划；
5. 若更新数不是 1，则抛版本冲突。

数据库的 `planId + periodKey` 唯一约束可以防止重复月份，但不能让两个并发扫描都以幂等结果结束。两个执行者可以同时读取同一版本；其中一个推进计划后，另一个即使没有造成重复实例，也会因为计划 CAS 失败而把整个 materialization 报成失败。现金计划 Spec 当前写明“数据库唯一约束和锁共同保证并发扫描不重复”，实际实现没有计划行锁；基金 Spec 也把“并发补期保持确定状态”列为关键可观察行为。

另外，两套实现都在 `createMany` 前根据查询结果构造 `created`，但未以实际插入结果作为返回事实。在竞争条件下，返回的 `createdCount/periods` 可能描述“尝试创建”而不是“本执行实际创建”。现金通知又直接基于这个列表生成消息。

### 2. 现金计划的通知意图不属于 durable 事务边界

现金到期实例及 `nextDueAt` 在数据库事务提交后，才调用 `NotificationService.enqueue`。该调用负责查询路由、Redis cooldown 预占以及 `NotificationDelivery` upsert；任何异常都会被现金计划服务吞掉并返回 `notificationQueued=false`。

因此，实例已经成为持久事实、但通知 delivery 尚未落库时发生数据库/Redis/进程故障，后续 materialization 因 `nextDueAt` 已推进，不会自然重建这次通知意图。当前现金 Spec 写的是“通知失败只记录失败和重试状态”，这一承诺只覆盖已经成功写入 `NotificationDelivery` 后的投递失败，并不覆盖 enqueue 前半段失败或进程崩溃。

### 3. 两套月度生命周期存在结构性重复，边界守卫不对称

现金与基金服务分别维护近似的：

- 月度到期扫描；
- 漏期计算与实例物化；
- `nextDueAt` 推进；
- ACTIVE/PAUSED/ENDED 状态推进；
- occurrence skip/reopen；
- 乐观版本冲突语义。

领域模型和确认命令必须保持独立，但“同计划串行化、补期推进、并发收敛”属于相同的基础生命周期规则。当前没有共享的最小 materialization contract，也没有跨两个领域的 PostgreSQL 并发验收。

同时，`scripts/check-boundaries.mjs` 已显式保护 `cash-plans -> automation` 和 `notifications -> cash-plans`，却没有为 `fund-plans` 建立同类规则，后续功能扩展存在让基金领域反向依赖调度编排的风险。

### 4. 文档与测试完成度高于实际证据

- 现金计划任务把 T1–T4 和最终一致性 Review 全部标记完成，并声称测试覆盖并发扫描；实际 Server 测试使用内存 fake Prisma，`$transaction` 只是同步调用 callback，没有 PostgreSQL 锁、唯一约束和事务竞争语义。
- 基金计划 Spec 标为“实现完成，待运行时验收”，任务文档却仍保留 T2 未完成；其并发补期同样只有 mock 级测试，没有真实数据库竞争。
- `docs/tasks/README.md` 将两项都列入“实现完成，仍保留验收边界”，使正确性缺口被误归类为仅剩浏览器/外部环境验收。

## 目标

1. 让同一计划的多个 materializer 在真实 PostgreSQL 并发下收敛：每个 `periodKey` 只有一个实例，`nextDueAt` 单调推进，竞争执行不产生可预期的版本冲突伪失败。
2. 让现金计划“已生成到期实例”与“需要通知用户”之间不存在不可恢复的提交空窗。
3. 在不合并现金与基金领域模型的前提下，建立最小、明确、可测试的月度物化契约，避免两套实现继续漂移。
4. 用真实 PostgreSQL 并发测试和 CI 守卫替代 mock 对并发正确性的推断。
5. 修正文档完成状态，使 Spec/Task 只宣称已有证据真正覆盖的能力。

## 非目标

- 不合并 `RecurringCashDepositPlan` 与 `RecurringFundInvestmentPlan` 数据表。
- 不把现金 `DEPOSIT` 与基金 `BUY_EXECUTION` 抽象成统一业务命令。
- 不创建通用 Job Framework，也不改写 PR #32 的 Automation durable occurrence/lease 设计。
- 不重构 Ledger、Portfolio、Risk、Performance、Backtest 或 Provider 体系。
- 不借本轮拆分所有大文件；现有 file-size ratchet 继续约束长期热点。
- 不新增基金定投通知。
- 不要求 Risk 通知在本轮强制迁移到新的 durable intent；只要求兼容现有 Risk delivery 路径。

## 设计方案

### A. 同计划 materialization 使用数据库串行化，而不是把调度冲突暴露成业务版本冲突

每个领域的 `materializePlan(planId, now)` 必须在单个 PostgreSQL 事务中先锁定对应计划行，再读取用于计算的最新状态。首选使用 `SELECT ... FOR UPDATE` 锁定该计划；锁只覆盖单一 `planId`，不同计划仍可并行。

锁内顺序固定为：

1. 锁定并重新读取计划；
2. 若计划已非 ACTIVE、`nextDueAt` 为空或已晚于 `now`，幂等返回 no-op；
3. 基于锁内最新 `nextDueAt` 计算全部 due periods；
4. 读取已有 `periodKey`，只插入缺失实例；数据库 `@@unique([planId, periodKey])` 保留为最终不变量；
5. 推进 `nextDueAt` 并 `version += 1`；
6. 返回本事务确定创建的月份。

materializer 不再把另一个合法 materializer 的推进解释为 `*_VERSION_CONFLICT`。乐观版本仍用于用户发起的编辑、暂停、恢复、结束、skip/reopen 等交互命令。

如果实现选择 bounded CAS retry 代替行锁，必须提供等价证明：竞争失败后重新读取最新计划、重新计算 horizon，并在有限重试后保证 no-op/success 收敛；不能简单吞掉 CAS 失败。首选仍是计划行锁，因为与现金原 Spec 的“唯一约束 + 锁”承诺一致，且验证面最小。

### B. 现金通知改为可恢复的 durable intent

现金 occurrence 的数据库提交不能再依赖一次 best-effort post-commit enqueue 才知道“需要通知”。实施时采用以下最小契约：

- 物化事务内必须同时持久化一个稳定、可重放的“通知意图身份”；
- 事务提交后才执行路由解析、Redis cooldown 与 route-specific `NotificationDelivery` 建立；
- 如果进程在业务提交后、delivery 建立前退出，Notification 模块下一轮 reconciliation 必须能从数据库恢复该 intent；
- intent 重放必须使用稳定 dedup identity，不能因重试生成新的业务通知；
- 已成功生成 delivery 后，后续发送失败继续由 Notification 模块现有重试状态机处理。

优先复用 Notification 模块作为 owner：可以新增轻量 `NotificationIntent`/transaction-aware outbox seam，或提供等价的 durable persistence API；现金计划不得直接写 `NotificationDelivery` 表，也不得把通知路由/Provider 细节吸收到 `cash-plans`。如果新增 schema，迁移必须兼容既有 Risk delivery，并提供 fresh + upgrade migration 验证。

`NotificationDispatcher`（或 Notification 模块内等价 reconciler）负责把 durable intent 收敛为 route-specific delivery，然后继续使用现有 delivery dispatcher。Automation 与现金计划 materializer 都不承担 intent recovery。

“未配置通知路由”与“瞬时 enqueue/reconcile 故障”必须区分：如果 reconciliation 时明确没有可用路由，intent 应记录稳定的 terminal `no-route/skipped` 结果（具体状态名按最终模型定义），默认不在用户未来新配置 Provider 后突然补发陈旧月份；只有显式重放策略可以重新打开。瞬时数据库/进程故障则保持可重试。

补期聚合语义保持不变：一次 materialization 对同一计划补齐多个历史月份时，用户只收到一条汇总通知。durable intent 需要保存足够的消息快照/period snapshot，不能在重放时依赖已变化的计划名称或 `nextDueAt`。

### C. 只抽取共享的不变量，不合并领域行为

允许抽取一个 Server 内部的最小 monthly materialization support，范围只包含：

- `periodKey`/月末截断等纯日期规则（若现有两份实现一致）；
- 计划锁/事务串行化的公共辅助契约；
- 可复用的并发测试 fixture。

以下内容保持各自领域拥有：账户/资产校验、Plan/Occurrence Prisma 模型、现金通知文案、确认写 Ledger 的命令与 payload、错误码和 Desktop 交互。

任何共享模块不得依赖 `cash-plans`、`fund-plans`、`automation`、`ledger` 或 `notifications` 领域模块；它只能承载纯函数或基础数据库协调能力。若抽取后接口反而需要大量泛型/回调才能表达两个领域，宁可保留少量重复，不建设通用框架。

### D. 补齐对称的边界守卫

`check-boundaries.mjs` 至少新增：

- `fund-plans -> automation` 禁止；
- `ledger -> fund-plans` 禁止。

如果通知 durable intent 仍由 Notification 模块提供，则继续保持 `notifications` 不反向依赖具体现金/基金计划。Cash/Fund 领域可以调用 Notification 的稳定公共接口，但 Notification 不识别计划领域类型。

同步 `docs/architecture/2026-09-02-server-module-boundaries.md`：明确 Automation → Cash/Fund 为编排方向；Ledger/Notification 不反向依赖计划领域；Notification 拥有 intent/delivery 生命周期。

### E. 真实 PostgreSQL 并发验收是完成条件

新增数据库级测试，至少覆盖：

- 两个并发 materializer 针对同一现金计划、同一 `now`：都以 success/no-op 收敛，不出现版本冲突；每月恰好一条 occurrence；`nextDueAt` 正确。
- 两个并发 materializer 针对同一基金计划：同上。
- 一个调用 horizon 更晚、一个更早时，不丢月份且 `nextDueAt` 不回退。
- materialization 与 pause/end 竞争：最终状态和 occurrence 集合符合锁获取顺序，不出现“计划已暂停但后续继续补期”的越界提交。
- 现金业务事务提交后模拟 intent reconciliation 前进程退出：重启后恢复同一 durable intent，且只形成一次业务通知。
- 无路由场景稳定落为 terminal skip；新增 Provider 不会自动补发旧月份。

mock 单元测试仍可保留用于日期和普通状态机，但不得作为数据库并发验收证据。

## 事务、并发与迁移风险

### 事务边界

- 计划锁只在单计划物化事务内持有；事务内不进行网络 I/O、Redis 操作或真实通知发送。
- Ledger 确认事务维持现状：现金继续走 `CashLedgerCommandService.createCashFlowWithEffect`，基金继续走 `LedgerCommandService.createExecutionWithEffect`。
- durable notification intent 可以与现金 occurrence/计划推进同事务持久化，但 route expansion 与 delivery 发送必须在事务外。

### 死锁与吞吐

- 每个事务只锁一个计划；禁止一次事务同时锁多计划，因此不建立跨计划锁顺序。
- `materializeDue` 可以继续顺序扫描；若未来并行化，不改变上述单计划锁契约。

### 迁移

- 并发加固本身不要求修改 Plan/Occurrence schema。
- 若 Notification durable intent 需要新表/字段，必须以追加方式迁移，不重写现有 `NotificationDelivery` 历史数据；旧 Risk 通知路径必须保持兼容。

### 兼容

- REST API、Desktop 数据形状、Plan/Occurrence 状态值和 Ledger 事实语义保持不变。
- 唯一可观察变化是并发扫描不再把合法竞争返回成业务冲突，以及现金通知在进程故障后可以恢复。
- 当前“没有通知 Provider 时不发送”的行为保持；新 intent 只让这一结果可审计，不把后来新增 Provider 解释为自动补发历史通知。

## 与现有 Spec 的关系

- 本 Spec 不取代现金/基金功能 Spec，而是重新打开其中关于“并发补期确定性”和现金“通知失败可恢复”的完成声明。
- 在本 Spec 对应 Task 完成前：
  - 现金 Spec 的 AC5、AC7 视为未完全关闭；
  - 基金 Spec 的 AC2/AC4 中并发与补期确定性视为未完全关闭；
  - 两份旧任务不得继续以“只剩运行时 smoke”描述当前状态。
- PR #32 的 Automation durable occurrence/owner lease 属于调度任务自身生命周期；本 Spec 处理业务计划内部 materialization 的数据库一致性，两者边界独立。

## 候选问题与本轮取舍

本轮还观察到 Ledger/import/market/integrity 等长期大文件、`packages/api-client/src/index.ts` 聚合体积，以及部分历史任务长期停留在运行时验收状态。现有 file-size ratchet、模块拆分任务或独立 Spec 已对这些问题形成约束，当前未发现比“周期计划并发正确性 + 通知提交空窗 + 文档过度完成”更明确的新 correctness 证据，因此不在本 PR 扩大重构范围。

Automation durable occurrence 已有开放 PR #32；Strategy/Risk/AI、Backtest、Ledger/Portfolio 等近期闭环也已有独立方案和验证证据，本轮不重复提交。

## 验收标准

- AC1：现金和基金同一计划的两个并发 materializer 在真实 PostgreSQL 下均以 success/no-op 收敛，不产生预期内的版本冲突错误。
- AC2：任意并发/重复扫描后，`planId + periodKey` 仍唯一，启用区间月份不丢失，`nextDueAt` 只前进不回退。
- AC3：pause/end 与 materialization 竞争时，事务序列化结果确定且不会在最终停用状态之后继续越界生成月份。
- AC4：现金 occurrence 一旦持久化，对应通知意图即可从数据库恢复；业务提交后进程退出不会永久丢失通知。
- AC5：现金补多月仍只形成一条稳定汇总通知；重放不会重复业务通知；没有配置路由时稳定记录为 terminal skip，不在未来 Provider 配置后自动补发。
- AC6：Notification 不反向依赖现金/基金领域；Ledger 不反向依赖计划领域；Fund 与 Cash 均不能依赖 Automation 编排层。
- AC7：新增真实 PostgreSQL 并发/故障恢复测试进入 CI 的确定性验证入口；mock 测试不再被文档表述为并发数据库证据。
- AC8：现金/基金旧 Spec、Task 与任务索引的完成状态同步修正，只有在上述验收通过后才能重新标记实现关闭。
