# 风险中心 AB 组合交互实施任务

对应规格：[`../specs/2026-08-23-risk-center-interaction.md`](../specs/2026-08-23-risk-center-interaction.md)

## 执行约束

- 保留其他代理和用户已有改动，不执行回退或提交 commit。
- 保持现有 Risk API、Query key、规则版本和事件/通知数据语义；本次确认的账户持仓目标方案允许扩展风险扫描上下文、RiskEvent 幂等字段和 Prisma 迁移。
- 说明性文档使用中文；样式优先现有原子类和 shadcn 组件，不新增传统 CSS。
- 已确认的表单/确认交互若缺少本地 shadcn primitive，允许在 `apps/desktop/src/components/ui/` 新增最小可访问 `ToggleGroup`、`Field`、`AlertDialog` wrapper；不得使用 `--overwrite`。
- 仅做 Desktop 风险中心定向验证，不把 typecheck/Vitest 当作浏览器或在线服务验收。

## 任务清单

- [x] T1：完成风险页面状态与模式上下文对齐
  - 复用 routes 层 `portfolioMode` 与 `portfolio`，移除 RiskCenter 本地模式状态；保留规则全局查询，事件按当前模式查询。

- [x] T2：拆分总览、规则工作台、事件和通知页签
  - 总览承载摘要、扫描、数据状态和更新时间；规则页采用左侧列表/右侧详情；事件和通知保留事实字段、中文状态和空态。

- [x] T3：实现共用规则编辑 Sheet
  - 新建/编辑复用同一编辑器，按 scope/kind 显示目标字段，处理百分比到 decimal 转换、内联校验、自然语言预览和立即启用。

- [x] T4：完善规则详情治理与测试结果
  - 详情支持人工测试结果、启停、编辑、审计和归档确认；移除 `window.confirm`，归档文案明确保留历史。

- [x] T5：补充风险针对性测试并维护文档证据
  - 覆盖规则输入转换/校验、模式查询隔离、扫描上下文、归档确认和关键静态 UI contract。

- [x] T6：执行定向验证与最终一致性 Review
  - 执行 desktop typecheck、风险相关 Vitest、`git diff --check`；检查 Spec、任务状态和实现边界一致，记录运行时验收缺口。
- [x] T7：落实 Review 反馈并补齐可访问交互
  - 使用 Field/FieldGroup 组织规则表单、使用 AlertDialog 承载归档确认；抽取事件行展示，补齐事件模式、审计快照和通知状态语义，并允许已停用规则继续归档。
- [x] T8：落实第二轮 Review 的共享组件与测试结果生命周期修正
  - 指标卡复用 Button 的共享 metric/tone variant，AlertDialog 关闭图标补齐 `data-icon`；总览复用完整 RiskEventTable，人工测试结果提升到 RiskCenter 并按规则版本匹配。
- [x] T9：完成最终 Standards 类型与异步处理收尾
  - 表单提交使用 `void` 包装异步处理，移除无用类型导入；规则类型拆分为已知 kind 与可兼容服务端未知 kind 的可读类型，避免冗余联合。
- [x] T10：处理最终 Spec Review 的 target、空组合和共享 Switch 边界
  - 编辑已有证券/账户规则切换组合范围时由 FieldError 阻止提交；RiskCenter 使用 portfolio 请求状态区分 loading/empty/ready；恢复 Switch 默认行为，仅保留风险语义 variant，并补充对应测试。
- [x] T11：统一跨页面模式入口
  - 投资组合、收益分析和风险中心在页面标题栏右上角复用共享 `PortfolioModeSwitch`，移除各页面重复的按钮组/ToggleGroup。
- [x] T12：统一模式状态与验证
  - 收益分析复用路由层 `portfolioMode`，补充共享 Switch 与页面 header contract 测试，并完成定向 typecheck、Vitest、ESLint、Prettier 和浏览器预览验证。
- [x] T13：按确认方案升级模式控件视觉
  - 共享 `PortfolioModeSwitch` 改为带页面口径标签的单层胶囊式 Switch；三页统一显示模拟模式提示，投资组合的加载、空组合和失败状态不丢失上下文。
- [x] T14：落实账户持仓目标与移动止损状态设计
  - 以 `Position.accountId + symbol` 作为持仓目标，使用 `Position.id` 识别生命周期；新增峰值状态、按规则隔离的下穿状态、RiskEvent `scanId`/`dedupeKey` 和旧规则待修复字段及迁移。
  - 服务端实现同生命周期保留峰值、清仓重建仓位重置峰值、多规则独立触发、并发原子认领、重复 `scanId` 去重、通知失败复用事件、陈旧行情跳过和全局证券受影响账户上下文。
  - 桌面端传递 `positionId`/数量、显示待修复状态并禁止未补齐目标的旧规则测试和启用；账户选择排除停用账户。

