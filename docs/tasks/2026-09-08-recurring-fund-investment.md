# 基金定投计划实施任务

对应 Spec：[`../specs/2026-09-08-recurring-fund-investment.md`](../specs/2026-09-08-recurring-fund-investment.md)

状态：实现完成，待运行时验收。

## 任务

- [x] T1：交付基金定投计划、到期记录与确认成交的服务端闭环
  - 覆盖验收标准：AC1、AC2、AC3、AC4、AC6
  - 依赖：无
  - 涉及范围：Prisma 模型与迁移、共享 Schema/API Client、定投 Module/Controller/Service、Ledger 原子确认接口、Server/Schema 测试。
  - 完成条件：计划与到期记录状态机完整；创建范围受账户和标的约束；确认与 `BUY_EXECUTION` 原子且幂等；既有 Ledger 与定期现金入账回归通过。
  - 验证方式：Schema、Service、Ledger、迁移矩阵、边界检查和 typecheck。

- [ ] T2：接入现有 Scheduler 并交付成交页基金定投界面
  - 覆盖验收标准：AC2、AC4、AC5、AC6
  - 依赖：T1
  - 涉及范围：Automation 类型/Handler/固定任务、Desktop TanStack Query、成交页定投区与 Sheets、定向 UI 测试。
  - 完成条件：调度可补齐到期记录；真实基金账户显示完整入口；可创建和管理计划、确认/跳过/恢复到期记录；其他账户不出现入口。
  - 验证方式：Automation runtime 测试、Desktop API/UI 测试、typecheck、build 和浏览器交互验收。

## 最终一致性 Review

- [x] Spec 中的全部验收标准均有对应实现
- [x] 所有已勾选任务均有验证证据
- [x] 所有任务依赖均已满足且无错误阻塞关系
- [x] 跨任务接口、类型和命名保持一致（如适用）
- [x] 不存在未解决的 Blocking 问题、占位描述或未定义的实现契约
- [x] 实现未超出 Spec 声明的范围
- [x] 测试策略、测试实现与验证结果一致
- [x] 测试与文档已同步更新
- [ ] 必要实施 Step 均已验证；未获提交授权，工作保持未提交
- [x] 未发现实现、Spec 与任务文档之间的不一致

### Review 结论

- 结论：代码实现与确定性验证完成；T2 保留当前 Server/数据库运行时验收边界，暂不归档。
- 发现的问题：本机 `3000` 端口运行的旧 Server 尚未包含新增接口，访问定投计划接口返回 `404`；项目只保留 fresh baseline，未在本轮重建现有数据库。
- 遗留风险：尚未在包含新 baseline 的新 Server 上实际创建计划、物化到期记录并确认成交；当前前端已验证基金账户入口和新建表单，证券账户不显示入口。
- 验证命令与结果：
  - `pnpm --dir packages/schemas test`：9 个测试文件、106 项测试通过。
  - `pnpm --dir packages/api-client test`：1 个测试文件、10 项测试通过。
  - `pnpm --dir apps/server exec vitest run test/fund-plans/recurring-fund-investment.test.ts test/automation-runtime.test.ts test/cash-plans/recurring-cash-deposit.service.test.ts test/ledger/ledger-command.service.test.ts`：4 个测试文件、50 项测试通过（新增物化补期覆盖后，定投测试单独复跑 4 项通过）。
  - `pnpm --dir apps/desktop exec vitest run test/account-data.fund-investment.test.tsx test/account-data.ui.test.tsx test/account-data.cash.test.tsx`：3 个测试文件、26 项测试通过。
  - `pnpm --dir apps/server typecheck`、`pnpm --dir apps/desktop build`、迁移矩阵、模块边界与文件规模门禁通过；桌面构建仅有既有 chunk 体积提示。
  - 本次相关文件的定向 ESLint 通过；全仓 `guardrails:complexity` 被 `RiskRuleWorkbench.tsx` 中与本功能无关的既有 `@typescript-eslint/no-unnecessary-type-assertion` 错误拦截。
  - 浏览器：当前前端独立端口下，真实基金账户显示“基金定投”区域并可打开新建表单；证券账户不显示。旧 Server 返回新增接口 `404`，因此未执行提交和确认成交。
