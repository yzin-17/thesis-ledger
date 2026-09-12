# 定期现金入账计划实施任务

对应 Spec：[`../specs/2026-08-30-recurring-cash-deposit-plan.md`](../specs/2026-08-30-recurring-cash-deposit-plan.md)

状态：T1–T4 主体实现完成；AC5/AC7 的并发物化与 durable notification 验收已于 2026-09-12 重新打开。

后续加固入口：[`2026-09-12-recurring-plan-materialization-hardening.md`](2026-09-12-recurring-plan-materialization-hardening.md)。原有验证证据继续保留，但 fake Prisma `$transaction` 不再作为真实 PostgreSQL 并发锁语义证明；既有 Notification 测试也不证明 occurrence 提交后、delivery 落库前的 crash recovery。

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
    - 本轮定向回归包含定期入账 Service/日期测试：5 个测试与 3 个测试均通过；完整 Server 定向集合为 10 个测试文件、78 个测试通过。
    - `pnpm --filter @thesis-ledger/schemas exec vitest run test/ledger-v2.test.ts`：1 个测试文件、42 个测试通过；`pnpm --filter @thesis-ledger/schemas build`：通过。
    - `pnpm --filter @thesis-ledger/server typecheck`：通过；本轮未重新执行 Prisma 部署或迁移矩阵，不新增相关运行证据。

- [x] T2：泛化通知 Outbox 并保留风险通知行为
  - 覆盖验收标准：AC7 的既有 delivery/发送重试部分
  - 依赖：T1
  - 涉及范围：Notification 数据迁移、通用接口、Dispatcher、Risk 调用方和通知测试。
  - 完成条件：Delivery 不再依赖 RiskEvent 才能构造消息；既有风险通知可投递；定期入账能按稳定去重键排队；发送失败与业务状态隔离。
  - 验证方式：Notification service/runtime 定向测试、旧数据迁移 fixture、未配置和重试场景。
  - 验证证据：
    - 本轮 Notification runtime 11 个测试、Notification service 10 个测试、Risk service 9 个测试、Risk state machine 10 个测试和 Risk market contract 11 个测试均通过；均包含在 Server 定向 78/78 结果中。
    - 新增 subject 状态契约测试通过；`risk-notification.ts` 不再直接访问 Prisma NotificationDelivery，Server typecheck 与 `node scripts/check-boundaries.mjs` 均通过。
    - 本轮未执行真实迁移部署、Server 启动或外部通知投递，不新增相应运行时证据。
  - 2026-09-12 限定：上述证据覆盖 delivery 已持久化之后的失败/重试，但没有覆盖 occurrence/计划已提交、`enqueue` 尚未形成 durable delivery 时的进程或数据库故障；该空窗由加固任务 T4 关闭。

- [x] T3：接入现有 Automation Scheduler 并实现漏期补齐
  - 覆盖验收标准：AC2、AC5、AC6、AC7
  - 依赖：T1、T2
  - 涉及范围：Automation Job 类型、固定扫描任务、Handler、日期纯函数和运行历史。
  - 完成条件：单例任务扫描所有到期计划；补齐全部启用期漏期；暂停月份跳过；补期通知按计划合并。
  - 重新打开项：同计划真实 PostgreSQL 并发扫描必须 success/no-op 收敛，不能把合法 materializer 竞争抛成业务版本冲突。
  - 验证方式：日期纯函数、Automation service/runtime/scheduler、真实 PostgreSQL 并发与重启恢复测试，真实 Scheduler 运行演练。
  - 验证证据：
    - 既有 Automation/Scheduler 证据保留；本轮只执行定期入账日期/Service 回归，未重新执行 Automation runtime、Scheduler 或真实运行演练。
    - 2026-09-12 Review 确认现有 Service 并发测试使用 fake Prisma，因此不能作为计划行锁/事务竞争证据。

- [x] T4：交付 Desktop 定期入账与待办界面
  - 覆盖验收标准：AC1、AC3、AC4、AC8
  - 依赖：T1、T3
  - 涉及范围：账户数据现金页、TanStack Query、计划/确认 Sheet、上下文菜单、通知/错误提示和 Desktop 测试。
  - 完成条件：现金账户可创建和管理计划；待确认实例突出显示；确认可修改实际金额与日期；跳过/恢复与错误状态清楚；不新增页面级 CSS。
  - 验证方式：Desktop API/UI 测试、typecheck、build、宽窄屏浏览器和键盘验收。
  - 验证证据：
    - Desktop 定向回归 5 个测试文件、34 个测试通过；覆盖定期入账 CONFIRMED 历史、PENDING 逾期、SKIPPED 恢复、账户/Tab 切换清理、持仓 Empty、Risk 和 Portfolio。
    - `pnpm --filter @thesis-ledger/desktop typecheck`：通过。
    - 本轮未执行 Desktop build、浏览器或键盘运行时验收，不将其作为本轮证据。

## 2026-09-12 重新打开任务

- [ ] H1：完成 [`2026-09-12-recurring-plan-materialization-hardening.md`](2026-09-12-recurring-plan-materialization-hardening.md) 的现金侧 T1/T2/T4/T6/T7/T8。
- [ ] H2：真实 PostgreSQL 证明同计划并发物化不产生伪版本冲突、月份不丢失、`nextDueAt` 不回退。
- [ ] H3：业务事务提交后通知 intent 可恢复，catch-up 汇总通知稳定去重。

## 最终一致性 Review

- [x] 主体计划/实例/Ledger/Desktop 功能已有对应实现
- [x] 所有原已勾选任务均保留其历史验证证据
- [x] 跨任务接口、类型和命名保持一致（如适用）
- [x] 实现未超出原 Spec 声明的主体范围
- [ ] AC5 的真实数据库并发保证已验证
- [ ] AC7 的业务提交后 durable notification intent 已验证
- [ ] 测试策略、测试实现与完成状态已与 2026-09-12 新证据完全同步

### Review 结论

- 2026-09-12 全仓 Review 结论：此前“全部完成”的描述过强。主体功能与既有确定性回归证据仍然有效，但同计划 materialization 的 PostgreSQL 并发收敛和业务提交到通知 intent 的故障恢复存在明确缺口，必须通过周期计划加固任务关闭。
- 历史验证证据：Schema ledger-v2 42/42、Schema build、Server 定向 10 个文件 78/78、Server typecheck、Desktop 定向 5 个文件 34/34、Desktop typecheck 和 `scripts/check-boundaries.mjs` 均曾通过；这些证据不再被解释为 PostgreSQL 并发或 post-commit crash recovery 证明。
- 原遗留风险继续保留：真实迁移部署、Scheduler/Compose 运行、外部通知投递、Desktop build 或浏览器验收仍需按各自运行时门禁执行。
