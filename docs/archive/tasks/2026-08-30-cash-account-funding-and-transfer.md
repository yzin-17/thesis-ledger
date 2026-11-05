# 现金资金、划转与定期入账验收

> 完成结论（2026-11-01）：T1–T4、Scheduler/客户端、模拟 NM1/NM2 及真实飞书 NF1/NF2 全部通过。真实请求 1 次，飞书 HTTP 200、业务码 0，隔离 Outbox 为 `delivered / attemptCount=1`；三期合并、重复/竞争零新增，正常 12 表及配置/空路由保持，临时资源已清理。模型调用 0、费用 0，凭据不输出、不写正常配置。最终一致性复核通过，详见[真实验收与复核](../../evidence/2026-11-01-cash-notification-feishu-acceptance.md)。

<a id="priority"></a>
> 排期：**已完成并退出活动 P2**。本页保存资金/划转、客户端、Scheduler 和通知的完整验收证据；正常通知路由仍按用户边界保持为空，真实验收 Provider 仅在临时隔离库启用。
> [全局优先级与接续规则](../../tasks/README.md#priority-policy)。排期管理优先级，各验收叶仅按对应授权和实际证据更新。

> 证据接续：原 T1–T4 确定性验证、10-16 客户端、10-17 Scheduler 恢复及 11-01 模拟/真实通知分层证明各自条件，本地实现不替代真实验收。

> 10-17 已过条件：资金双向划转/修正链、未来入账、客户端、scheduled 正向及进程停机/并发恢复；专用进程和隔离 PostgreSQL 验证真实现金 handler，生成 1＋3 条后重放零新增，正常账户、扫描 cron 与通知配置保持。详见[原执行证据](../../evidence/2026-10-16-cash-runtime-acceptance.md#10-17-scheduler-进程与现金补期恢复)，其当时未验的外部通知由 NF2 接续。

> 原[10-03 状态对账](../reviews/2026-10-03-task-state-reconciliation.md)指出的客户端缺口已补齐；Canonical E03 与旧运行记录保留原范围，新增条件分别由上述证据补齐。

对应 Spec：[现金资金与内部划转](../../specs/2026-08-30-cash-account-funding-and-transfer.md)

- [x] 2026-10-16 失败路径修复：定期确认、计划保存和划转修正改用现有表单级 Alert；实际挂载回归、受控 409、真实余额不足、保留输入和重试通过。
- [x] 2026-10-16 账本消费修复：现金流显示方向、原始金额和币种，非空表格不再使用空态名称；定向回归通过。
- [x] 2026-10-16 未来入账修正：未来修改/作废及已消费入账移到未来四条回归先失败后通过；正式 `sync-code.sh thesis-ledger` 更新后，原被拒绝的 10 CNY 入账成功作废。

状态：原 T1–T4 及本页定期入账全部产品验收完成，最终复核通过。

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

- 结论：通过；两份 Spec 的全部 AC 均有对应实现与适当分层证据，当前现金 Task 无未交付义务，可以归档。详见[逐项复核](../../evidence/2026-11-01-cash-notification-feishu-acceptance.md#最终一致性复核)。
- 发现的问题：本轮预检和真实请求均无失败；前序生成代码转义失败、已修复反例和历史测试失败保留，不改写为首次全绿。
- 验证边界：真实飞书明确业务成功回执证明服务端接收；失败恢复由模拟证据证明，不声称成员已读。正常配置/路由保持，后续自动启用不属于本次验收。
- 原 T4 Desktop 定向 2 文件 18/18、Server 投影 6/6、Desktop 类型/构建及后续客户端、Scheduler 证据按输入复用；本轮 11 项守卫、5 脚本语法/格式、共享入口模拟回归、真实单请求和数据保护通过。没有重跑业务全量、构建镜像或提交代码。

<a id="recurring-cash-acceptance"></a>
## 定期现金入账的产品验收

对应 [定期入账 Spec](../../specs/2026-08-30-recurring-cash-deposit-plan.md)及 [T1–T4 原实施记录](2026-08-30-recurring-cash-deposit-plan.md)。原确定性状态、事务、日期及客户端回归已经完成；以下是原要求中未取得实际证据的执行面、通知与消费面，不重做原实现，也不重跑输入未变的通过证据。其他 Scheduler lease/进程恢复仍归其原 Task，不由本节证明。

- [x] NM1｜建立可复用模拟通知维护入口与安全预检：`scripts/cash-notification-mock-smoke.mjs`、对应 contract/runtime 及 Node 守卫测试已完成。固定项目、同令牌 tmpfs 资源、既有本地镜像、编译输入、独立库身份和清理边界已校验；语法、格式及 8 项守卫通过。首轮生成代码的转义失败已修复并保留反例，未修改业务源码或启动入口。见[证据与输入](../../evidence/2026-11-01-cash-notification-mock-provider.md)。
- [x] NM2｜执行模拟通知闭环：复用原 Scheduler 进程恢复证据，补齐真实现金 handler → 隔离 PostgreSQL/Redis → Outbox/Dispatcher → 飞书适配器 → 回环 HTTP。5 场景通过，最终轮 8 次本机请求；13 条待确认、4 条 Outbox、8 条投递健康记录和失败三次封顶符合合同，重复/竞争零新增，隔离账本事件为 0。正常 12 表摘要及 Server/Redis 身份保持，两项临时资源已清理；本叶仅证明模拟条件，真实接收由 NF2 独立证明。见[最终回执与逐项结果](../../evidence/2026-11-01-cash-notification-mock-provider.md)。

- [x] NF1｜真实飞书单次验收入口完成：固定解析 `~/.zshrc:FEISHU_HOOK`，不执行 Shell，拒绝表达式/重复项/非官方目标，经 stdin 传递并脱敏。11 项守卫、5 脚本语法/格式及共享入口模拟回归通过，业务源码、正常配置/路由、凭据文件保持。见[入口与检查](../../evidence/2026-11-01-cash-notification-feishu-acceptance.md)。
- [x] NF2｜一次真实通知通过：向该 Webhook 绑定群提交一个隔离计划的三期验收汇总，飞书确认 HTTP 200、业务码 0，Outbox 为 `delivered / attemptCount=1`；双 Dispatcher、重复/竞争零新增。真实请求仅 1 次，模型 0、费用 0，正常 12 表摘要一致且临时资源清理通过；失败恢复复用 NM2，飞书接收不等于成员已读。见[真实回执及最终复核](../../evidence/2026-11-01-cash-notification-feishu-acceptance.md)。

- [x] 定期入账 T3 的 Scheduler、补期/恢复及外部汇总通知均已验收，不以参数捕获替代真实接收。
  - 覆盖验收标准：AC2、AC5、AC6、AC7
  - 依赖：T1、T2
  - 涉及范围：Automation Job 类型、固定扫描任务、Handler、日期纯函数和运行历史。
  - 完成条件：单例任务扫描所有到期计划；补齐全部启用期漏期；暂停月份跳过；并发运行不重复；补期通知按计划合并。
  - 验证方式：日期纯函数、Automation service/runtime/scheduler、并发与重启恢复测试，真实 Scheduler 运行演练。
  - 验证证据：
    - [x] 10-16 日期/Service/Automation runtime 回归及目标手动 1＋3 条、重跑零新增；10-17 同一目标镜像内真实 Scheduler/现金 handler 的独立进程、隔离 PostgreSQL、补期/暂停/双实例竞争和 SIGKILL 恢复通过。见[逐项证据](../../evidence/2026-10-16-cash-runtime-acceptance.md#10-17-scheduler-进程与现金补期恢复)。
    - [x] 真实外部通知：NF2 使用用户提供的 Webhook 取得官方业务成功回执和 `delivered`，三期只一条、重复/竞争零新增；NM2 独立覆盖失败恢复。正常配置和空路由保持，资源清理通过，详见[分层证据](../../evidence/2026-11-01-cash-notification-feishu-acceptance.md)。

- [x] 定期入账 T4 的真实客户端、宽窄屏与键盘验收；覆盖确认实际金额/日期、跳过/恢复、账户切换及错误状态。
  - 覆盖验收标准：AC1、AC3、AC4、AC8
  - 依赖：T1、T3 的 Handler 执行面；真实 scheduled 与外部通知继续由上项独立验收。
  - 涉及范围：账户数据现金页、TanStack Query、计划/确认 Sheet、上下文菜单、通知/错误提示和 Desktop 测试。
  - 完成条件：现金账户可创建和管理计划；待确认实例突出显示；确认可修改实际金额与日期；跳过/恢复与错误状态清楚；不新增页面级 CSS。
  - 验证方式：Desktop API/UI 测试、typecheck、build、宽窄屏浏览器和键盘验收。
  - 验证证据：
    - 10-16 真实确认金额/日期、防重复、跳过/恢复、计划修改/启停、错误与重试、账户恢复及宽窄屏/键盘通过；专用对象已回收为停用/结束和保留审计状态。
    - 当前 Desktop 定向 35 项、全量 841 项、typecheck/build 及静态门禁通过；原通过的账户/Tab 清理与 Risk/Portfolio 证据继续复用。

原历史验证边界保留在对应证据；客户端按 10-16、Scheduler/进程恢复按 10-17、模拟与真实通知按 11-01 接续，当前全部义务已完成，没有迁入 TODO 的现金缺口。
