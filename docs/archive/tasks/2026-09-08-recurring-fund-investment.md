# 基金定投计划实施任务

> 完成（2026-10-04）：T2.R1/R2/R3 已通过真实隔离 PostgreSQL、目标 Scheduler/Server 和 Desktop Browser 验收；修复首次日期精度成交的成本策略比较错误。详见[运行时验收证据](../../tasks/evidence/2026-10-04-recurring-fund-runtime.md)。2026-10-03 的旧 404 阻塞解除只是前置状态，本次完成结论由实际创建、物化、确认与消费面证据支持。

对应 Spec：[`../../specs/2026-09-08-recurring-fund-investment.md`](../../specs/2026-09-08-recurring-fund-investment.md)

状态：全部实施与验收完成，工作保持未提交。

## 任务

- [x] T1：交付基金定投计划、到期记录与确认成交的服务端闭环
  - 覆盖验收标准：AC1、AC2、AC3、AC4、AC6
  - 依赖：无
  - 涉及范围：Prisma 模型与迁移、共享 Schema/API Client、定投 Module/Controller/Service、Ledger 原子确认接口、Server/Schema 测试。
  - 完成条件：计划与到期记录状态机完整；创建范围受账户和标的约束；确认与 `BUY_EXECUTION` 原子且幂等；既有 Ledger 与定期现金入账回归通过。
  - 验证方式：Schema、Service、Ledger、迁移矩阵、边界检查和 typecheck。

- [x] T2：接入现有 Scheduler 并交付成交页基金定投界面
  - 覆盖验收标准：AC2、AC4、AC5、AC6
  - 依赖：T1
  - 涉及范围：Automation 类型/Handler/固定任务、Desktop TanStack Query、成交页定投区与 Sheets、定向 UI 测试。
  - 完成条件：调度可补齐到期记录；真实基金账户显示完整入口；可创建和管理计划、确认/跳过/恢复到期记录；其他账户不出现入口。
  - 验证方式：Automation runtime 测试、Desktop API/UI 测试、typecheck、build 和浏览器交互验收。

### T2 运行时验收分步（2026-10-04）

- [x] T2.R1：验证创建、调度物化与确认成交的最小闭环
  - 覆盖：AC1、AC2、AC3、AC6；依赖 T1。
  - 执行范围：真实隔离 PostgreSQL、生产 Nest Controller/Service、Automation Scheduler 与当前 Ledger。
  - 完成条件：真实基金账户创建计划； Scheduler 补齐到期记录且重复运行不重复物化；确认产生一个当前契约买入事实，并发确认与失败回滚不产生重复或孤立事实。
  - 验证：先运行定向回归，再运行隔离数据库 HTTP/调度测试；记录迁移输入、账户约束、事实版本和清理结果。
- [x] T2.R2：验证计划与到期记录的生命周期
  - 覆盖：AC4；依赖 T2.R1。
  - 完成条件：版本冲突拒绝写入；暂停不补暂停月份；恢复从当前月开始；结束不物化；跳过及恢复不写账，已确认记录不可跳过或恢复。
  - 验证：复用 T2.R1 的隔离数据库和生产状态机，不使用存储替身替代数据库原子性。
- [x] T2.R3：完成消费面和目标运行态验收
  - 覆盖：AC5、AC6；依赖 T2.R1、T2.R2。
  - 完成条件：Desktop 创建、管理、确认、跳过、恢复完整交互；非真实基金账户无入口；目标 Server/Automation 与当前代码一致并完成对应运行态验收。
  - 验证：Desktop 定向回归、typecheck/build、浏览器及目标 Docker；隔离数据库和静态渲染通过不能替代此项。

执行结果：保留已有未提交改动；隔离数据库只清理本次容器。目标只写入新建的专用固定输入验收账户，两项计划均已结束，固定任务 cron 已恢复；原账户和持久化卷未修改。三步证据均已齐备，T2 已勾选。

## 最终一致性 Review

- [x] Spec 中的全部验收标准均有对应实现
- [x] 所有已勾选任务均有验证证据
- [x] 所有任务依赖均已满足且无错误阻塞关系
- [x] 跨任务接口、类型和命名保持一致（如适用）
- [x] 不存在未解决的 Blocking 问题、占位描述或未定义的实现契约
- [x] 实现未超出 Spec 声明的范围
- [x] 测试策略、测试实现与验证结果一致
- [x] 测试与文档已同步更新
- [x] 必要实施 Step 均已验证；工作保持未提交
- [x] 未发现实现、Spec 与任务文档之间的不一致

### Review 结论

- 结论：AC1–AC6 的当前实现、隔离数据库、目标运行态与浏览器证据一致；全部任务完成，无未解决实施义务，可归档。
- 运行时：目标结构 head 为 `20261001120000_require_explicit_strategy_contract`；通过 infra 快更入口同步，实际 Scheduler 触发、确认幂等和成交可见均通过，未重建数据库。
- 证据边界：固定输入验收账户保留一笔买入供复核；不代表外部下单、真实基金平台成交、Electron 或原生设备验收。这些不属于本 Spec 的完成条件。
- 当前检查命令、统计及输入范围统一见[运行时证据](../../tasks/evidence/2026-10-04-recurring-fund-runtime.md)。以下为首次实施的历史验证记录，旧运行时阻塞与 lint 错误不能代表当前状态：
  - `pnpm --dir packages/schemas test`：9 个测试文件、106 项测试通过。
  - `pnpm --dir packages/api-client test`：1 个测试文件、10 项测试通过。
  - `pnpm --dir apps/server exec vitest run test/fund-plans/recurring-fund-investment.test.ts test/automation-runtime.test.ts test/cash-plans/recurring-cash-deposit.service.test.ts test/ledger/ledger-command.service.test.ts`：4 个测试文件、50 项测试通过（新增物化补期覆盖后，定投测试单独复跑 4 项通过）。
  - `pnpm --dir apps/desktop exec vitest run test/account-data.fund-investment.test.tsx test/account-data.ui.test.tsx test/account-data.cash.test.tsx`：3 个测试文件、26 项测试通过。
  - `pnpm --dir apps/server typecheck`、`pnpm --dir apps/desktop build`、迁移矩阵、模块边界与文件规模门禁通过；桌面构建仅有既有 chunk 体积提示。
  - 本次相关文件的定向 ESLint 通过；全仓 `guardrails:complexity` 被 `RiskRuleWorkbench.tsx` 中与本功能无关的既有 `@typescript-eslint/no-unnecessary-type-assertion` 错误拦截。
  - 浏览器：当前前端独立端口下，真实基金账户显示“基金定投”区域并可打开新建表单；证券账户不显示。旧 Server 返回新增接口 `404`，因此未执行提交和确认成交。
