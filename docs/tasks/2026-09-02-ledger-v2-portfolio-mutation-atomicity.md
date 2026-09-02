# Ledger V2 Portfolio Mutation Atomicity Tasks

> 日期：2026-09-02  
> 状态：Planned  
> 对应 Spec：[`2026-09-02-ledger-v2-portfolio-mutation-atomicity`](../specs/2026-09-02-ledger-v2-portfolio-mutation-atomicity.md)

## 目标

关闭当前 Ledger V2 写边界中的两个明确缺口：持仓身份修改的跨命令中间态，以及批量清仓的部分提交风险。保持修复范围集中，不重开 Ledger V2 设计。

## TASK-ARCH-072：确认 V2 复合命令 Revision 语义

优先级：P0

- [ ] 核对 `LedgerV2Repository.withAccountWrite()` / `withAccountsWrite()` 的 revision 推进语义。
- [ ] 明确一次复合命令内追加多条 `LedgerEventV2` 时的 `ledgerRevision` 分配规则。
- [ ] 保证 `economicOrderKey` 在复合命令内唯一、稳定、可重放。
- [ ] 明确同账户与跨账户命令的 Projection Generation 推进规则。
- [ ] 将最终规则补充到现有 Ledger V2 Architecture/Engineering SSOT；不复制完整协议到多个文档。

验收：复合命令语义不破坏 `asOfRevision` 重放、账户级串行化和现有专用成交命令。

## TASK-ARCH-073：原子持仓身份迁移命令

优先级：P0

- [ ] 在 `LedgerService` 增加窄范围的 position baseline move 命令。
- [ ] 同账户换 symbol 使用一个 `withAccountWrite()`。
- [ ] 跨账户使用一个 `withAccountsWrite()`，按 Repository 的稳定账户顺序锁定。
- [ ] 在同一事务中追加旧位置清零与新位置 Baseline Observation。
- [ ] 每个受影响账户只执行一次最终 projection rebuild。
- [ ] 任一步骤失败时全部事件、Revision、Generation 和 Position 投影回滚。
- [ ] `PortfolioService.updatePosition()` 在 account/symbol 变化时只调用该命令。
- [ ] 删除 Portfolio 层“先 setPosition(0)，再 setPosition(target)”的顺序编排。

测试：

- [ ] 同账户换 symbol 成功。
- [ ] 新 symbol 写入失败时旧 Position 不变。
- [ ] 跨账户成功迁移。
- [ ] 目标账户校验/写入/rebuild 失败时两个账户均回滚。
- [ ] 并发跨账户操作不使用反向锁序。

## TASK-ARCH-074：原子批量清仓命令

优先级：P1

- [ ] 在 `LedgerService` 增加 `clearPositions(accountId)` 或等价窄命令。
- [ ] 在一个账户写事务内读取实际目标 Position 集合。
- [ ] 按稳定顺序追加全部 quantity=0 Baseline Observation。
- [ ] 全部事件写入后仅执行一次 projection rebuild。
- [ ] 返回事务内实际 cleared 数量。
- [ ] `PortfolioService.clearPositions()` 只调用 Ledger 复合命令。
- [ ] 删除 Portfolio 层对 Position 的事务外读取和逐条 `setPosition()` 循环。

测试：

- [ ] 0 个 Position 时稳定返回 0。
- [ ] 多 Position 全部成功清空。
- [ ] 中间任一事件失败时整批回滚。
- [ ] rebuild 失败时整批回滚。
- [ ] 多 Position 只执行一次最终 rebuild。

## TASK-ARCH-075：复合账本写边界回归守卫

优先级：P2

- [ ] 增加 Portfolio service 测试，明确身份迁移不会调用两个独立 `setPosition()`。
- [ ] 增加 clearPositions 测试，明确 Portfolio 不再循环调用单标的写命令。
- [ ] 在代码注释或 Engineering SSOT 中记录：Portfolio 不拥有多 Ledger 写入事务边界。
- [ ] Review 其他当前写入口，确认没有同类“一个用户意图拆成多个独立账户写命令”的明显路径；只记录确认的问题，不借机大规模重构。

## TASK-DOC-076：收敛旧周审结论

优先级：P2

- [ ] 将旧 PR #21 中 Ledger `sequence/ordinal` 方案标记为已被 Ledger V2 的 `ledgerRevision + economicOrderKey` 设计替代。
- [ ] 保留其中仍有效的 Backtest lifecycle 和 workspace dependency guard 观察，但不把它们混入本次 Ledger V2 原子性实施 PR。
- [ ] 实现完成后同步当前 Trade/Ledger task 状态，避免“V2 事务边界已全部完成”的表述掩盖 Portfolio 复合命令缺口。

## 推荐实施顺序

```text
072 revision semantics
  ├─> 073 atomic position move
  └─> 074 atomic clear positions
          ↓
075 regression guard
          ↓
076 documentation convergence
```

073 和 074 可以在 072 规则确定后并行，但不要分别发明不同的 batch revision 规则。

## 完整验证门禁

实施 PR 合并前至少执行：

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm contract:test`
- [ ] `pnpm guardrails:complexity`
- [ ] `pnpm migration:matrix`（若有 schema/migration 变化）

## 风险控制

- 不引入通用 Command Bus / Unit of Work / Saga。
- 不把 position baseline mutation 改造成成交事实。
- 不修改 Unified Backtest V2 范围。
- 不为满足抽象对称性迁移无关 Ledger 命令。
- 若实现发现 `withAccountsWrite()` 无法安全承载本需求，先更新 Spec 说明具体约束，再调整任务；禁止退回应用层两次独立事务作为临时完成方案。