- [x] T15：修复触发状态模型与 Position 生命周期
  - 涉及范围：`apps/server/prisma/schema.prisma`、风险状态迁移、`RiskService`、`LedgerService`。
  - 完成条件：TriggerState 可保存 `positionId`；同一账户+标的的正持仓重建保留 Position ID，清仓后重建才生成新 ID。
  - 验证方式：Prisma validate/generate、迁移矩阵、Ledger 生命周期测试和移动止损状态机测试。

- [x] T16：实现普通规则通知失败跨 scanId 复用
  - 涉及范围：`RiskService` 的普通规则事件持久化、通知重试状态和风险状态迁移。
  - 完成条件：失败或无投递记录时复用原事件，成功通知后保持原有事件生成频率，同一 scanId 仍幂等。
  - 验证方式：不同 scanId 的失败重试、同 scanId 并发和恢复后新事件测试。

- [x] T17：补齐服务端账户+已导入标的校验
  - 涉及范围：风险规则创建/更新事务、规则契约测试。
  - 完成条件：新建和补齐待修复规则校验账户状态与当前 Position；清仓后的既有规则仍可维护。
  - 验证方式：跨账户同标的、无持仓、停用账户和清仓后编辑测试。

- [x] T18：补齐风险事件上下文与历史幂等键
  - 涉及范围：domain risk event、schemas、Prisma 迁移。
  - 完成条件：成本/止盈事件保留 Position 生命周期字段；历史 `dedupeKey` 回填后列为非空。
  - 验证方式：domain/schema contract、迁移 SQL 检查和事件持久化测试。

- [x] T19：完成本轮最终一致性 Review
  - 涉及范围：Spec、ADR、任务文档、实现和测试证据。
  - 完成条件：逐项核对 T14–T18 与 Spec 第 17–22 条验收标准，记录未覆盖的真实运行时风险。
  - 验证方式：定向 typecheck、Vitest、迁移矩阵、diff check 和最终 Review。

## 验证记录

- `pnpm --dir apps/desktop typecheck`：通过。
- `pnpm --dir apps/desktop test -- risk-center-interaction.test.tsx refactor-contract.test.ts`：通过；Vitest 实际运行 8 个相关 Desktop 测试文件、49 个测试，全部通过。
- `pnpm exec eslint apps/desktop/src/features/risk/RiskRuleEditorSheet.tsx apps/desktop/src/features/risk/risk.types.ts apps/desktop/src/features/risk/risk.format.ts apps/desktop/src/features/risk/RiskCenter.tsx apps/desktop/src/features/risk/RiskOverview.tsx apps/desktop/src/features/risk/RiskSections.tsx apps/desktop/src/features/risk/RiskRuleWorkbench.tsx apps/desktop/src/components/ui/button.tsx apps/desktop/src/components/ui/alert-dialog.tsx apps/desktop/test/risk-center-interaction.test.tsx --max-warnings=0`：通过。
- `pnpm exec eslint apps/desktop/src/app/routes.tsx apps/desktop/src/components/ui/switch.tsx apps/desktop/src/features/risk/RiskOverview.tsx apps/desktop/src/features/risk/RiskCenter.tsx apps/desktop/src/features/risk/RiskRuleEditorSheet.tsx apps/desktop/src/features/risk/risk.types.ts apps/desktop/test/risk-center-interaction.test.tsx --max-warnings=0`：通过。
- `pnpm exec prettier --write ...`：本任务涉及的风险 feature、routes、ToggleGroup、测试和文档已格式化。
- `pnpm exec prettier --check ...`：风险中心相关实现、共享 primitive、测试和文档格式检查通过。
- `pnpm migration:matrix`：22 个迁移目录校验通过。
- `DATABASE_URL=postgresql://localhost:5432/thesis_ledger pnpm --filter @thesis-ledger/server prisma validate`：Prisma schema 校验通过；`prisma generate` 通过。
- `pnpm typecheck`：全仓 build 与 typecheck 通过。
- `pnpm test`：全仓 8 个工作区项目测试通过（服务端 189、桌面端 52，其他包亦通过）。
- 针对本次状态机的 `pnpm --filter @thesis-ledger/server exec vitest run test/risk-state-machine.test.ts`：10 个测试通过；覆盖账户成本隔离、生命周期、峰值恢复、多规则、并发/scanId、全局事件、stale、通知重试和旧规则修复。
- 本次修改文件的定向 ESLint 通过；全仓 lint 仍受 `apps/mobile/node_modules/react-native/index.js` Flow 语法无法被当前 TypeScript ESLint parser 解析影响，未将该环境问题归因于本次改动。
- `pnpm --dir apps/desktop test -- risk-center-interaction.test.tsx refactor-contract.test.ts`：跨页面模式 Switch contract 纳入后，8 个文件、50 个测试全部通过。
- `pnpm --filter @thesis-ledger/server exec vitest run test/risk-state-machine.test.ts test/risk/services.test.ts test/ledger/services.test.ts`：20 个状态、规则和 Ledger 测试通过；覆盖普通规则跨 `scanId` 通知重试、账户目标校验、事件生命周期上下文和 Position 清仓重建。
- `pnpm --filter @thesis-ledger/schemas test`：42 个 schema/contract 测试通过，确认规则部分更新不会隐式启用已清仓规则。
- `pnpm --filter @thesis-ledger/domain test`：67 个 domain 测试通过，确认成本类事件保留持仓生命周期上下文。
- `pnpm test`：全仓 8 个工作区项目测试通过（服务端 194、桌面端 52，其他包亦通过）。
- `pnpm typecheck`：全仓 build 与 typecheck 通过。
- `DATABASE_URL=postgresql://localhost:5432/thesis_ledger pnpm --filter @thesis-ledger/server prisma validate`：Prisma schema 校验通过；`pnpm db:generate` 已重新生成 Prisma Client。
- `pnpm migration:matrix`：22 个迁移目录校验通过；迁移为历史事件回填 `legacy:<eventId>` 并将 `dedupeKey` 收紧为 `NOT NULL`。
- `pnpm exec eslint apps/server/src/risk/risk.service.ts apps/server/src/ledger/ledger.service.ts apps/server/test/risk-state-machine.test.ts apps/server/test/risk/services.test.ts apps/server/test/ledger/services.test.ts apps/server/test/security-data-integrity.test.ts packages/domain/src/risk/types.ts packages/domain/src/risk/price-rules.ts --max-warnings=0`：通过。
- `git diff --check`：通过。
- 浏览器预览：投资组合、收益分析和风险中心均在页面标题栏右上显示“实际 / 模拟” Switch；切换投资组合模式后仍可在空/无数据状态切回，未执行业务写入操作。
- 浏览器预览：三页均显示页面口径 + 胶囊式实际/模拟 Switch；模拟模式提示在投资组合、收益分析和风险中心可见，跨页导航后 `aria-checked` 保持为 `true`，未执行业务写入操作。
- shadcn CLI 的 `info/docs toggle-group` 以及 `docs field alert-dialog` 均因当前环境无法解析 registry DNS（`ENOTFOUND`）未能读取远端文档；已核对项目 `components.json`、`packageManager`、alias、icon library 和现有 Base UI 版本，并基于当前 `@base-ui/react` 实现最小可访问 ToggleGroup、Field、AlertDialog wrapper，未使用 `--overwrite`。

