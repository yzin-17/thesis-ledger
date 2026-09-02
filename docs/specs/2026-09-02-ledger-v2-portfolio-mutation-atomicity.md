# Ledger V2 Portfolio Mutation Atomicity Spec

> 日期：2026-09-02  
> 状态：Draft  
> 任务标识：`2026-09-02-ledger-v2-portfolio-mutation-atomicity`

## 背景

本 Spec 来自对当前 `main` 的全仓架构 Review。Ledger V2 已经建立账户级 Ledger Revision、`economicOrderKey`、账户写锁、Projection Generation 和原子投影重建，旧版“同时间事件缺少稳定顺序”的问题已经被 V2 设计替代；但 Portfolio 的部分高层写操作仍把一次用户意图拆成多个独立 `LedgerService.setPosition()` 命令。

当前两个明确入口是：

- `PortfolioService.updatePosition()` 在账户或标的变化时，先对旧位置执行一次 `setPosition(..., 0)`，再对新位置执行第二次 `setPosition(...)`；
- `PortfolioService.clearPositions()` 遍历当前持仓，并为每个标的分别执行一次 `setPosition(..., 0)`。

`setPosition()` 自身通过 `LedgerV2Repository.withAccountWrite()` 原子提交单次 Baseline Observation 与 projection rebuild，但多个 `setPosition()` 之间没有共同事务。因此“单个账本命令原子”并不等于“一个用户操作原子”。

## 已确认问题

### P0：持仓身份修改存在跨命令中间态

当用户修改 `accountId` 或 `symbol` 时，当前实现先清零旧位置，再建立新位置。如果第二步因账户约束、资产校验、数据库错误或并发冲突失败，第一步已经提交，用户会得到失败响应，但旧持仓已被清零。

跨账户修改风险更高：两个账户的 Revision / Projection Generation 会分两次独立推进，无法表达一个原子的“迁移持仓”业务意图。

### P1：批量清仓不是整批原子操作

`clearPositions()` 为每个 Position 分别调用 `setPosition()`。任一中途失败都会留下“前半部分已清空、后半部分未清空”的状态；同时每条持仓都会单独 rebuild，同一账户产生不必要的重复投影重建。

### P1：事务所有权从 Ledger 命令层泄漏到 Portfolio 编排层

V2 Spec 已明确：状态型账本操作需要账户锁、Revision 与核心投影原子提交；跨账户更正应按稳定账户顺序锁定并原子提交。当前 Portfolio 通过顺序调用多个单命令 API 来拼装复合写入，使事务边界由调用方隐式决定，后续新增批量/迁移操作容易重复同类问题。

## Spec 完成度与文档偏差

### 已被实现替代的旧结论

旧周审 PR #21 提议为 Ledger 增加独立 `sequence/ordinal`。当前 Ledger V2 已使用 `ledgerRevision` 与 `economicOrderKey` 定义版本和经济顺序，因此该部分方案已经过期，不应继续按 Ledger V1 设计实施。

### 仍有效但需要按 V2 重述的结论

旧周审指出批量清仓缺少事务语义，这一点当前仍成立；但修复方式应基于 `LedgerV2Repository.withAccountWrite()` / `withAccountsWrite()`，而不是恢复 V1 transaction helper。

### 与当前 V2 Spec 的偏离

`docs/specs/2026-08-26-trade-ledger-write-correction.md` 已规定：

- 同账户命令串行；
- 跨账户更正按稳定账户顺序锁定并原子提交；
- 一次成功命令原子提交 LedgerEvent、Ledger Revision、核心投影和 Projection Generation。

Portfolio 的复合变更尚未遵循同一事务原则，因此应作为 V2 写入边界的补充收敛，而不是新建第二套账本机制。

## 目标

1. 让“持仓账户/标的迁移”成为 Ledger 层拥有的单一业务命令。
2. 让“清空账户全部持仓”成为 Ledger 层拥有的单一批量业务命令。
3. 确保一个用户意图对应的全部 LedgerEvent、Revision 与 Projection Generation 原子提交或原子回滚。
4. 减少批量操作中的重复 projection rebuild。
5. 固化 Portfolio 只负责输入解析/业务入口，复合账本写事务由 Ledger 层拥有的依赖方向。

## 非目标

- 不重写 Ledger V2、Trade Projection 或 Baseline 模型。
- 不引入通用 Unit of Work / Command Bus / Saga 框架。
- 不改变普通单标的 `setPosition()` 的用户语义。
- 不把持仓校准改造成 BUY/SELL 成交。
- 不重构 Desktop / Mobile。
- 不顺带实现 Unified Backtest V2；其当前 Spec 已明确处于待实施状态。

## 方案

### 1. 新增原子持仓迁移命令

在 `LedgerService` 增加窄接口，例如：

```ts
movePositionBaseline({
  from: { accountId, symbol, costPrice },
  to: { accountId, symbol, quantity, costPrice },
  source,
  options,
})
```

