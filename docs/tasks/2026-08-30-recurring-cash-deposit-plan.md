# 定期现金入账计划实施任务

对应 Spec：[`../specs/2026-08-30-recurring-cash-deposit-plan.md`](../specs/2026-08-30-recurring-cash-deposit-plan.md)

状态：T1–T4 主体实现完成；并发物化与 durable notification 验收已于 2026-09-12 重新打开。

后续加固入口：[`2026-09-12-recurring-plan-materialization-hardening.md`](2026-09-12-recurring-plan-materialization-hardening.md)。旧任务中的 T3“并发运行不重复”和最终一致性 Review 不再代表真实 PostgreSQL 并发已验证；在加固任务完成前，AC5/AC7 仍为开放项。

## 跨任务契约

- `RecurringCashDepositPlan`：只面向启用的真实现金账户，固定账户币种和月度日期。
- `RecurringCashDepositOccurrence`：`planId + periodKey` 唯一，确认写入外部 `DEPOSIT`。
- `NotificationOutbox.enqueue(subject, message, policy)`：调用方提供稳定 subject 和消息快照；已落库 delivery 的发送失败不改变业务事务结果。业务提交与通知 intent 持久化之间的恢复保证由 2026-09-12 加固任务关闭。

## 任务

- [x] T1：实现定期入账计划与待确认实例闭环
  - 覆盖验收标准：AC1、AC2、AC3、AC4、AC6
  - 依赖：现金账户资金范围与内部划转 T1
  - 涉及范围：Prisma 迁移、共享 Schema、计划/实例模块、Controller、现金流确认编排和 Server 测试。
  - 完成条件：计划和实例状态机完整；确认与 Ledger 写入原子且幂等；暂停、恢复、结束和实例跳过/恢复行为确定。
  - 验证方式：Schema、Service、事务和 HTTP 验证测试；迁移矩阵与 `git diff --check`。
  - 验证证据：
    - 定期入账 Service/日期 fake-Prisma 单元测试与确定性状态测试通过；这些证据不再作为真实数据库并发锁语义证明。
    - `pnpm --filter @thesis-ledger/schemas exec vitest run test/ledger-v2.test.ts` 与 Schema build 既有证据保留。
    - Server typecheck 既有证据保留；真实 PostgreSQL 并发由 2026-09-12 加固任务补充。

- [x] T2：泛化通知 Outbox 并保留风险通知行为
  - 覆盖验收标准：AC7 的既有 delivery/发送重试部分
  - 依赖：T1
  - 涉及范围：Notification 数据迁移、通用接口、Dispatcher、Risk 调用方和通知测试。
  - 完成条件：Delivery 不再依赖 RiskEvent 才能构造消息；既有风险通知可投递；定期入账能按稳定去重键排队；发送失败与业务状态隔离。
  - 验证方式：Notification service/runtime 定向测试、旧数据迁移 fixture、未配置和重试场景。
  - 说明：本任务已覆盖“delivery 成功落库之后”的失败重试，但没有覆盖 occurrence/计划已提交、`enqueue` 尚未形成 durable delivery 时的进程/数据库故障；该空窗由 2026-09-12 加固任务 T4 关闭。

- [x] T3：接入现有 Automation Scheduler 并实现漏期补齐
  - 覆盖验收标准：AC2、AC5、AC6、AC7
  - 依赖：T1、T2
  - 涉及范围：Automation Job 类型、固定扫描任务、Handler、日期纯函数和运行历史。
  - 完成条件：单例任务扫描所有到期计划；补齐全部启用期漏期；暂停月份跳过；补期通知按计划合并。
  - 重新打开项：同计划真实 PostgreSQL 并发扫描必须 success/no-op 收敛，不能把合法 materializer 竞争抛成业务版本冲突；fake Prisma `$transaction` 不是该验收证据。
  - 后续验证：见 2026-09-12 加固任务 T1/T2/T4/T6。

- [x] T4：交付 Desktop 定期入账与待办界面
  - 覆盖验收标准：AC1、AC3、AC4、AC8
  - 依赖：T1、T3
  - 涉及范围：账户数据现金页、TanStack Query、计划/确认 Sheet、上下文菜单、通知/错误提示和 Desktop 测试。
  - 完成条件：现金账户可创建和管理计划；待确认实例突出显示；确认可修改实际金额与日期；跳过/恢复与错误状态清楚；不新增页面级 CSS。
  - 既有 Desktop 定向测试/typecheck 证据保留；浏览器/键盘运行时验收仍按原记录作为外部验收边界。

## 重新打开任务

- [ ] H1：完成 [`2026-09-12-recurring-plan-materialization-hardening.md`](2026-09-12-recurring-plan-materialization-hardening.md) 的现金侧 T1/T2/T4/T6/T7/T8。
- [ ] H2：真实 PostgreSQL 证明同计划并发物化不产生伪版本冲突、月份不丢失、`nextDueAt` 不回退。
- [ ] H3：业务事务提交后通知 intent 可恢复，catch-up 汇总通知稳定去重。

## 最终一致性 Review

- [x] 主体功能的计划/实例/Ledger/Desktop 实现已存在
- [x] Ledger 确认事务保持原子与幂等
- [ ] AC5 的真实数据库并发保证已验证
- [ ] AC7 的业务提交后 durable notification intent 已验证
- [ ] 测试策略、文档完成状态与真实证据完全一致

### Review 结论

- 2026-09-12 全仓 Review 结论：此前“全部完成”的描述过强。功能主体仍然有效，但同计划 materialization 的并发收敛和业务提交到通知 intent 的故障恢复存在新增确定性证据，必须通过独立加固任务关闭。
- 原有 fake-Prisma/Notification/Server/Desktop 测试证据继续作为普通状态机与回归证据，不再被引用为 PostgreSQL 并发或 post-commit crash recovery 的证明。
