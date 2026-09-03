# 现金快照与现金流投影优化实施任务

对应 Spec：[`../specs/2026-09-03-cash-snapshot-projection-optimization.md`](../specs/2026-09-03-cash-snapshot-projection-optimization.md)

状态：T1-T6 已完成并验证。

## 跨任务契约

- `CashSnapshot.asOf`：快照事件的 `occurredAt`/`capturedAt` 表示实际已结算状态的边界时间。
- `CashFlow.expectedAt`：预计现金生效时间；只能用于预计到账或扣款，不能替代实际 `settledAt`。
- `CashFlow.settledAt`：实际完成结算的时间；新数据不使用未来值表达预计状态。
- `CashFlowProjectionEffectiveTime`：按 `settledAt ?? expectedAt ?? occurredAt` 统一计算，历史兼容回退必须集中处理。

## 任务

- [x] T1：补充现金流预计生效时间契约
  - 覆盖验收标准：AC5、AC6、AC8
  - 依赖：无
  - 涉及范围：Schema、现金流/成交/分红/划转相关类型与命令 payload 的可选 `expectedAt` 字段。
  - 完成条件：新旧事件均能解析；`expectedAt` 与 `settledAt` 语义可区分；非现金领域不增加无关字段。
  - 验证方式：Schema 测试、命令构造测试和类型检查。
  - 验证证据：
    - `pnpm exec vitest run test/ledger-v2.test.ts`：1 个测试文件、42 个测试通过，覆盖 `expectedAt` 在现金流、成交、分红和划转命令中的契约。
    - Server/Desktop typecheck：通过。

- [x] T2：统一现金流生效时间和历史兼容推断
  - 覆盖验收标准：AC2、AC3、AC5、AC6
  - 依赖：T1
  - 涉及范围：`apps/server/src/ledger/cash-projection.ts` 及其纯函数测试。
  - 完成条件：所有现金操作通过统一生效时间和结算状态计算；旧数据缺少预计时间时使用显式、有限 fallback；未来 `occurredAt` 不被无条件视为已结算。
  - 验证方式：现金投影单元测试和历史兼容测试。
  - 验证证据：
    - `pnpm exec vitest run test/ledger/core-projection.test.ts test/ledger/services.test.ts test/ledger/cash-ledger-command.service.test.ts test/performance/services.test.ts test/cash-plans/recurring-cash-deposit.service.test.ts`：5 个测试文件、48 个测试通过，覆盖统一生效时间、未来 pending、旧数据 fallback 和直接消费者。
    - `pnpm exec tsc -p tsconfig.json --noEmit`（Server）：通过。

- [x] T3：增加快照 replay 边界
  - 覆盖验收标准：AC1、AC2、AC3、AC4、AC7
  - 依赖：T2
  - 涉及范围：现金快照选择、按账户/币种确定最近快照、现金余额与待结算物化逻辑。
  - 完成条件：只重放 `effectiveAt > snapshot.asOf && effectiveAt <= targetAt` 的现金流；连续快照、同一时点和快照前发生但快照后结算的场景均正确。
  - 验证方式：现金投影测试覆盖 Spec 第 12 节全部场景。
  - 验证证据：
    - `test/ledger/core-projection.test.ts`：14 个测试通过，覆盖快照后现金流、快照前已结算流、发生早但预计晚结算、提前实际结算、连续快照、同一时点边界和历史快照时间回退。
    - `projectCashBalances(stored, targetAt)` 与 `projectCashMaterialization(stored, targetAt)` 使用同一目标时间边界，回归测试通过。