规则：

- 同账户换标的：只获取一个账户写上下文；
- 跨账户：使用 `withAccountsWrite([fromAccountId, toAccountId])`，由 Repository 按稳定账户 ID 顺序获取锁；
- 在同一数据库事务内追加旧位置清零与新位置 Baseline Observation；
- 每个受影响账户只 rebuild 一次；
- 只有全部写入和 rebuild 成功后才推进对应 Ledger Revision / Projection Generation；
- 任一步失败则两个账户全部回滚。

不要求把两个账户压成同一个 Ledger Revision；要求的是两个账户的各自 Revision 在一个数据库事务中共同成功或共同失败。

### 2. 新增原子批量清仓命令

在 `LedgerService` 增加 `clearPositions(accountId)` 或等价窄命令：

1. 在一个 `withAccountWrite()` 中读取该账户当前 Position；
2. 为全部 Position 追加 quantity=0 的 `POSITION_BASELINE_OBSERVATION`；
3. 使用稳定顺序（例如 symbol ASC）生成批次内 `economicOrderKey`；
4. 全部追加完成后只执行一次 projection rebuild；
5. 单次推进账户 Revision / Projection Generation；
6. 任一写入失败则整批回滚。

如果 V2 的 Revision 语义要求“一条事件一个 revision”，则应在实现前明确批量命令的 revision 分配规则并保持可重放；不能通过退回多事务来规避问题。

### 3. Portfolio 收敛为调用方

`PortfolioService.updatePosition()`：

- `accountId/symbol` 未变化时继续使用单标的 `setPosition()`；
- 任一身份字段变化时只调用新的原子迁移命令，不再自行先清零再建立。

`PortfolioService.clearPositions()`：

- 不再查询 Position 后循环调用 `setPosition()`；
- 只调用 Ledger 暴露的原子批量清仓命令。

### 4. 架构守卫与回归规则

本阶段不建设复杂静态分析，但应增加可维护的回归保护：

- 单元/服务测试锁定 Portfolio 不再编排两次 `setPosition()`；
- Ledger 测试覆盖同账户迁移、跨账户迁移、批量清仓和中途失败回滚；
- 如后续出现第三个“一个用户意图对应多个 Ledger 写入”的入口，再评估抽取更通用的复合命令 helper。

## 架构规则

实施后形成以下约束：

1. **Portfolio 可以发起账本业务命令，但不拥有多条账本写入的事务边界。**
2. **一次用户写意图需要修改多个 Ledger 事实时，由 Ledger 层提供一个显式复合命令。**
3. **跨账户复合命令必须通过 `withAccountsWrite()` 统一锁定，禁止应用层顺序调用两个账户级命令模拟原子性。**
4. **批量同账户写入应在一次锁定中完成，并尽量只 rebuild 一次。**

## 验收标准

### 持仓迁移

- 修改 symbol 时，第二条事件故障不会留下旧持仓已清零状态。
- 修改 accountId 时，任一账户写入或 rebuild 失败，两个账户均保持操作前状态。
- 成功时旧位置为 0、新位置为目标数量，两个账户 projection 与 ledger 状态一致。
- 同账户/跨账户并发写入遵守 V2 账户锁顺序，不产生死锁式反向锁序。

### 批量清仓

- N 个持仓中任一追加失败时，N 个持仓全部保持原状态。
- 成功时全部目标 Position 一次性清零。
- 同一账户批量清仓只进行一次最终 projection rebuild。
- 返回的 cleared 数量来自事务内实际目标集合，而不是事务外陈旧快照。

### 架构

- `PortfolioService.updatePosition()` 不再包含“先清旧、再写新”的两次独立 Ledger 命令。
- `PortfolioService.clearPositions()` 不再循环调用单标的 `setPosition()`。
- 不新增通用 Job/Command/Saga 框架。

## 验证方式

至少执行：

- `pnpm --filter @thesis-ledger/server test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm contract:test`
- `pnpm migration:matrix`（仅在需要 schema/migration 时）
- `pnpm guardrails:complexity`

重点回归：

- Portfolio identity move success / rollback；
- cross-account move rollback；
- clearPositions all-or-nothing；
- batch rebuild count；
- concurrent account lock ordering。

## 风险

- Ledger V2 的 `ledgerRevision` 当前以账户写上下文管理，批量命令需要明确一次命令内多事件如何分配 revision；实现不得破坏现有历史重放语义。
- 跨账户事务会延长同时持有两个账户锁的时间，应保持命令范围窄，并按稳定顺序锁定。
- 若直接复用 `appendPositionBaselineWithClient()`，需要确认其 batch/economicOrderKey 在同一复合命令中保持唯一且确定。

## 优先级

1. P0：原子持仓身份迁移；
2. P1：原子批量清仓与单次 rebuild；
3. P2：补充回归守卫与旧周审文档状态说明。