## 最终一致性 Review

- [x] Spec 中的页面层级、模式边界、规则编辑、治理、事件/通知和新增生命周期验收标准均有对应实现。
- [x] 任务状态与已执行验证一致；风险扫描继续使用现有 endpoint，新增字段通过 schema、Prisma 迁移和 Query/Mutation 链路传递，未引入手写 fetch。
- [x] 本次修改在既有风险 feature/UI 改动之外，补齐了风险领域文档、Prisma 模型与迁移、domain/schema/server 状态机、桌面端上下文和针对性测试。
- [x] Review 反馈已处理：表单字段具备 `data-invalid`/`aria-invalid`，归档使用 AlertDialog，事件行共用且支持 limit，事件模式不再回退伪造，审计展示 actor/before/after，通知包含 delivered/retrying/未知状态，已停用规则仍可归档。
- [x] 第二轮 Review 反馈已处理：指标卡使用共享 Button variant，AlertDialog 图标符合 `data-icon` 约定，总览与事件页共用 RiskEventTable，人工测试结果由 RiskCenter 持有并在规则版本变更后失效。
- [x] 最终 Standards 反馈已处理：表单 `onSubmit` 不直接接收 Promise，类型导入无未使用项，`RiskRuleKind` 不再与 `string` 形成冗余联合。
- [x] 最终 Spec 反馈已处理：target 无法清理时阻止不安全 scope 转换，空组合不再被视为加载中，theme-toggle 不受风险 Switch 样式影响。
- [x] 用户后续反馈已处理：跨页面模式入口统一为共享 Switch，收益分析复用路由层 `portfolioMode`，投资组合的加载/错误/空组合状态仍保留右上模式入口。
- [x] 用户确认方案已处理：模式控件改为单层胶囊式视觉，补充页面口径标签和共享模拟模式提示，并覆盖投资组合所有请求状态。
- [x] 账户持仓目标方案已处理：Asset 不绑定账户，Position 保持账户聚合唯一键；峰值与下穿状态分离，按 mode 隔离，旧规则停用并标记待修复；Ledger 重建保持生命周期 ID。
- [x] 未执行浏览器、Electron、在线 Provider 或真实通知验收；这些由主代理后续 Review/运行环境确认。

### 结论

本轮已完成账户持仓目标与移动止损状态方案：TriggerState 保存 Position 生命周期，Ledger 重建保持同生命周期 ID，普通规则通知失败跨 scanId 复用原事件，服务端校验账户与当前持仓，事件上下文和历史幂等键完成迁移。定向与全仓确定性验证通过；浏览器、Electron、在线 Provider 和真实通知仍未执行。
