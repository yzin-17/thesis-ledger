# 基金定投计划实施任务

对应 Spec：[`../specs/2026-09-08-recurring-fund-investment.md`](../specs/2026-09-08-recurring-fund-investment.md)

状态：主体实现存在；T2 与真实 PostgreSQL 并发物化验收仍未完成。

后续加固入口：[`2026-09-12-recurring-plan-materialization-hardening.md`](2026-09-12-recurring-plan-materialization-hardening.md)。

## 2026-09-12 全仓 Review 修正

此前文档同时写有“实现完成，待运行时验收”和未勾选 T2，完成状态自相矛盾；同时现有基金 materialization 测试使用 mock Prisma，不能证明真实 PostgreSQL 下两个并发扫描会幂等收敛。当前实现会在两个执行者读取同一 `version/nextDueAt` 后让其中一个 CAS 推进失败并抛版本冲突。

因此 T2 保持未完成，并把并发补期正确性显式转入 2026-09-12 加固任务。账户/标的约束、确认成交原子事务、Desktop 入口以及以下历史验证证据继续保留。

## 任务

- [x] T1：交付基金定投计划、到期记录与确认成交的服务端闭环
  - 覆盖验收标准：AC1、AC2、AC3、AC4、AC6 的主体功能
  - 依赖：无
  - 涉及范围：Prisma 模型与迁移、共享 Schema/API Client、定投 Module/Controller/Service、Ledger 原子确认接口、Server/Schema 测试。
  - 完成条件：计划与到期记录状态机完整；创建范围受账户和标的约束；确认与 `BUY_EXECUTION` 原子且幂等；既有 Ledger 与定期现金入账回归通过。
  - 验证方式：Schema、Service、Ledger、迁移矩阵、边界检查和 typecheck。
  - 限定：现有 mock materialization 测试只证明日期/数据形状和普通事务编排，不作为真实数据库并发语义证明。

- [ ] T2：接入现有 Scheduler、关闭并发补期正确性并完成成交页运行时验收
  - 覆盖验收标准：AC2、AC4、AC5、AC6
  - 依赖：T1
  - 涉及范围：Automation 类型/Handler/固定任务、真实 PostgreSQL 并发物化、Desktop TanStack Query、成交页定投区与 Sheets、定向 UI 测试。
  - 完成条件：调度可补齐到期记录；同计划并发 materializer 均以 success/no-op 收敛且不丢月份；真实基金账户显示完整入口；可创建和管理计划、确认/跳过/恢复到期记录；其他账户不出现入口。
  - 验证方式：2026-09-12 加固任务 T1/T3/T6 的 PostgreSQL 并发测试、Automation runtime 测试、Desktop API/UI 测试、typecheck、build 和浏览器交互验收。

## 与周期计划加固任务的分工

- [ ] H1：完成 [`2026-09-12-recurring-plan-materialization-hardening.md`](2026-09-12-recurring-plan-materialization-hardening.md) T1/T3/T5/T6/T7/T8。
- [ ] H2：补真实 PostgreSQL 同计划并发、不同 horizon、pause/end 竞争测试。
- [ ] H3：补 `fund-plans -> automation`、`ledger -> fund-plans` 对称边界守卫。

## 最终一致性 Review

- [x] 主体模型、确认成交与现有确定性测试已有实现
- [x] 确认成交继续通过 Ledger 原子回调写入一次 `BUY_EXECUTION`
- [x] 所有原有确定性验证证据继续保留，不因重新打开并发项而失效
- [ ] T2 Scheduler/运行时验收完成
- [ ] 真实 PostgreSQL 并发补期保证完成
- [ ] Spec、Task、README 的完成状态与最终证据一致

### Review 结论

- 2026-09-12 结论：代码主体不是空缺，但不能再归类为“仅剩外部运行时 smoke”。并发 materialization 是数据库正确性验收缺口，且 T2 原本就未完成。
- 原结论与运行边界保留：代码实现与确定性验证已有大量证据，但旧 Server 运行实例曾因未包含新增接口返回 `404`，当时未完成新 baseline Server 上的实际创建、物化和确认成交。
- 历史验证命令与结果继续保留：
  - `pnpm --dir packages/schemas test`：9 个测试文件、106 项测试通过。
  - `pnpm --dir packages/api-client test`：1 个测试文件、10 项测试通过。
  - `pnpm --dir apps/server exec vitest run test/fund-plans/recurring-fund-investment.test.ts test/automation-runtime.test.ts test/cash-plans/recurring-cash-deposit.service.test.ts test/ledger/ledger-command.service.test.ts`：4 个测试文件、50 项测试通过（新增物化补期覆盖后，定投测试单独复跑 4 项通过）。
  - `pnpm --dir apps/desktop exec vitest run test/account-data.fund-investment.test.tsx test/account-data.ui.test.tsx test/account-data.cash.test.tsx`：3 个测试文件、26 项测试通过。
  - `pnpm --dir apps/server typecheck`、`pnpm --dir apps/desktop build`、迁移矩阵、模块边界与文件规模门禁通过；桌面构建仅有既有 chunk 体积提示。
  - 本次相关文件的定向 ESLint 通过；全仓 `guardrails:complexity` 曾被 `RiskRuleWorkbench.tsx` 中与本功能无关的既有 `@typescript-eslint/no-unnecessary-type-assertion` 错误拦截。
  - 浏览器历史证据：真实基金账户显示“基金定投”区域并可打开新建表单；证券账户不显示。旧 Server 返回新增接口 `404`，因此当时未执行提交和确认成交。
- 2026-09-12 限定：上述 mock materialization 测试不等价于 PostgreSQL 并发验证，必须由周期计划加固任务新增的 DB 级测试关闭。
