# Cash 资金、划转与定期入账验收

<a id="priority"></a>
> 排期（2026-10-18）：**P2｜仅外部补期汇总通知，待渠道与发送授权**。资金、划转、客户端和 Scheduler 恢复的已过项不重做；路由为空时不重复执行或自行配置。资金正确性缺陷另按 P0 修复，不被本页通知排期拖后。
> [全局优先级与接续规则](README.md#priority-policy)。本次仅调整文档，不改变下列原任务编号、checkbox、验收条件或执行授权。

> 2026-10-15 当前责任：本页维护资金/划转原验收及定期入账的真实 Scheduler、通知和客户端条件；本地实现完成不等于产品验收通过。原 T1–T4 的历史 Review 仅覆盖原资金/划转范围，未覆盖条件继续有效。

> 2026-10-17 当前结果：资金双向划转/修正链、未来入账、客户端、scheduled 正向及进程停机/并发恢复已通过；后者在当前 Compose 镜像内用专用执行进程和隔离 PostgreSQL 验证真实现金 handler，生成 1＋3 条后重放零新增。正常账户、扫描 cron 与通知配置保持。现在只剩外部补期汇总通知，路由为空时不重复执行、不自行配置渠道。详见[当前证据](evidence/2026-10-16-cash-runtime-acceptance.md#10-17-scheduler-进程与现金补期恢复)。

> 原[10-03 状态对账](../archive/reviews/2026-10-03-task-state-reconciliation.md)指出的客户端缺口已补齐；Scheduler 独立进程条件由 10-17 新证据接续。Canonical E03 与旧运行记录只证明原范围，不替代仍开放的外部通知。

对应 Spec：[`../specs/2026-08-30-cash-account-funding-and-transfer.md`](../specs/2026-08-30-cash-account-funding-and-transfer.md)

- [x] 2026-10-16 失败路径修复：定期确认、计划保存和划转修正改用现有表单级 Alert；实际挂载回归、受控 409、真实余额不足、保留输入和重试通过。
- [x] 2026-10-16 账本消费修复：现金流显示方向、原始金额和币种，非空表格不再使用空态名称；定向回归通过。
- [x] 2026-10-16 未来入账修正：未来修改/作废及已消费入账移到未来四条回归先失败后通过；正式 `sync-code.sh thesis-ledger` 更新后，原被拒绝的 10 CNY 入账成功作废。

状态：T1-T4 已完成并验证。

## 跨任务契约

- `InvestmentAccountScope`：组合级查询只返回启用的 `securities | fund` 账户；显式账户查询不应用该过滤。
- `CashTransferMetadata`：`transferId + counterpartyAccountId + leg`，只允许用于 `CASH_FLOW / TRANSFER`。
- `accountScopePolicy`：新组合快照固定为 `investment-only-v1`。
- `ManualCashDeposit`：一次性外部入账使用 `CREATE_CASH_FLOW`，固定为 `INFLOW / DEPOSIT`，写入真实现金账户；不携带划转元数据。

## 任务

- [x] T1：完成外部现金流和内部现金划转 Ledger 闭环
  - 覆盖验收标准：AC3、AC4、AC5
  - 依赖：无
  - 涉及范围：Domain/Schema、Ledger 多账户命令、Controller、现金投影、Revision 与幂等测试。
  - 完成条件：现金流和划转拥有专用命令；划转原子写入两个关联事实；创建、更正、作废和恢复通过同一命令模块；余额不足不会产生单边事件。
  - 验证方式：Schema 测试、Ledger 命令/Repository/现金投影定向测试、双账户并发测试、`git diff --check`。
  - 验证证据：
    - `pnpm --filter @thesis-ledger/schemas exec vitest run test/ledger-v2.test.ts`：1 个测试文件、42 个测试通过；覆盖新的 TRANSFER 元数据约束与独立 legacy 迁移读取契约。
    - `pnpm --filter @thesis-ledger/schemas build`：通过。
    - 最终显式 normalize 版本的 `pnpm --filter @thesis-ledger/server exec vitest run test/ledger/core-projection.test.ts`：1 个测试文件、5 个测试通过，legacy 划转进出和 malformed event 显式失败回归保持通过。
    - Server 定向回归命令覆盖现金投影、现金 Ledger 命令、通知、Risk、定期入账和 HTTP 校验：10 个测试文件、78 个测试通过；包含 legacy 划转进出仍计入投影及当前 malformed event 显式失败。
    - `node scripts/check-boundaries.mjs`：通过；`pnpm --filter @thesis-ledger/server typecheck`：通过。

- [x] T2：收敛投资组合账户范围并保护快照口径
  - 覆盖验收标准：AC1、AC2、AC6
  - 依赖：T1
  - 涉及范围：Portfolio、Performance、目标配置、Snapshot payload、Automation Snapshot 和组合消费者。
  - 完成条件：所有组合级消费者复用同一账户范围；现金账户显式查询不受影响；新旧快照口径不会混算收益；同步待实现 Snapshot V2 Spec/Task。
  - 验证方式：Portfolio/Performance/Automation 定向测试、旧快照 fixture、迁移矩阵和契约测试。
  - 验证证据：
    - Portfolio/Performance 定向测试：2 个测试文件、27 个测试通过，覆盖组合排除、显式现金账户读取和新旧快照拒绝混算。
    - Automation Runtime 回归：9 个测试通过；Snapshot handler 使用统一投资账户范围。
    - Server typecheck 与 `scripts/check-boundaries.mjs` 通过。
    - 已同步 `2026-08-28-portfolio-snapshot-system` Spec/Task 的 `accountScopePolicy` 契约。

- [x] T3：交付 Desktop 手动现金划转入口
  - 覆盖验收标准：AC2、AC7
  - 依赖：T1、T2
  - 涉及范围：账户数据现金页、TanStack Query、Sheet 表单、DropdownMenu 修正入口、Desktop 测试。
  - 完成条件：用户能在现金账户与证券或基金账户间双向划转；前端校验与 Server 契约一致；成功后精确刷新账户、Ledger、估值和收益查询；失败保留输入。
  - 验证方式：Desktop API/UI 测试、typecheck、build、窄屏与桌面宽度浏览器验收。
  - 验证证据：
    - Desktop 定向回归命令覆盖现金操作、账户切换、持仓观察空态、Risk 和 Portfolio：5 个测试文件、34 个测试通过。
    - `pnpm --filter @thesis-ledger/desktop typecheck`：通过。
    - 本轮未执行浏览器或 Compose 运行时验收，不将其作为本轮证据。

- [x] T4：交付 Desktop 一次性现金入账入口并支持未来资金
  - 覆盖验收标准：AC3、AC8
  - 依赖：T1、T2
  - 涉及范围：账户数据现金页、现金流 API 适配、TanStack Query、现金入账 Sheet、错误反馈和状态清理测试。
  - 完成条件：真实现金账户可填写金额、预计或实际到账时间和备注并写入外部 `DEPOSIT`；未来时间进入待结算应收且不计入已结算余额；成功后刷新账户 Ledger、审计与估值；关闭或提交后不保留输入和错误；不复用现金快照或账户间划转。
  - 验证方式：Desktop API/UI 测试、typecheck、build、宽窄屏浏览器和键盘验收。
  - 验证证据：
    - `pnpm exec vitest run test/account-data.cash.test.tsx test/account-data.ui.test.tsx`：2 个测试文件、18 个测试通过，覆盖外部 `DEPOSIT` 命令、`settledAt`、幂等命令 ID、入口账户条件、未来资金反馈、关闭状态清理、错误文案和查询失效。
    - `pnpm exec vitest run test/ledger/core-projection.test.ts`：1 个测试文件、6 个测试通过，覆盖未来外部入账在结算前只进入 `pendingReceivable`，结算后才进入 `settledAmount`。
    - `pnpm exec tsc -p tsconfig.json --noEmit`：通过。
    - `pnpm --filter @thesis-ledger/desktop build`：通过；Vite 仅报告既有 chunk size warning。
    - `pnpm exec prettier --check`：相关源码、测试和文档通过。
    - `git diff --check`：通过。
    - 本轮未执行浏览器、键盘和真实服务验收，不将其作为运行时证据。

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

- 结论：T1-T4 的实现、契约、测试和文档已保持一致，未来资金的结算边界已由 Desktop 命令测试和服务端投影测试共同验证。
- 发现的问题：无确定性测试失败。
- 遗留风险：本轮未执行浏览器、键盘、Compose/真实服务运行、真实迁移部署和外部通知投递；这些不影响已完成的确定性 API/UI、投影、typecheck、build、格式和 diff 检查结论。
- 验证命令与结果：保留前序 T1-T3 证据；T4 Desktop 定向测试 2 个文件 18/18、Server 投影测试 6/6、Desktop typecheck、Desktop build、Prettier 和 `git diff --check` 均通过。

<a id="recurring-cash-acceptance"></a>
## 定期现金入账的剩余产品验收

对应 [定期入账 Spec](../specs/2026-08-30-recurring-cash-deposit-plan.md)及 [T1–T4 原实施记录](../archive/tasks/2026-08-30-recurring-cash-deposit-plan.md)。原确定性状态、事务、日期及客户端回归已经完成；以下是原要求中未取得实际证据的执行面、通知与消费面，不重做原实现，也不重跑输入未变的通过证据。其他 Scheduler lease/进程恢复仍归其原 Task，不由本节证明。

- [ ] 定期入账 T3 的外部补期汇总通知；Scheduler、补期和恢复条件已补，不以参数捕获替代送达。
  - 覆盖验收标准：AC2、AC5、AC6、AC7
  - 依赖：T1、T2
  - 涉及范围：Automation Job 类型、固定扫描任务、Handler、日期纯函数和运行历史。
  - 完成条件：单例任务扫描所有到期计划；补齐全部启用期漏期；暂停月份跳过；并发运行不重复；补期通知按计划合并。
  - 验证方式：日期纯函数、Automation service/runtime/scheduler、并发与重启恢复测试，真实 Scheduler 运行演练。
  - 验证证据：
    - [x] 10-16 日期/Service/Automation runtime 回归及目标手动 1＋3 条、重跑零新增；10-17 同一目标镜像内真实 Scheduler/现金 handler 的独立进程、隔离 PostgreSQL、补期/暂停/双实例竞争和 SIGKILL 恢复通过。见[逐项证据](evidence/2026-10-16-cash-runtime-acceptance.md#10-17-scheduler-进程与现金补期恢复)。
    - [ ] 外部通知：当前路由为空，尚无真实投递/失败恢复结果；不启用新渠道或发送消息来关闭此项。

- [x] 定期入账 T4 的真实客户端、宽窄屏与键盘验收；覆盖确认实际金额/日期、跳过/恢复、账户切换及错误状态。
  - 覆盖验收标准：AC1、AC3、AC4、AC8
  - 依赖：T1、T3 的 Handler 执行面；真实 scheduled 与外部通知继续由上项独立验收。
  - 涉及范围：账户数据现金页、TanStack Query、计划/确认 Sheet、上下文菜单、通知/错误提示和 Desktop 测试。
  - 完成条件：现金账户可创建和管理计划；待确认实例突出显示；确认可修改实际金额与日期；跳过/恢复与错误状态清楚；不新增页面级 CSS。
  - 验证方式：Desktop API/UI 测试、typecheck、build、宽窄屏浏览器和键盘验收。
  - 验证证据：
    - 10-16 真实确认金额/日期、防重复、跳过/恢复、计划修改/启停、错误与重试、账户恢复及宽窄屏/键盘通过；专用对象已回收为停用/结束和保留审计状态。
    - 当前 Desktop 定向 35 项、全量 841 项、typecheck/build 及静态门禁通过；原通过的账户/Tab 清理与 Risk/Portfolio 证据继续复用。

原最终 Review 的历史验证边界保留在原记录；新增通过条件只按 10-16 证据更新，未通过的 Scheduler、进程恢复和通知要求继续有效，不增加账号或付费要求。