- [x] T4：迁移现金生产者与直接消费者
  - 覆盖验收标准：AC5、AC8
  - 依赖：T1、T2、T3
  - 涉及范围：现金入账、成交/分红/划转 producer，Core Projection、Portfolio、Performance、账户现金校验和历史快照读取。
  - 完成条件：新写入路径不再用未来 `settledAt` 表达预计时间；所有直接消费者使用统一目标时间和快照边界；不修改 Position、Trade 和成本领域行为。
  - 验证方式：Server/Portfolio/Performance 定向测试、边界检查和类型检查。
  - 验证证据：
    - `pnpm exec vitest run test/account-data.cash.test.tsx test/account-data.ui.test.tsx`：2 个测试文件、19 个测试通过，覆盖未来现金入账使用 `expectedAt`、现金页待结算显示和 VOID 事件守卫。
    - `pnpm exec vitest run test/cash-plans/recurring-cash-deposit.service.test.ts test/performance/services.test.ts`：24 个测试通过，覆盖实际确认写入 `settledAt`、历史 `capturedAt` 和当前 `valuedAt`。

- [x] T5：完成回归测试和文档同步
  - 覆盖验收标准：AC1-AC8
  - 依赖：T1、T2、T3、T4
  - 涉及范围：Schema、Server、Performance、Portfolio 测试，`CONTEXT.md`、领域文档和相关现金账户 Spec/Task。
  - 完成条件：测试覆盖所有边界；领域词汇、Spec、Task 与实现一致；未引入数据删除或无关重构。
  - 验证方式：定向回归、typecheck、build、`git diff --check`；浏览器/真实服务证据单独记录。
  - 验证证据：
    - Server build：通过；Desktop build：通过，Vite 仅报告既有 chunk size warning。
    - `pnpm exec prettier --check`：本次新增/修改的 Desktop 源码和测试通过；`apps/server/src/ledger/ledger.service.ts` 保留既有未格式化段落，未为此扩大变更范围。
    - `git diff --check`：通过。
    - `CONTEXT.md`、领域文档、优化 Spec/Task 和现金账户 Spec/Task 已同步。
    - 本轮未执行浏览器、键盘、Compose/真实服务、数据库运行时、迁移部署或外部通知投递验收，不将其作为确定性实现证据。

- [x] T6：为手工现金快照增加可控的 asOf 时间
  - 覆盖验收标准：AC1、AC7、AC9
  - 依赖：T3、T4
  - 涉及范围：现金快照 Drawer、Desktop Portfolio API/Mutation、Portfolio/ Ledger 快照写入链路和测试。
  - 完成条件：快照时间默认当前、允许过去、拒绝未来；服务端使用输入时间写入 `occurredAt/capturedAt`，提交时间仍作为 `recordedAt`；关闭和重开不残留时间或错误；不把未来资金写成快照。
  - 验证方式：Desktop UI/API 测试、Server Ledger/Portfolio 测试、两端 typecheck、build 和 `git diff --check`。
  - 验证证据：
    - `pnpm exec vitest run test/ledger/services.test.ts`：1 个测试文件、5 个测试通过，覆盖历史快照时间、实际写入时间和未来时间拒绝。
    - `pnpm exec vitest run test/refactor-contract.test.ts test/account-data.ui.test.tsx test/account-data.cash.test.tsx`：3 个测试文件、42 个测试通过，覆盖快照时间请求、默认/限制入口和现金回归行为。
    - 现金快照和定期入账计划的提交操作均使用 `SheetFooter`；表单内容区可滚动，关闭后不保留输入和错误状态。
    - Server/Desktop `pnpm exec tsc -p tsconfig.json --noEmit`：通过；Server `pnpm exec nest build`：通过；Desktop `pnpm exec vite build`：通过，保留既有 chunk size warning。
    - `git diff --check`：通过。

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

- 结论：T1-T6 已完成，Spec、Task 与实现一致。
- 发现的问题：无阻塞问题。
- 遗留风险：浏览器真实交互、Compose/真实服务、数据库运行时和迁移部署验收仍未执行；历史数据 fallback 风险保持不变。
- 验证命令与结果：T1-T5 证据保留；T6 的 Server/Desktop 测试、typecheck、build 和 `git diff --check` 均已通过。
