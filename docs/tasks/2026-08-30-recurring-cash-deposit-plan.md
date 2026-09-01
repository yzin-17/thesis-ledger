# 定期现金入账计划实施任务

对应 Spec：[`../specs/2026-08-30-recurring-cash-deposit-plan.md`](../specs/2026-08-30-recurring-cash-deposit-plan.md)

状态：T1–T4 已完成并验证。

## 跨任务契约

- `RecurringCashDepositPlan`：只面向启用的真实现金账户，固定账户币种和月度日期。
- `RecurringCashDepositOccurrence`：`planId + periodKey` 唯一，确认写入外部 `DEPOSIT`。
- `NotificationOutbox.enqueue(subject, message, policy)`：调用方提供稳定 subject 和消息快照；通知失败不改变业务事务结果。

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
  - 覆盖验收标准：AC7
  - 依赖：T1
  - 涉及范围：Notification 数据迁移、通用接口、Dispatcher、Risk 调用方和通知测试。
  - 完成条件：Delivery 不再依赖 RiskEvent 才能构造消息；既有风险通知可投递；定期入账能按稳定去重键排队；发送失败与业务状态隔离。
  - 验证方式：Notification service/runtime 定向测试、旧数据迁移 fixture、未配置和重试场景。
  - 验证证据：
    - 本轮 Notification runtime 11 个测试、Notification service 10 个测试、Risk service 9 个测试、Risk state machine 10 个测试和 Risk market contract 11 个测试均通过；均包含在 Server 定向 78/78 结果中。
    - 新增 subject 状态契约测试通过；`risk-notification.ts` 不再直接访问 Prisma NotificationDelivery，Server typecheck 与 `node scripts/check-boundaries.mjs` 均通过。
    - 本轮未执行真实迁移部署、Server 启动或外部通知投递，不新增相应运行时证据。

- [x] T3：接入现有 Automation Scheduler 并实现漏期补齐
  - 覆盖验收标准：AC2、AC5、AC6、AC7
  - 依赖：T1、T2
  - 涉及范围：Automation Job 类型、固定扫描任务、Handler、日期纯函数和运行历史。
  - 完成条件：单例任务扫描所有到期计划；补齐全部启用期漏期；暂停月份跳过；并发运行不重复；补期通知按计划合并。
  - 验证方式：日期纯函数、Automation service/runtime/scheduler、并发与重启恢复测试，真实 Scheduler 运行演练。
  - 验证证据：
    - 既有 Automation/Scheduler 证据保留；本轮只执行定期入账日期/Service 回归，未重新执行 Automation runtime、Scheduler 或真实运行演练。

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

## 最终一致性 Review

- [x] Spec 中的全部验收标准均有对应实现
- [x] 所有已勾选任务均有验证证据
- [x] 所有任务依赖均已满足且无错误阻塞关系
- [x] 跨任务接口、类型和命名保持一致（如适用）
- [x] 不存在未解决的 Blocking 问题、占位描述或未定义的实现契约
- [x] 实现未超出 Spec 声明的范围
- [x] 测试策略、测试实现与验证结果一致
- [x] 测试与文档已同步更新
- [x] 必要实施 Step 均已验证；未获提交授权，工作保持未提交
- [x] 未发现实现、Spec 与任务文档之间的不一致

### Review 结论

- 结论：本轮 review finding 的确定性回归已通过，定期入账、通知、Risk 和 Desktop 相关状态契约保持一致；Server/Desktop typecheck 已在最终落盘版本上复核通过。
- 发现的问题：无确定性测试失败。
- 遗留风险：本轮未执行真实迁移部署、Scheduler/Compose 运行、外部通知投递、Desktop build 或浏览器验收；`pnpm dlx shadcn@latest docs empty` 因本机 `@modelcontextprotocol/sdk` 引用 Zod `./v3` 导出错误退出，仅作为工具限制记录。
- 验证命令与结果：Schema ledger-v2 42/42、Schema build、Server 定向 10 个文件 78/78、Server typecheck、Desktop 定向 5 个文件 34/34、Desktop typecheck 和 `scripts/check-boundaries.mjs` 均通过。
